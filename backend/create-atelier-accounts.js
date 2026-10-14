// Crée (ou met à jour) les comptes atelier limités à quelques articles d'aluminium,
// qui ne peuvent faire que − / + sur le stock.
//
//   node create-atelier-accounts.js                         → aperçu : articles trouvés, rien n'est modifié
//   node create-atelier-accounts.js --confirm               → crée / met à jour rôles + comptes
//   node create-atelier-accounts.js --confirm --pass-malick=XXXX --pass-hicham=YYYY
//
// Sans mot de passe fourni, un mot de passe est généré pour un NOUVEAU compte et affiché une seule fois.
// Un compte existant garde son mot de passe (sauf si --pass-… est donné).
// Ensuite tout se règle aussi depuis Admin › Utilisateurs (champ « Articles autorisés »).

require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aluminum-inventory';
const args = process.argv.slice(2);
const confirm = args.includes('--confirm');
const argVal = (name) => (args.find(a => a.startsWith(`--${name}=`)) || '').split('=').slice(1).join('=');

// Permissions: see the Inventory page, only the Aluminium category, and adjust stock with − / + only
const PERMISSIONS = ['inventory.view', 'inventory.aluminium.view', 'inventory.quantity'];

// Each article is found by: its code (whole word) + every word of its designation (whole words)
const ACCOUNTS = [
  {
    username: 'malick', displayName: 'MALICK', role: { name: 'Usinage', color: '#f59e0b' }, password: argVal('pass-malick'),
    items: [{ code: 'CAM4', words: ['rail', 'roulement', 'morceau', '1270'] }],
  },
  {
    username: 'hicham.coupeur', displayName: 'HICHAM COUPEUR', role: { name: 'Coupeur', color: '#06b6d4' }, password: argVal('pass-hicham'),
    items: [
      { code: 'CAM26', words: ['tige', 'anodise', 'noir', 'morceau', '500'] },
      { code: 'CAM26', words: ['tige', 'anodise', 'noir', 'morceau', '1600'] },
    ],
  },
];

const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const hasWord = (text, w) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(text);

(async () => {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  const items = await db.collection('items')
    .find({ superCategory: 'aluminium' }, { projection: { designation: 1, codeInterne: 1, superCategory: 1 } }).toArray();
  console.log(`Base : ${db.databaseName} — ${items.length} article(s) aluminium\n`);

  let ok = true;
  const plan = [];
  for (const acc of ACCOUNTS) {
    const ids = [];
    console.log(`▸ ${acc.displayName} (${acc.username}) — rôle « ${acc.role.name} »`);
    for (const spec of acc.items) {
      const code = norm(spec.code);
      const matches = items.filter(it => {
        const text = norm([it.codeInterne, it.designation?.fr, it.designation?.it, it.designation?.en].join(' '));
        return hasWord(text, code) && spec.words.every(w => hasWord(text, norm(w)));
      });
      const label = `${spec.code} ${spec.words.join(' ')}`;
      if (matches.length === 1) {
        const m = matches[0];
        console.log(`   ✅ ${label}  →  ${m.codeInterne ? `[${m.codeInterne}] ` : ''}${m.designation?.fr}`);
        ids.push(m._id);
      } else {
        ok = false;
        console.log(`   ❌ ${label}  →  ${matches.length} article(s) trouvé(s)${matches.length ? ' :' : ''}`);
        matches.slice(0, 10).forEach(m => console.log(`        - ${m.codeInterne ? `[${m.codeInterne}] ` : ''}${m.designation?.fr}`));
      }
    }
    plan.push({ acc, ids });
    console.log('');
  }

  if (!ok) {
    console.log('⚠️  Chaque article doit correspondre à exactement UN article de la base. Rien n\'a été modifié.');
    console.log('   Vérifiez les désignations, ou créez les comptes depuis Admin › Utilisateurs (champ « Articles autorisés »).');
    await mongoose.disconnect(); process.exit(1);
  }
  if (!confirm) {
    console.log('Aperçu seulement : rien n\'a été modifié. Relancez avec --confirm pour créer / mettre à jour les comptes.');
    await mongoose.disconnect(); return;
  }

  const now = new Date();
  for (const { acc, ids } of plan) {
    const roles = db.collection('roles');
    let role = await roles.findOne({ name: acc.role.name });
    if (role) {
      await roles.updateOne({ _id: role._id }, { $addToSet: { permissions: { $each: PERMISSIONS } }, $set: { updatedAt: now } });
    } else {
      const r = await roles.insertOne({ name: acc.role.name, permissions: PERMISSIONS, color: acc.role.color, isSystem: false, createdAt: now, updatedAt: now });
      role = { _id: r.insertedId };
    }

    const users = db.collection('users');
    const existing = await users.findOne({ username: acc.username });
    const set = { displayName: acc.displayName, roleId: role._id, allowedItemIds: ids, active: true, updatedAt: now };
    let shownPassword = '';
    if (acc.password) { set.passwordHash = await bcrypt.hash(acc.password, 10); shownPassword = acc.password; }
    if (existing) {
      await users.updateOne({ _id: existing._id }, { $set: set });
      console.log(`🔄 ${acc.displayName} mis à jour${shownPassword ? ` — mot de passe : ${shownPassword}` : ' (mot de passe inchangé)'}`);
    } else {
      if (!set.passwordHash) { shownPassword = crypto.randomBytes(5).toString('hex'); set.passwordHash = await bcrypt.hash(shownPassword, 10); }
      await users.insertOne({ username: acc.username, companyId: null, createdAt: now, ...set });
      console.log(`✅ ${acc.displayName} créé — identifiant : ${acc.username} — mot de passe : ${shownPassword}`);
    }
  }
  console.log('\nTerminé. Redémarrez le serveur si des sessions étaient ouvertes (le cache des droits dure quelques secondes).');
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error('❌', e.message);
  try { await mongoose.disconnect(); } catch { }
  process.exit(1);
});
