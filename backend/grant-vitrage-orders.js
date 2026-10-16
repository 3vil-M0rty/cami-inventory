// Donne au rôle « Coordinateur-vitrage » le droit de créer et gérer SES PROPRES bons de commande
// (famille verre) et ses fournisseurs, en plus de la réception. Il ne voit pas les autres bons de
// commande du service achat, sauf ceux de verre envoyés, qu'il réceptionne comme avant.
//
//   node grant-vitrage-orders.js             → aperçu, rien n'est modifié
//   node grant-vitrage-orders.js --confirm   → ajoute la permission « orders.own »
//
// (La permission peut aussi être cochée / décochée dans Admin › Rôles.)

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aluminum-inventory';
const ROLE = 'Coordinateur-vitrage';
const PERMISSION = 'orders.own';
const confirm = process.argv.includes('--confirm');

(async () => {
  await mongoose.connect(MONGODB_URI);
  const roles = mongoose.connection.db.collection('roles');
  const role = await roles.findOne({ name: ROLE });
  console.log(`Base : ${mongoose.connection.db.databaseName}`);
  if (!role) {
    console.log(`❌ Rôle « ${ROLE} » introuvable.`);
    await mongoose.disconnect(); process.exit(1);
  }
  const has = (role.permissions || []).includes(PERMISSION);
  console.log(`Rôle « ${ROLE} » : ${has ? `a déjà « ${PERMISSION} »` : `« ${PERMISSION} » sera ajoutée`}`);
  if (!confirm || has) {
    if (!confirm && !has) console.log('\nAperçu seulement : rien n\'a été modifié. Relancez avec --confirm.');
    await mongoose.disconnect(); return;
  }
  await roles.updateOne({ _id: role._id }, { $addToSet: { permissions: PERMISSION }, $set: { updatedAt: new Date() } });
  console.log(`\n✅ « ${PERMISSION} » ajoutée. Les comptes de ce rôle doivent se reconnecter (ou redémarrez le serveur).`);
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error('❌', e.message);
  try { await mongoose.disconnect(); } catch { }
  process.exit(1);
});
