// Restauration d'une sauvegarde faite avec backup-db.js.
//
//   node restore-db.js --from="C:\...\cami-xxx-2026-10-20_10h30"
//        → APERÇU seulement : nombre de documents dans la sauvegarde / dans la base, rien n'est modifié
//   node restore-db.js --from="..." --confirm
//        → remet les documents MANQUANTS (supprimés depuis) ; ceux qui existent ne sont pas touchés
//   node restore-db.js --from="..." --confirm --replace
//        → remet la base EXACTEMENT comme dans la sauvegarde : chaque collection est vidée puis rechargée
//          (ce qui a été créé / modifié depuis la sauvegarde est perdu)
//   --db=cami-verif   → restaure dans une AUTRE base (même serveur), pour vérifier sans toucher la vraie
//   --only=items,orders → seulement ces collections

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const mongoose = require('mongoose');

const { EJSON } = mongoose.mongo.BSON;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aluminum-inventory';
const arg = (name) => (process.argv.find(a => a.startsWith(`--${name}=`)) || '').split('=').slice(1).join('=').replace(/^"|"$/g, '');
const flag = (name) => process.argv.includes(`--${name}`);
const from = arg('from');
const confirm = flag('confirm');
const replace = flag('replace');
const only = arg('only') ? new Set(arg('only').split(',').map(s => s.trim()).filter(Boolean)) : null;

(async () => {
  if (!from || !fs.existsSync(path.join(from, 'manifest.json'))) {
    console.error('❌ Indiquez le dossier d\'une sauvegarde : --from="...\\cami-...-2026-10-20_10h30" (il contient manifest.json)');
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(from, 'manifest.json'), 'utf8'));
  await mongoose.connect(MONGODB_URI);
  const db = arg('db') ? mongoose.connection.useDb(arg('db'), { useCache: false }).db : mongoose.connection.db;
  console.log(`Sauvegarde : ${from} (base « ${manifest.database} », ${new Date(manifest.createdAt).toLocaleString('fr-FR')})`);
  console.log(`Base cible : ${db.databaseName}`);
  console.log(`Mode : ${!confirm ? 'APERÇU (rien n\'est modifié)' : replace ? 'REMPLACEMENT COMPLET' : 'ajout des documents manquants'}\n`);

  for (const name of Object.keys(manifest.collections)) {
    if (only && !only.has(name)) continue;
    const file = path.join(from, `${name}.json.gz`);
    if (!fs.existsSync(file)) { console.log(`  ⚠️  ${name} : fichier manquant, ignoré`); continue; }
    const docs = EJSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'), { relaxed: false });
    const col = db.collection(name);
    const inDb = await col.countDocuments();
    if (!confirm) { console.log(`  ${name.padEnd(28)} sauvegarde ${String(docs.length).padStart(7)} · base actuelle ${String(inDb).padStart(7)}`); continue; }

    if (replace) await col.deleteMany({});
    let added = 0;
    for (let i = 0; i < docs.length; i += 1000) {
      const chunk = docs.slice(i, i + 1000);
      try {
        const r = await col.insertMany(chunk, { ordered: false });
        added += r.insertedCount;
      } catch (e) {
        // documents already present (same _id) are skipped, the others are inserted
        if (e.code !== 11000 && !(e.writeErrors || []).every(w => (w.code ?? w.err?.code) === 11000)) throw e;
        added += e.result?.insertedCount ?? e.insertedCount ?? 0;
      }
    }
    console.log(`  ${name.padEnd(28)} ${String(added).padStart(7)} remis${replace ? '' : ` (${docs.length - added} déjà présents)`}`);
  }
  console.log(confirm ? '\n✅ Restauration terminée. Redémarrez le serveur.' : '\nAperçu seulement. Ajoutez --confirm pour restaurer.');
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error('❌ Restauration impossible :', e.message);
  try { await mongoose.disconnect(); } catch { }
  process.exit(1);
});
