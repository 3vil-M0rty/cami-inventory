// Crée (ou met à jour) le rôle « Comptable » et le compte de Samira.
// Accès : page ACHATS → onglets « Suivi des commandes » (factures, paiements, documents)
//         et « Fournisseurs » (délai de paiement). Pas de création / modification de bons de commande.
//
//   node create-comptable-account.js                      → aperçu, rien n'est modifié
//   node create-comptable-account.js --confirm            → crée / met à jour
//   node create-comptable-account.js --confirm --pass=XXXX
//
// Sans --pass, un mot de passe est généré pour un NOUVEAU compte et affiché une seule fois ;
// un compte existant garde son mot de passe.

require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aluminum-inventory';
const args = process.argv.slice(2);
const confirm = args.includes('--confirm');
const password = (args.find(a => a.startsWith('--pass=')) || '').split('=').slice(1).join('=');

const ROLE = { name: 'Comptable', color: '#8b5cf6' };
// orders.view → the ACHATS page; orders.accounting → Suivi + Fournisseurs (payments, terms)
const PERMISSIONS = ['orders.view', 'orders.accounting'];
const USER = { username: 'samira', displayName: 'Samira' };

(async () => {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  const roles = db.collection('roles');
  const users = db.collection('users');
  const role = await roles.findOne({ name: ROLE.name });
  const user = await users.findOne({ username: USER.username });
  console.log(`Base : ${db.databaseName}`);
  console.log(`Rôle « ${ROLE.name} » : ${role ? 'existe (permissions complétées)' : 'sera créé'} — ${PERMISSIONS.join(', ')}`);
  console.log(`Compte « ${USER.username} » (${USER.displayName}) : ${user ? 'existe (mis à jour)' : 'sera créé'}`);

  if (!confirm) {
    console.log('\nAperçu seulement : rien n\'a été modifié. Relancez avec --confirm.');
    await mongoose.disconnect(); return;
  }

  const now = new Date();
  let roleId = role?._id;
  if (role) {
    await roles.updateOne({ _id: role._id }, { $addToSet: { permissions: { $each: PERMISSIONS } }, $set: { updatedAt: now } });
  } else {
    roleId = (await roles.insertOne({ name: ROLE.name, permissions: PERMISSIONS, color: ROLE.color, isSystem: false, createdAt: now, updatedAt: now })).insertedId;
  }

  const set = { displayName: USER.displayName, roleId, active: true, updatedAt: now };
  let shown = '';
  if (password) { set.passwordHash = await bcrypt.hash(password, 10); shown = password; }
  if (user) {
    await users.updateOne({ _id: user._id }, { $set: set });
    console.log(`\n🔄 ${USER.displayName} mise à jour${shown ? ` — mot de passe : ${shown}` : ' (mot de passe inchangé)'}`);
  } else {
    if (!set.passwordHash) { shown = crypto.randomBytes(5).toString('hex'); set.passwordHash = await bcrypt.hash(shown, 10); }
    await users.insertOne({ username: USER.username, companyId: null, allowedItemIds: [], createdAt: now, ...set });
    console.log(`\n✅ ${USER.displayName} créée — identifiant : ${USER.username} — mot de passe : ${shown}`);
  }
  console.log('Terminé. Redémarrez le serveur si elle était déjà connectée.');
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error('❌', e.message);
  try { await mongoose.disconnect(); } catch { }
  process.exit(1);
});
