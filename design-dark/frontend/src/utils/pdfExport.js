import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { translate, activeLanguage } from '../context/LanguageContext';

// Translated label for a key, or the raw value when the key does not exist
const lab = (lang, key, raw) => { const v = translate(lang, key); return v === key ? raw : v; };
const etatLabel = (lang, e) => (e ? lab(lang, `etat_${e}`, e) : '');
const statusLabel = (lang, s) => (s ? lab(lang, `anPdfStatus_${s}`, lab(lang, `status_${s}`, s)) : '');

function runAutoTable(doc, options) {
  if (typeof doc.autoTable === 'function') {
    doc.autoTable(options);
  } else {
    autoTable(doc, options);
  }
}

export function exportProjectPDF(project, language, chassisLabels, t) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const lang = language || activeLanguage();
  const L = (key, vars) => translate(lang, key, vars);

  const dateStr = project.date ? new Date(project.date).toLocaleDateString('fr-FR') : '';
  const margin = 15;
  let y = margin;

  // Header bar
  doc.setFillColor(10, 10, 10);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(L('appTitle'), margin, 12);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(L('anPdfProjectSheet'), margin, 20);

  // RAL swatch
  if (project.ralColor) {
    const hex = project.ralColor.replace('#', '');
    const r = parseInt(hex.substring(0,2), 16) || 200;
    const g = parseInt(hex.substring(2,4), 16) || 200;
    const b = parseInt(hex.substring(4,6), 16) || 200;
    doc.setFillColor(r, g, b);
    doc.roundedRect(180, 8, 16, 12, 2, 2, 'F');
  }
  doc.setDrawColor(200, 200, 200);
  doc.roundedRect(180, 8, 16, 12, 2, 2, 'S');

  y = 38;
  doc.setTextColor(26, 26, 26);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(project.name || '', margin, y);
  y += 8;

  const metaItems = [
    [L('anPdfRef'),          project.reference || ''],
    [L('anPdfRal'),          project.ralCode || ''],
    [L('anPdfDate'),         dateStr],
    [L('anPdfStatus'),       statusLabel(lang, project.status)],
    [L('anPdfTotalChassis'), String(project.chassis?.length || 0)],
  ];

  doc.setFontSize(10);
  metaItems.forEach(([key, val]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${key}:`, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(val), margin + 38, y);
    y += 6;
  });
  y += 6;

  // Chassis table
  const chHead = [[L('anPdfColRepere'), L('anPdfColType'), L('anPdfColQty'), L('anPdfColWidthMm'), L('anPdfColHeightMm'), L('anPdfColDimension'), L('anPdfColEtat')]];

  const chRows = (project.chassis || []).map(ch => [
    ch.repere || '',
    chassisLabels[ch.type]?.[lang] || ch.type || '',
    String(ch.quantity ?? 1),
    String(ch.largeur || 0),
    String(ch.hauteur || 0),
    ch.dimension || `${ch.largeur}×${ch.hauteur}`,
    etatLabel(lang, ch.etat)
  ]);

  const chTitle = L('anPdfChassisList');
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(chTitle, margin, y);
  y += 4;

  runAutoTable(doc, {
    startY: y, head: chHead, body: chRows, theme: 'grid',
    headStyles: { fillColor: [10, 10, 10], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    margin: { left: margin, right: margin },
    columnStyles: { 0: { fontStyle: 'bold' } }
  });
  y = (doc.lastAutoTable?.finalY || y + 40) + 12;

  // Composite detail
  const composites = (project.chassis || []).filter(ch => ch.components?.length > 0);
  if (composites.length > 0) {
    const compTitle = L('anPdfCompositeDetail');
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(compTitle, margin, y);
    y += 4;
    composites.forEach(ch => {
      const compRows = ch.components.map((c, i) => [
        c.repere || `${c.role} ${i + 1}`, c.role,
        String(c.largeur || 0), String(c.hauteur || 0), etatLabel(lang, c.etat)
      ]);
      runAutoTable(doc, {
        startY: y,
        head: [[`${ch.repere} — ${chassisLabels[ch.type]?.[lang] || ch.type}`,
          L('anPdfColRole'), L('anPdfColWidth'), L('anPdfColHeight'), L('anPdfColEtat')]],
        body: compRows, theme: 'grid',
        headStyles: { fillColor: [50, 50, 50], textColor: 255, fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 9 }, margin: { left: margin, right: margin }
      });
      y = (doc.lastAutoTable?.finalY || y + 20) + 8;
    });
  }

  // Used bars
  const usedBars = (project.usedBars || []).filter(b => b.itemId && typeof b.itemId === 'object');
  if (usedBars.length > 0) {
    if (y > 240) { doc.addPage(); y = margin; }
    const barsTitle = L('anPdfUsedBars');
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(barsTitle, margin, y);
    y += 4;
    const bHead = [[L('anPdfColDesignation'), L('anPdfColQtyUsed'), L('anPdfColStockLeft')]];
    runAutoTable(doc, {
      startY: y, head: bHead,
      body: usedBars.map(b => [b.itemId.designation?.[lang] || b.itemId.designation?.fr || '', String(b.quantity || 0), String(b.itemId.quantity ?? '—')]),
      theme: 'grid',
      headStyles: { fillColor: [10, 10, 10], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 }, alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { left: margin, right: margin }
    });
  }

  // Footer
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`${L('appTitle')} — ${project.name} — ${dateStr} — ${i}/${pageCount}`, margin, doc.internal.pageSize.height - 8);
  }

  doc.save(`${project.reference || L('anPdfFileProject')}_${(project.name || 'project').replace(/\s+/g, '_')}.pdf`);
}
