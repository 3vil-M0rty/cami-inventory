/**
 * PDF Export Utility
 *
 * Generates a full project PDF using jsPDF + jspdf-autotable.
 * No server dependency — runs entirely in the browser.
 *
 * Install: npm install jspdf jspdf-autotable
 */

import jsPDF from 'jspdf';
import 'jspdf-autotable';

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

export function exportProjectPDF(project, language, chassisLabels, t) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const etatL = ETAT_LABELS[language];
  const statusL = STATUS_LABELS[language];

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
  doc.text(language === 'fr' ? 'Fiche Projet' : language === 'it' ? 'Scheda Progetto' : 'Project Sheet', margin, 20);

  // RAL color swatch
  doc.setFillColor(project.ralColor || '#ffffff');
  doc.roundedRect(180, 8, 16, 12, 2, 2, 'F');
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

  const metaItems = [
    [language === 'fr' ? 'Référence' : language === 'it' ? 'Riferimento' : 'Reference', project.reference],
    ['RAL', `${project.ralCode}`],
    [language === 'fr' ? 'Date' : 'Date', dateStr],
    [language === 'fr' ? 'Statut' : language === 'it' ? 'Stato' : 'Status', statusL[project.status] || project.status],
    [language === 'fr' ? 'Châssis' : language === 'it' ? 'Telai' : 'Chassis', String(project.chassis?.length || 0)],
  ];

  metaItems.forEach(([key, val]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${key}:`, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(val, margin + 35, y);
    y += 6;
  });

  y += 6;

  // ==================== CHASSIS TABLE ====================
  const chassisHeader = language === 'fr'
    ? [['Repère', 'Type', 'Largeur (mm)', 'Hauteur (mm)', 'Dimension', 'État']]
    : language === 'it'
    ? [['Repere', 'Tipo', 'Largh. (mm)', 'Alt. (mm)', 'Dimensione', 'Stato']]
    : [['ID', 'Type', 'Width (mm)', 'Height (mm)', 'Dimension', 'Status']];

  const chassisRows = (project.chassis || []).map(ch => [
    ch.repere,
    chassisLabels[ch.type]?.[language] || ch.type,
    String(ch.largeur),
    String(ch.hauteur),
    ch.dimension || `${ch.largeur}×${ch.hauteur}`,
    etatL[ch.etat] || ch.etat
  ]);

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  const chassisTitle = language === 'fr' ? 'Liste des Châssis' : language === 'it' ? 'Lista Telai' : 'Chassis List';
  doc.text(chassisTitle, margin, y);
  y += 4;

  doc.autoTable({
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

  y = doc.lastAutoTable.finalY + 12;

  // ==================== COMPOSITE CHASSIS DETAIL ====================
  const compositeItems = (project.chassis || []).filter(ch => ch.components?.length > 0);
  if (compositeItems.length > 0) {
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    const compTitle = language === 'fr' ? 'Détail Châssis Composites' : language === 'it' ? 'Dettaglio Telai Compositi' : 'Composite Chassis Detail';
    doc.text(compTitle, margin, y);
    y += 4;

    compositeItems.forEach(ch => {
      const compRows = ch.components.map((c, i) => [
        c.repere || `${c.role} ${i + 1}`,
        c.role,
        String(c.largeur),
        String(c.hauteur),
        etatL[c.etat] || c.etat
      ]);

      doc.autoTable({
        startY: y,
        head: [[
          `${ch.repere} — ${chassisLabels[ch.type]?.[language] || ch.type}`,
          language === 'fr' ? 'Rôle' : 'Role',
          language === 'fr' ? 'Largeur' : 'Width',
          language === 'fr' ? 'Hauteur' : 'Height',
          language === 'fr' ? 'État' : 'Status'
        ]],
        body: compRows,
        theme: 'grid',
        headStyles: { fillColor: [50, 50, 50], textColor: 255, fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        margin: { left: margin, right: margin }
      });
      y = doc.lastAutoTable.finalY + 8;
    });
  }

  // ==================== USED BARS ====================
  const usedBars = (project.usedBars || []).filter(b => b.itemId && typeof b.itemId === 'object');
  if (usedBars.length > 0) {
    if (y > 240) { doc.addPage(); y = margin; }

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    const barsTitle = language === 'fr' ? 'Barres Utilisées' : language === 'it' ? 'Barre Utilizzate' : 'Used Bars';
    doc.text(barsTitle, margin, y);
    y += 4;

    const barsHeader = language === 'fr'
      ? [['Désignation', 'Qté utilisée', 'Stock restant']]
      : language === 'it'
      ? [['Designazione', 'Qtà usata', 'Stock rimanente']]
      : [['Designation', 'Qty used', 'Remaining stock']];

    const barsRows = usedBars.map(b => [
      b.itemId.designation?.[language] || '',
      String(b.quantity),
      String(b.itemId.quantity ?? '—')
    ]);

    doc.autoTable({
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

  // ==================== SAVE ====================
  const fileName = `${project.reference}_${project.name.replace(/\s+/g, '_')}.pdf`;
  doc.save(fileName);
}
