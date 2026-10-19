// Donne au rôle « BARREMAN » le droit d'ajuster le stock de l'inventaire avec les boutons − / +
// (permission « inventory.quantity »), sur les familles d'articles qu'il voit déjà. Il ne peut pas
// modifier ni supprimer les articles.
//
//   node grant-barreman-stock.js             → aperçu (affiche les permissions actuelles), rien n'est modifié
//   node grant-barreman-stock.js --confirm   → ajoute la permission « inventory.quantity »
//
// (La permission peut aussi être cochée dans Admin › Rôles : « Inventaire — Ajuster le stock (− / +) uniquement ».)

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aluminum-inventory';
const ROLE = 'BARREMAN';
const PERMISSION = 'inventory.quantity';
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
  const perms = role.permissions || [];
  console.log(`Permissions actuelles de « ${ROLE} » : ${perms.join(', ') || '(aucune)'}`);
  if (!perms.some(p => p === 'inventory.view' || /^inventory\.[a-z]+\.view$/.test(p))) {
    console.log('⚠️  Ce rôle ne voit aucune famille de l\'inventaire : cochez aussi « Inventaire — voir » (aluminium…) dans Admin › Rôles.');
  }
  if (perms.includes('readonly')) console.log('⚠️  Ce rôle est en « Lecture seule » : retirez cette permission, sinon toute modification reste refusée.');
  const has = perms.includes(PERMISSION);
  console.log(has ? `« ${PERMISSION} » est déjà présente.` : `« ${PERMISSION} » sera ajoutée.`);
  if (!confirm || has) {
    if (!confirm && !has) console.log('\nAperçu seulement : rien n\'a été modifié. Relancez avec --confirm.');
    await mongoose.disconnect(); return;
  }
  await roles.updateOne({ _id: role._id }, { $addToSet: { permissions: PERMISSION }, $set: { updatedAt: new Date() } });
  console.log(`\n✅ « ${PERMISSION} » ajoutée. Les comptes BARREMAN doivent se reconnecter (ou redémarrez le serveur).`);
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error('❌', e.message);
  try { await mongoose.disconnect(); } catch { }
  process.exit(1);
});
