// Sauvegarde COMPLÈTE de la base MongoDB, sans aucun outil à installer (utilise mongoose, déjà là).
// Chaque collection est écrite en JSON étendu compressé (.json.gz) : les ObjectId, dates et nombres sont
// conservés à l'identique, pour pouvoir tout restaurer avec restore-db.js.
//
//   node backup-db.js                          → dossier daté dans  <Mes documents>/Sauvegardes-CAMI
//   node backup-db.js --out="D:\Sauvegardes"   → dossier daté dans  D:\Sauvegardes
//   node backup-db.js --keep=10                → ne garde que les 10 sauvegardes les plus récentes
//
// La base n'est que LUE : rien n'est modifié. Les PDF (BL, factures, documents projets) ne sont pas dans
// la base mais sur Cloudflare R2 : ils ne font pas partie de cette sauvegarde.

require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const mongoose = require('mongoose');

const { EJSON } = mongoose.mongo.BSON;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aluminum-inventory';
const arg = (name) => (process.argv.find(a => a.startsWith(`--${name}=`)) || '').split('=').slice(1).join('=').replace(/^"|"$/g, '');
const baseDir = arg('out') || path.join(os.homedir(), 'Documents', 'Sauvegardes-CAMI');
const keep = parseInt(arg('keep'), 10) || 0;

const stamp = () => {
  const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}h${p(d.getMinutes())}`;
};

// One collection → <name>.json.gz : a JSON array written document by document (no size limit)
async function dumpCollection(db, name, file) {
  const gz = zlib.createGzip();
  const out = fs.createWriteStream(file);
  gz.pipe(out);
  const write = (s) => (gz.write(s) ? Promise.resolve() : new Promise(r => gz.once('drain', r)));
  let n = 0;
  await write('[\n');
  for await (const doc of db.collection(name).find({})) {
    await write((n ? ',\n' : '') + EJSON.stringify(doc, { relaxed: false }));
    n++;
  }
  await write('\n]\n');
  gz.end();
  await new Promise((resolve, reject) => { out.on('finish', resolve); out.on('error', reject); });
  return n;
}

(async () => {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  const dir = path.join(baseDir, `cami-${db.databaseName}-${stamp()}`);
  fs.mkdirSync(dir, { recursive: true });
  console.log(`Base : ${db.databaseName}`);
  console.log(`Dossier : ${dir}\n`);

  const collections = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map(c => c.name).filter(n => !n.startsWith('system.')).sort();
  const manifest = { database: db.databaseName, createdAt: new Date().toISOString(), collections: {} };
  let total = 0;
  for (const name of collections) {
    const n = await dumpCollection(db, name, path.join(dir, `${name}.json.gz`));
    manifest.collections[name] = n;
    total += n;
    console.log(`  ${name.padEnd(28)} ${String(n).padStart(7)} document(s)`);
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const size = fs.readdirSync(dir).reduce((s, f) => s + fs.statSync(path.join(dir, f)).size, 0);
  console.log(`\n✅ Sauvegarde terminée : ${collections.length} collections, ${total} documents, ${(size / 1024 / 1024).toFixed(2)} Mo`);

  // Oldest backups removed, the `keep` most recent kept
  if (keep > 0) {
    const old = fs.readdirSync(baseDir)
      .filter(f => f.startsWith(`cami-${db.databaseName}-`) && fs.existsSync(path.join(baseDir, f, 'manifest.json')))
      .sort().reverse().slice(keep);
    for (const f of old) { fs.rmSync(path.join(baseDir, f), { recursive: true, force: true }); console.log(`  (ancienne sauvegarde supprimée : ${f})`); }
  }
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error('❌ Sauvegarde impossible :', e.message);
  try { await mongoose.disconnect(); } catch { }
  process.exit(1);
});
