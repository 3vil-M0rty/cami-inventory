// Reprend les factures et paiements saisis dans l'ancien « Suivi des commandes » (une ligne par bon de
// commande / BL) et en fait de vraies factures (Factures), chacune liée à ses bons de commande.
//
//   node migrate-factures.js             → APERÇU : liste les factures qui seraient créées, rien n'est modifié
//   node migrate-factures.js --confirm   → crée les factures
//
// Rien n'est supprimé : les anciennes lignes restent telles quelles, elles reçoivent seulement le lien vers
// la facture créée (factureId), ce qui évite de les reprendre deux fois. Les fichiers PDF ne sont pas copiés :
// la facture pointe vers le même fichier.
//   • lignes avec le même n° de facture chez le même fournisseur → UNE facture pour tous leurs BC / BL
//   • ligne sans n° mais marquée « facture reçue », payée ou avec un PDF de facture → une facture « sans n° »
//   • montant = montant du BL (ou du BC s'il n'y a pas de BL), comme dans l'ancien Suivi
//   • « Payé » / « Partiel » → un paiement du montant payé, à la date de paiement enregistrée

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aluminum-inventory';
const confirm = process.argv.includes('--confirm');
const { ObjectId } = mongoose.Types;
const r2c = (v) => Math.round((Number(v) || 0) * 100) / 100;
const key = (v) => String(v || '').trim().toLowerCase();

