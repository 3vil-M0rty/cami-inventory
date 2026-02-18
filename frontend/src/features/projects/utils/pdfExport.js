import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const ETAT_LABELS = {
  fr: { non_entame: 'Non entamé', en_cours: 'En cours', fabrique: 'Fabriqué', livre: 'Livré' },
  it: { non_entame: 'Non iniziato', en_cours: 'In corso', fabrique: 'Fabbricato', livre: 'Consegnato' },
  en: { non_entame: 'Not Started', en_cours: 'In Progress', fabrique: 'Fabricated', livre: 'Delivered' }
};
const STATUS_LABELS = {
  fr: { en_cours: 'En cours', termine: 'Terminé', livre: 'Livré' },
  it: { en_cours: 'In corso', termine: 'Terminato', livre: 'Consegnato' },
  en: { en_cours: 'In Progress', termine: 'Completed', livre: 'Delivered' }
};

function runAutoTable(doc, options) {
  if (typeof doc.autoTable === 'function') {
    doc.autoTable(options);
  } else {
    autoTable(doc, options);
  }
}

function drawHeader(doc, project, language, subtitle) {
  const lang = language || 'fr';
  const dateStr = project.date ? new Date(project.date).toLocaleDateString('fr-FR') : '';
  const margin = 15;

  doc.setFillColor(10, 10, 10);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('CAMI ALUMINIUM', margin, 12);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(subtitle, margin, 20);

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

  let y = 38;
  doc.setTextColor(26, 26, 26);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(project.name || '', margin, y);
  y += 8;

  const lbl = {
    fr: { ref: 'Référence', ral: 'RAL', date: 'Date', status: 'Statut' },
    it: { ref: 'Riferimento', ral: 'RAL', date: 'Data', status: 'Stato' },
    en: { ref: 'Reference', ral: 'RAL', date: 'Date', status: 'Status' },
  }[lang] || { ref: 'Référence', ral: 'RAL', date: 'Date', status: 'Statut' };

  const statusL = STATUS_LABELS[lang] || STATUS_LABELS.fr;

  const metaItems = [
    [lbl.ref,    project.reference || ''],
    [lbl.ral,    project.ralCode || ''],
    [lbl.date,   dateStr],
    [lbl.status, statusL[project.status] || project.status || ''],
  ];

  doc.setFontSize(10);
  metaItems.forEach(([key, val]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${key}:`, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(val), margin + 38, y);
    y += 6;
  });

  return { y: y + 6, margin };
}

function addFooter(doc, project) {
  const dateStr = project.date ? new Date(project.date).toLocaleDateString('fr-FR') : '';
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `CAMI ALUMINIUM — ${project.name} — ${dateStr} — ${i}/${pageCount}`,
      15,
      doc.internal.pageSize.height - 8
    );
  }
}

/** Export chassis-only PDF (expanded by quantity, no bars). */
export function exportProjectPDF(project, language, chassisLabels, t) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const lang = language || 'fr';
  const etatL = ETAT_LABELS[lang] || ETAT_LABELS.fr;

  const sheetLabel = { fr: 'Fiche Châssis', it: 'Scheda Telai', en: 'Chassis Sheet' }[lang] || 'Fiche Châssis';
  let { y, margin } = drawHeader(doc, project, language, sheetLabel);

  // Expand chassis by quantity — each unit is its own row
  const expandedRows = (project.chassis || []).flatMap(ch => {
    const qty = ch.quantity ?? 1;
    return Array.from({ length: qty }, (_, i) => ({
      repere: i === 0 ? ch.repere : `${ch.repere} #${i + 1}`,
      type: chassisLabels[ch.type]?.[lang] || ch.type || '',
      largeur: ch.largeur,
      hauteur: ch.hauteur,
      dimension: ch.dimension || `${ch.largeur}×${ch.hauteur}`,
      etat: etatL[ch.etat] || ch.etat || '',
    }));
  });

  const chHead = {
    fr: [['Repère', 'Type', 'Largeur (mm)', 'Hauteur (mm)', 'Dimension', 'État']],
    it: [['Repere', 'Tipo', 'Largh. (mm)', 'Alt. (mm)', 'Dimensione', 'Stato']],
    en: [['ID', 'Type', 'Width (mm)', 'Height (mm)', 'Dimension', 'Status']],
  }[lang] || [['Repère', 'Type', 'Largeur (mm)', 'Hauteur (mm)', 'Dimension', 'État']];

  const chRows = expandedRows.map(r => [r.repere, r.type, String(r.largeur || 0), String(r.hauteur || 0), r.dimension, r.etat]);

  const chTitle = { fr: 'Liste des Châssis', it: 'Lista Telai', en: 'Chassis List' }[lang];
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

  // Composite detail section
  const composites = (project.chassis || []).filter(ch => ch.components?.length > 0);
  if (composites.length > 0) {
    const compTitle = { fr: 'Détail Châssis Composites', it: 'Dettaglio Telai Compositi', en: 'Composite Chassis Detail' }[lang];
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(compTitle, margin, y);
    y += 4;
    composites.forEach(ch => {
      const compRows = ch.components.map((c, i) => [
        c.repere || `${c.role} ${i + 1}`, c.role,
        String(c.largeur || 0), String(c.hauteur || 0), etatL[c.etat] || c.etat || ''
      ]);
      runAutoTable(doc, {
        startY: y,
        head: [[`${ch.repere} — ${chassisLabels[ch.type]?.[lang] || ch.type}`,
          { fr: 'Rôle', it: 'Ruolo', en: 'Role' }[lang],
          { fr: 'Largeur', it: 'Larghezza', en: 'Width' }[lang],
          { fr: 'Hauteur', it: 'Altezza', en: 'Height' }[lang],
          { fr: 'État', it: 'Stato', en: 'Status' }[lang]]],
        body: compRows, theme: 'grid',
        headStyles: { fillColor: [50, 50, 50], textColor: 255, fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 9 }, margin: { left: margin, right: margin }
      });
      y = (doc.lastAutoTable?.finalY || y + 20) + 8;
    });
  }

  addFooter(doc, project);
  doc.save(`${project.reference || 'projet'}_chassis_${(project.name || 'project').replace(/\s+/g, '_')}.pdf`);
}

