// src/utils/orderExport.js
// Requires: npm i jspdf jspdf-autotable xlsx
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

const L = {
  bc:        { fr: 'BON DE COMMANDE', it: 'ORDINE D\'ACQUISTO', en: 'PURCHASE ORDER' },
  supplier:  { fr: 'Fournisseur',     it: 'Fornitore',          en: 'Supplier' },
  date:      { fr: 'Date',            it: 'Data',               en: 'Date' },
  expected:  { fr: 'Livraison prévue',it: 'Consegna prevista',  en: 'Expected delivery' },
  codeInt:   { fr: 'Code interne',    it: 'Cod. interno',       en: 'Internal code' },
  codeFour:  { fr: 'Code fourn.',     it: 'Cod. fornitore',     en: 'Supplier code' },
  desig:     { fr: 'Désignation',     it: 'Designazione',       en: 'Designation' },
  qty:       { fr: 'Qté',             it: 'Q.tà',               en: 'Qty' },
  pu:        { fr: 'P.U. HT',         it: 'P.U.',               en: 'Unit price' },
  total:     { fr: 'Total HT',        it: 'Totale',             en: 'Total' },
  totalHT:   { fr: 'Total HT',        it: 'Totale imponibile',  en: 'Subtotal' },
  tva:       { fr: 'TVA',             it: 'IVA',                en: 'VAT' },
  totalTTC:  { fr: 'Total TTC',       it: 'Totale IVA incl.',   en: 'Total incl. VAT' },
  notes:     { fr: 'Notes',           it: 'Note',               en: 'Notes' },
  draft:     { fr: 'BROUILLON — non envoyé', it: 'BOZZA', en: 'DRAFT' },
};
const tr = (k, lang) => (L[k]?.[lang] || L[k]?.fr || k);