(async () => {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  console.log(`Base : ${db.databaseName}`);
  const rows = await db.collection('ordertrackings').find({
    factureId: null, // not taken over yet (missing field = null)
    $or: [{ factureNumber: { $nin: ['', null] } }, { factureStatus: 'recue' }, { paiementStatus: { $in: ['partiel', 'paye'] } }, { 'documents.kind': 'facture' }],
  }).toArray();
  if (!rows.length) { console.log('Rien à reprendre : toutes les factures de l\'ancien Suivi sont déjà des factures.'); await mongoose.disconnect(); return; }

  const orders = await db.collection('orders').find({ _id: { $in: [...new Set(rows.map(r => String(r.orderId)))].map(id => new ObjectId(id)) } }).toArray();
  const orderById = new Map(orders.map(o => [String(o._id), o]));
  const sups = await db.collection('fournisseurs').find({}, { projection: { name: 1 } }).toArray();
  const supById = new Map(sups.map(s => [String(s._id), s]));

  // amount of a row, as the old Suivi computed it: BL received (TTC), or the whole order without BL
  const rowAmount = (r, o) => {
    const tva = o.tva != null ? Number(o.tva) : 20;
    const price = new Map((o.lines || []).map(l => [String(l._id), l.unitPrice || 0]));
    if (!r.blNumber) return r2c((o.lines || []).reduce((s, l) => s + (l.quantityOrdered || 0) * (l.unitPrice || 0), 0) * (1 + tva / 100));
    const ht = (o.receptions || []).filter(x => !x.cancelled && x.blNumber === r.blNumber)
      .reduce((s, x) => s + (x.quantityReceived || 0) * (price.get(String(x.lineId)) || 0), 0);
    return r2c(ht * (1 + tva / 100));
  };
  const supplierOf = (o) => {
    const s = o.supplierId ? supById.get(String(o.supplierId)) : null;
    return { id: s?._id || null, name: s?.name || o.supplier || '' };
  };

  // group: same invoice number at the same supplier; otherwise one invoice per row
  const groups = new Map();
  let skipped = 0;
  for (const r of rows) {
    const o = orderById.get(String(r.orderId));
    if (!o) { skipped++; continue; }
    const sup = supplierOf(o);
    const g = r.factureNumber ? `${sup.id || key(sup.name)}::${key(r.factureNumber)}` : `row:${r._id}`;
    if (!groups.has(g)) groups.set(g, { sup, number: r.factureNumber || '', rows: [] });
    groups.get(g).rows.push({ r, o, montant: rowAmount(r, o) });
  }

  const plans = [];
  for (const g of groups.values()) {
    const links = new Map();
    const payments = [];
    const docs = new Map();
    let date = null, type = '', notes = new Set();
    const companies = new Set();
    for (const { r, o, montant } of g.rows) {
      const l = links.get(String(o._id)) || { orderId: o._id, blNumbers: [], montant: 0 };
      if (r.blNumber && !l.blNumbers.includes(r.blNumber)) l.blNumbers.push(r.blNumber);
      l.montant = r2c(l.montant + montant);
      links.set(String(o._id), l);
      companies.add(String(o.companyId || ''));
      if (r.factureDate && (!date || new Date(r.factureDate) < date)) date = new Date(r.factureDate);
      if (!type && r.typeFacture) type = r.typeFacture;
      if (r.remarque) notes.add(r.remarque);
      for (const d of r.documents || []) if (d.kind === 'facture' && d.key && !docs.has(d.key)) {
        docs.set(d.key, { _id: new ObjectId(), key: d.key, name: d.name || '', contentType: d.contentType || 'application/pdf', size: d.size || 0, uploadedAt: d.uploadedAt || new Date(), uploadedBy: d.uploadedBy || '' });
      }
      const paid = r.paiementStatus === 'paye' ? montant : r.paiementStatus === 'partiel' ? r2c(r.montantPaye) : 0;
      if (paid >= 0.01) payments.push({
        _id: new ObjectId(), date: new Date(r.paiementDate || r.factureDate || r.updatedAt || Date.now()), montant: paid,
        mode: r.modePaiement || '', reference: '', note: 'Repris de l\'ancien suivi', by: '', createdAt: new Date(), updatedAt: new Date(),
      });
    }
    const linkList = [...links.values()];
    const montant = r2c(linkList.reduce((s, l) => s + l.montant, 0));
    // never more paid than the invoice amount
    let left = montant;
    const pays = payments.map(p => ({ ...p, montant: r2c(Math.min(p.montant, Math.max(0, left))) })).filter(p => { left = r2c(left - p.montant); return p.montant >= 0.01; });
    const co = [...companies].filter(Boolean);
    plans.push({
      doc: {
        number: g.number, supplierId: g.sup.id, supplierName: g.sup.name, companyId: co.length === 1 ? new ObjectId(co[0]) : null,
        date, montant, typeFacture: ['', 'facture', 'bl', 'situation', 'avoir'].includes(type) && type ? type : 'facture',
        remarque: [...notes].join(' · ').slice(0, 500), links: linkList, documents: [...docs.values()], payments: pays,
        createdBy: 'reprise ancien suivi', migratedFrom: g.rows.map(x => x.r._id), createdAt: new Date(), updatedAt: new Date(), __v: 0,
      },
      orderNumbers: linkList.map(l => { const o = orderById.get(String(l.orderId)); return `${o.number || o.reference || '—'}${l.blNumbers.length ? ` (BL ${l.blNumbers.join(', ')})` : ''}`; }),
    });
  }

  console.log(`\n${rows.length} ligne(s) de l'ancien Suivi avec facture / paiement → ${plans.length} facture(s) :\n`);
  for (const p of plans) {
    const d = p.doc;
    const paid = r2c(d.payments.reduce((s, x) => s + x.montant, 0));
    console.log(`  • ${d.number || '(sans n°)'} — ${d.supplierName || '?'} — ${d.montant.toFixed(2)} TTC, payé ${paid.toFixed(2)}${d.documents.length ? `, ${d.documents.length} PDF` : ''}`);
    console.log(`      BC : ${p.orderNumbers.join(' · ')}`);
  }
  if (skipped) console.log(`\n(${skipped} ligne(s) ignorée(s) : bon de commande supprimé)`);

  if (!confirm) {
    console.log('\nAperçu seulement : rien n\'a été modifié. Relancez avec --confirm pour créer ces factures.');
    await mongoose.disconnect(); return;
  }
  for (const p of plans) {
    const { insertedId } = await db.collection('factures').insertOne(p.doc);
    await db.collection('ordertrackings').updateMany({ _id: { $in: p.doc.migratedFrom } }, { $set: { factureId: insertedId } });
  }
  console.log(`\n✅ ${plans.length} facture(s) créée(s). Les anciennes lignes sont conservées (marquées comme reprises).`);
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error('❌', e.message);
  try { await mongoose.disconnect(); } catch { }
  process.exit(1);
});
