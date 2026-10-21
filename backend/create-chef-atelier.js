// Crée le rôle « Chef atelier » (consultation seule) et le compte de Pape.
// Il voit TOUS les projets (cartes, détail des châssis, documents / OF en PDF) et ne peut RIEN modifier :
// la permission « readonly » fait refuser par le serveur toute création / modification / suppression.
//
//   node create-chef-atelier.js                       → aperçu, rien n'est modifié
//   node create-chef-atelier.js --confirm             → crée / met à jour (mots de passe générés)
//   node create-chef-atelier.js --confirm --pass=XXXX → mot de passe choisi pour le compte
//
// Un compte qui existe déjà garde son mot de passe (sauf avec --pass).

require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aluminum-inventory';
const args = process.argv.slice(2);
const confirm = args.includes('--confirm');
const password = (args.find(a => a.startsWith('--pass=')) || '').split('=').slice(1).join('=');

const ROLE = { name: 'Chef atelier', color: '#8b5cf6' };
const PERMISSIONS = ['projects.view', 'readonly'];
const USERS = [
  { username: 'pape', displayName: 'Pape' },
];

(async () => {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  const roles = db.collection('roles');
  const users = db.collection('users');
  const role = await roles.findOne({ name: ROLE.name });
  console.log(`Base : ${db.databaseName}`);
  console.log(`Rôle « ${ROLE.name} » : ${role ? 'existe (permissions remplacées)' : 'sera créé'} — ${PERMISSIONS.join(', ')}`);
  const existing = await users.find({ username: { $in: USERS.map(u => u.username) } }).toArray();
  for (const u of USERS) console.log(`Compte « ${u.username} » (${u.displayName}) : ${existing.some(x => x.username === u.username) ? 'existe (mis à jour)' : 'sera créé'}`);

  if (!confirm) {
    console.log('\nAperçu seulement : rien n\'a été modifié. Relancez avec --confirm.');
    await mongoose.disconnect(); return;
  }

  const now = new Date();
  let roleId = role?._id;
  if (role) await roles.updateOne({ _id: role._id }, { $set: { permissions: PERMISSIONS, updatedAt: now } });
  else roleId = (await roles.insertOne({ name: ROLE.name, permissions: PERMISSIONS, color: ROLE.color, isSystem: false, createdAt: now, updatedAt: now })).insertedId;

  console.log('');
  for (const u of USERS) {
    const found = existing.find(x => x.username === u.username);
    const set = { displayName: u.displayName, roleId, active: true, updatedAt: now };
    let shown = '';
    if (password) { set.passwordHash = await bcrypt.hash(password, 10); shown = password; }
    if (found) {
      await users.updateOne({ _id: found._id }, { $set: set });
      console.log(`🔄 ${u.displayName} — identifiant : ${u.username}${shown ? ` — mot de passe : ${shown}` : ' (mot de passe inchangé)'}`);
    } else {
      if (!set.passwordHash) { shown = crypto.randomBytes(4).toString('hex'); set.passwordHash = await bcrypt.hash(shown, 10); }
      await users.insertOne({ username: u.username, companyId: null, allowedItemIds: [], createdAt: now, ...set });
      console.log(`✅ ${u.displayName} — identifiant : ${u.username} — mot de passe : ${shown}`);
    }
  }
  console.log('\nTerminé. Notez les mots de passe affichés (ils ne seront plus montrés).');
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error('❌', e.message);
  try { await mongoose.disconnect(); } catch { }
  process.exit(1);
});