const money = (n) => (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';

function supplierCodeFor(item, supplierId) {
  if (!item || !supplierId) return '';
  const sid = (supplierId.id || supplierId._id || supplierId).toString();
  const hit = (item.supplierCodes || []).find(sc => (sc.supplierId?._id || sc.supplierId)?.toString() === sid);
  return hit?.code || '';
}

export async function exportOrderPDF(order, lang = 'fr', company = null) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const accent = company?.color || '#1a1a1a';
  const supplier = order.supplierId || null;
  let y = 14;

  // Logo (optional, must be a data URL or same-origin to render reliably)
  if (company?.logo) {
    try { doc.addImage(company.logo, 'PNG', 14, y, 26, 16); } catch (_) {}
  }
  // Company block (right)
  doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(accent);
  doc.text(company?.name || '', pageW - 14, y + 4, { align: 'right' });
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(90);
  const compLines = [company?.address, company?.phone, company?.email,
    [company?.ice && `ICE: ${company.ice}`, company?.rc && `RC: ${company.rc}`].filter(Boolean).join('   ')].filter(Boolean);
  compLines.forEach((t, i) => doc.text(String(t), pageW - 14, y + 9 + i * 4, { align: 'right' }));

  // Title + number
  y += 26;
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(20);
  doc.text(tr('bc', lang), 14, y);
  doc.setFontSize(12).setTextColor(accent);
  doc.text(order.status === 'brouillon' ? tr('draft', lang) : `N° ${order.number || order.reference || ''}`, 14, y + 6);

  // Meta + supplier
  y += 14;
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(60);
  doc.text(`${tr('date', lang)}: ${fmtDate(order.orderDate)}`, 14, y);
  if (order.expectedDate) doc.text(`${tr('expected', lang)}: ${fmtDate(order.expectedDate)}`, 14, y + 4.5);

  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(30);
  doc.text(`${tr('supplier', lang)}:`, pageW / 2, y);
  doc.setFont('helvetica', 'normal').setTextColor(60);
  const supLines = [
    supplier?.name || order.supplier || '—',
    supplier?.code && `Code: ${supplier.code}`,
    supplier?.address, supplier?.phone,
    [supplier?.ice && `ICE: ${supplier.ice}`, supplier?.rc && `RC: ${supplier.rc}`].filter(Boolean).join('   '),
  ].filter(Boolean);
  supLines.forEach((t, i) => doc.text(String(t), pageW / 2, y + 4.5 + i * 4.2));
  y += 6 + supLines.length * 4.2;

  // Lines table
  const lines = order.lines || [];
  const body = lines.map(l => {
    const it = l.itemId || {};
    const lineTotal = (l.quantityOrdered || 0) * (l.unitPrice || 0);
    return [
      it.codeInterne || '',
      supplierCodeFor(it, supplier),
      (it.designation?.[lang] || it.designation?.fr || 'Article') + (l.note ? `\n${l.note}` : ''),
      String(l.quantityOrdered || 0),
      money(l.unitPrice),
      money(lineTotal),
    ];
  });
  const totalHT = lines.reduce((s, l) => s + (l.quantityOrdered || 0) * (l.unitPrice || 0), 0);
  const tvaRate = order.tva != null ? Number(order.tva) : 20;
  const tvaAmt = totalHT * tvaRate / 100;
  const ttc = totalHT + tvaAmt;

  autoTable(doc, {
    startY: y + 4,
    head: [[tr('codeInt', lang), tr('codeFour', lang), tr('desig', lang), tr('qty', lang), tr('pu', lang), tr('total', lang)]],
    body,
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: accent, textColor: 255, fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 24 }, 1: { cellWidth: 24 }, 3: { halign: 'center', cellWidth: 14 },
      4: { halign: 'right', cellWidth: 24 }, 5: { halign: 'right', cellWidth: 26 },
    },
    margin: { left: 14, right: 14 },
  });

  // Totals
  let ty = doc.lastAutoTable.finalY + 6;
  const labelX = pageW - 70, valX = pageW - 14;
  doc.setFontSize(9).setTextColor(60).setFont('helvetica', 'normal');
  const row = (label, val, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.text(label, labelX, ty);
    doc.text(`${money(val)} MAD`, valX, ty, { align: 'right' });
    ty += 5.5;
  };
  row(tr('totalHT', lang), totalHT);
  row(`${tr('tva', lang)} (${tvaRate}%)`, tvaAmt);
  doc.setDrawColor(200).line(labelX, ty - 2, valX, ty - 2);
  doc.setTextColor(accent);
  row(tr('totalTTC', lang), ttc, true);

  if (order.notes) {
    ty += 4;
    doc.setFont('helvetica', 'bold').setTextColor(40).text(`${tr('notes', lang)}:`, 14, ty);
    doc.setFont('helvetica', 'normal').setTextColor(80);
    doc.text(doc.splitTextToSize(order.notes, pageW - 28), 14, ty + 5);
  }

  doc.save(`${tr('bc', lang)}_${order.number || order.reference || 'brouillon'}.pdf`);
}

export function exportOrdersExcel(orders, lang = 'fr') {
  const rows = [];
  (orders || []).forEach(o => {
    (o.lines || []).forEach(l => {
      const it = l.itemId || {};
      rows.push({
        'N° BC': o.number || '',
        'Statut': o.status,
        'Société': o.companyId?.name || '',
        'Fournisseur': o.supplierId?.name || o.supplier || '',
        'Date': fmtDate(o.orderDate),
        'Code interne': it.codeInterne || '',
        'Code fournisseur': supplierCodeFor(it, o.supplierId),
        'Désignation': it.designation?.[lang] || it.designation?.fr || '',
        'Qté commandée': l.quantityOrdered,
        'Qté reçue': l.quantityReceived || 0,
        'P.U. HT': l.unitPrice || 0,
        'Total HT': (l.quantityOrdered || 0) * (l.unitPrice || 0),
      });
    });
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 20 }, { wch: 11 }, { wch: 14 }, { wch: 16 }, { wch: 36 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Commandes');
  XLSX.writeFile(wb, `commandes_${new Date().toISOString().split('T')[0]}.xlsx`);
}