/** Export bars-only PDF. */
export function exportBarsPDF(project, language, t) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const lang = language || 'fr';

  const sheetLabel = { fr: 'Fiche Barres', it: 'Scheda Barre', en: 'Bars Sheet' }[lang] || 'Fiche Barres';
  let { y, margin } = drawHeader(doc, project, language, sheetLabel);

  const usedBars = (project.usedBars || []).filter(b => b.itemId && typeof b.itemId === 'object');

  const barsTitle = { fr: 'Barres Utilisées', it: 'Barre Utilizzate', en: 'Used Bars' }[lang];
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(barsTitle, margin, y);
  y += 4;

  if (usedBars.length === 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const noBarsTxt = { fr: 'Aucune barre utilisée', it: 'Nessuna barra utilizzata', en: 'No bars used' }[lang];
    doc.text(noBarsTxt, margin, y + 8);
  } else {
    const bHead = {
      fr: [['Désignation', 'Qté utilisée', 'Stock restant']],
      it: [['Designazione', 'Qtà usata', 'Stock rimanente']],
      en: [['Designation', 'Qty used', 'Remaining stock']],
    }[lang] || [['Désignation', 'Qté utilisée', 'Stock restant']];

    runAutoTable(doc, {
      startY: y, head: bHead,
      body: usedBars.map(b => [
        b.itemId.designation?.[lang] || b.itemId.designation?.fr || '',
        String(b.quantity || 0),
        String(b.itemId.quantity ?? '—')
      ]),
      theme: 'grid',
      headStyles: { fillColor: [10, 10, 10], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { left: margin, right: margin }
    });
  }

  addFooter(doc, project);
  doc.save(`${project.reference || 'projet'}_barres_${(project.name || 'project').replace(/\s+/g, '_')}.pdf`);
}
