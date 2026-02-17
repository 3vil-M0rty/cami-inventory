/**
 * PDF Export Utility
 *
 * FIX: jsPDF autoTable must be applied to the *instance* not statically imported.
 * The `import 'jspdf-autotable'` side-effect import patches the jsPDF prototype
 * when the module loads. If it doesn't, we also try applying it manually.
 */

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

// Safe autoTable wrapper that works regardless of how the plugin is loaded
function runAutoTable(doc, options) {
  if (typeof doc.autoTable === 'function') {
    // Plugin patched the prototype — use it directly
    doc.autoTable(options);
  } else {
    // Use the named export directly (jspdf-autotable ≥ 3.x)
    autoTable(doc, options);
  }
}

export function exportProjectPDF(project, language, chassisLabels, t) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const etatL = ETAT_LABELS[language] || ETAT_LABELS.fr;
  const statusL = STATUS_LABELS[language] || STATUS_LABELS.fr;

  const dateStr = project.date
    ? new Date(project.date).toLocaleDateString('fr-FR')
    : '';

  const margin = 15;
  let y = margin;

  // ==================== HEADER ====================
  doc.setFillColor(10, 10, 10);
  doc.rect(0, 0, 210, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('CAMI ALUMINIUM', margin, 12);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const sheetLabel = language === 'fr' ? 'Fiche Projet' : language === 'it' ? 'Scheda Progetto' : 'Project Sheet';
  doc.text(sheetLabel, margin, 20);

  // RAL color swatch
  if (project.ralColor) {
    const hex = project.ralColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    doc.setFillColor(r, g, b);
    doc.roundedRect(180, 8, 16, 12, 2, 2, 'F');
  }
  doc.setDrawColor(200, 200, 200);
  doc.roundedRect(180, 8, 16, 12, 2, 2, 'S');

  y = 38;
  doc.setTextColor(26, 26, 26);

  // ==================== PROJECT META ====================
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(project.name, margin, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  const labels = {
    fr: { ref: 'Référence', ral: 'RAL', date: 'Date', status: 'Statut', total: 'Châssis' },
    it: { ref: 'Riferimento', ral: 'RAL', date: 'Data', status: 'Stato', total: 'Telai' },
    en: { ref: 'Reference', ral: 'RAL', date: 'Date', status: 'Status', total: 'Chassis' },
  };
  const lbl = labels[language] || labels.fr;

  const metaItems = [
    [lbl.ref,    project.reference || ''],
    [lbl.ral,    project.ralCode || ''],
    [lbl.date,   dateStr],
    [lbl.status, statusL[project.status] || project.status || ''],
    [lbl.total,  String(project.chassis?.length || 0)],
  ];

  metaItems.forEach(([key, val]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${key}:`, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(val), margin + 38, y);
    y += 6;
  });

  y += 6;

  // ==================== CHASSIS TABLE ====================
  const chassisHeaderMap = {
    fr: [['Repère', 'Type', 'Qté', 'Largeur (mm)', 'Hauteur (mm)', 'Dimension', 'État']],
    it: [['Repere', 'Tipo', 'Qtà', 'Largh. (mm)', 'Alt. (mm)', 'Dimensione', 'Stato']],
    en: [['ID', 'Type', 'Qty', 'Width (mm)', 'Height (mm)', 'Dimension', 'Status']],
  };
  const chassisHeader = chassisHeaderMap[language] || chassisHeaderMap.fr;

  const chassisRows = (project.chassis || []).map(ch => [
    ch.repere || '',
    chassisLabels[ch.type]?.[language] || ch.type || '',
    String(ch.quantity || 1),
    String(ch.largeur || 0),
    String(ch.hauteur || 0),
    ch.dimension || `${ch.largeur}×${ch.hauteur}`,
    etatL[ch.etat] || ch.etat || ''
  ]);

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  const chassisTitleMap = { fr: 'Liste des Châssis', it: 'Lista Telai', en: 'Chassis List' };
  doc.text(chassisTitleMap[language] || chassisTitleMap.fr, margin, y);
  y += 4;

  runAutoTable(doc, {
    startY: y,
    head: chassisHeader,
    body: chassisRows,
    theme: 'grid',
    headStyles: { fillColor: [10, 10, 10], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    margin: { left: margin, right: margin },
    columnStyles: { 0: { fontStyle: 'bold' } }
  });

  y = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 12 : y + 40;

  // ==================== COMPOSITE CHASSIS DETAIL ====================
  const compositeItems = (project.chassis || []).filter(ch => ch.components?.length > 0);
  if (compositeItems.length > 0) {
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    const compTitleMap = { fr: 'Détail Châssis Composites', it: 'Dettaglio Telai Compositi', en: 'Composite Chassis Detail' };
    doc.text(compTitleMap[language] || compTitleMap.fr, margin, y);
    y += 4;

    compositeItems.forEach(ch => {
      const compRows = ch.components.map((c, i) => [
        c.repere || `${c.role} ${i + 1}`,
        c.role,
        String(c.largeur || 0),
        String(c.hauteur || 0),
        etatL[c.etat] || c.etat || ''
      ]);

      const roleLabel  = language === 'fr' ? 'Rôle'    : 'Role';
      const widthLabel = language === 'fr' ? 'Largeur' : language === 'it' ? 'Larghezza' : 'Width';
      const heightLabel= language === 'fr' ? 'Hauteur' : language === 'it' ? 'Altezza'   : 'Height';
      const stateLabel = language === 'fr' ? 'État'    : language === 'it' ? 'Stato'     : 'Status';

      runAutoTable(doc, {
        startY: y,
        head: [[`${ch.repere} — ${chassisLabels[ch.type]?.[language] || ch.type}`, roleLabel, widthLabel, heightLabel, stateLabel]],
        body: compRows,
        theme: 'grid',
        headStyles: { fillColor: [50, 50, 50], textColor: 255, fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        margin: { left: margin, right: margin }
      });
      y = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 8 : y + 20;
    });
  }

  // ==================== USED BARS ====================
  const usedBars = (project.usedBars || []).filter(b => b.itemId && typeof b.itemId === 'object');
  if (usedBars.length > 0) {
    if (y > 240) { doc.addPage(); y = margin; }

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    const barsTitleMap = { fr: 'Barres Utilisées', it: 'Barre Utilizzate', en: 'Used Bars' };
    doc.text(barsTitleMap[language] || barsTitleMap.fr, margin, y);
    y += 4;

    const barsHeaderMap = {
      fr: [['Désignation', 'Qté utilisée', 'Stock restant']],
      it: [['Designazione', 'Qtà usata', 'Stock rimanente']],
      en: [['Designation', 'Qty used', 'Remaining stock']],
    };
    const barsHeader = barsHeaderMap[language] || barsHeaderMap.fr;

    const barsRows = usedBars.map(b => [
      b.itemId.designation?.[language] || b.itemId.designation?.fr || '',
      String(b.quantity || 0),
      String(b.itemId.quantity ?? '—')
    ]);

    runAutoTable(doc, {
      startY: y,
      head: barsHeader,
      body: barsRows,
      theme: 'grid',
      headStyles: { fillColor: [10, 10, 10], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { left: margin, right: margin }
    });
  }

  // ==================== FOOTER ====================
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `CAMI ALUMINIUM — ${project.name} — ${dateStr} — ${i}/${pageCount}`,
      margin,
      doc.internal.pageSize.height - 8
    );
  }

  const fileName = `${project.reference || 'projet'}_${project.name.replace(/\s+/g, '_')}.pdf`;
  doc.save(fileName);
}
