import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const ETAT_LABELS = {
  fr: { non_entame: 'Non entamé', en_cours: 'En cours', fabrique: 'Fabriqué', livre: 'Livré' },
  it: { non_entame: 'Non iniziato', en_cours: 'In corso', fabrique: 'Fabbricato', livre: 'Consegnato' },
  en: { non_entame: 'Not Started', en_cours: 'In Progress', fabrique: 'Fabricated', livre: 'Delivered' }
};
const STATUS_LABELS = {
  fr: { en_cours: 'En cours', fabrique: 'Fabriqué', cloture: 'Clôturé' },
  it: { en_cours: 'In corso', fabrique: 'Fabbricato', cloture: 'Chiuso' },
  en: { en_cours: 'In Progress', fabrique: 'Fabricated', cloture: 'Closed' }
};

// Etat colour — RGB tuples matching the UI
const ETAT_COLORS_RGB = {
  non_entame: [156, 163, 175],
  en_cours:   [245, 158, 11],
  fabrique:   [59, 130, 246],
  livre:      [22, 163, 74],
};

function runAutoTable(doc, options) {
  if (typeof doc.autoTable === 'function') doc.autoTable(options);
  else autoTable(doc, options);
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
    const r = parseInt(hex.substring(0, 2), 16) || 200;
    const g = parseInt(hex.substring(2, 4), 16) || 200;
    const b = parseInt(hex.substring(4, 6), 16) || 200;
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
      15, doc.internal.pageSize.height - 8
    );
  }
}

// ── Helpers mirroring ProjectDetail logic ────────────────────────────────────

function getUnit(ch, idx) {
  return (ch.units || []).find(u => u.unitIndex === idx) || {
    unitIndex: idx, etat: 'non_entame', deliveryDate: null, componentStates: []
  };
}

function getComponentEtat(unit, compIdx, comp) {
  const cs = (unit.componentStates || []).find(c => c.compIndex === compIdx);
  return cs ? cs.etat : (comp.etat || 'non_entame');
}

function deriveCompositeEtat(unit, components) {
  if (!components.length) return unit.etat || 'non_entame';
  const states = components.map((comp, i) => getComponentEtat(unit, i, comp));
  if (states.every(e => e === 'livre'))                     return 'livre';
  if (states.every(e => e === 'fabrique' || e === 'livre')) return 'fabrique';
  if (states.some(e => e !== 'non_entame'))                 return 'en_cours';
  return 'non_entame';
}

function fmtDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('fr-FR'); } catch { return ''; }
}

/**
 * Build the flat row list that mirrors the table in ProjectDetail:
 *   - non-composite chassis  → one 'unit' row per quantity instance
 *   - composite chassis      → one 'groupHead' row + N 'component' rows per instance
 */
function buildDisplayRows(chassis, chassisLabels, lang, etatL) {
  const rows = [];
  for (const ch of (chassis || [])) {
    const qty         = ch.quantity || 1;
    const chLabel     = chassisLabels[ch.type]?.[lang] || ch.type || '';
    const isComposite = (ch.components || []).length > 0;

    for (let i = 0; i < qty; i++) {
      const unit        = getUnit(ch, i);
      const unitSuffix  = qty > 1 ? ` #${i + 1}` : '';
      const baseLabel   = `${ch.repere}${unitSuffix}`;

      if (!isComposite) {
        rows.push({
          kind:      'unit',
          repere:    baseLabel,
          type:      chLabel,
          largeur:   String(ch.largeur || 0),
          hauteur:   String(ch.hauteur || 0),
          dimension: ch.dimension || `${ch.largeur}×${ch.hauteur}`,
          etat:      unit.etat || 'non_entame',
          etatLabel: etatL[unit.etat] || unit.etat || '',
          delivery:  fmtDate(unit.deliveryDate),
        });
      } else {
        const derivedEtat = deriveCompositeEtat(unit, ch.components);
        rows.push({
          kind:      'groupHead',
          repere:    baseLabel,
          type:      chLabel,
          largeur:   String(ch.largeur || 0),
          hauteur:   String(ch.hauteur || 0),
          dimension: ch.dimension || `${ch.largeur}×${ch.hauteur}`,
          etat:      derivedEtat,
          etatLabel: etatL[derivedEtat] || derivedEtat || '',
          delivery:  '',
        });
        ch.components.forEach((comp, ci) => {
          const compEtat  = getComponentEtat(unit, ci, comp);
          const roleLabel = comp.role === 'dormant'
            ? { fr: 'Dormant', it: 'Dormiente', en: 'Frame' }[lang] || 'Dormant'
            : { fr: `Vantail ${ci}`, it: `Anta ${ci}`, en: `Leaf ${ci}` }[lang] || `V${ci}`;
          rows.push({
            kind:      'component',
            repere:    `  ↳ ${comp.repere || roleLabel}`,
            type:      roleLabel,
            largeur:   String(comp.largeur || 0),
            hauteur:   String(comp.hauteur || 0),
            dimension: comp.largeur && comp.hauteur ? `${comp.largeur}×${comp.hauteur}` : '—',
            etat:      compEtat,
            etatLabel: etatL[compEtat] || compEtat || '',
            delivery:  '',
          });
        });
      }
    }
  }
  return rows;
}

/** Export chassis PDF — structure matches the table exactly. */
export function exportProjectPDF(project, language, chassisLabels, t) {
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const lang = language || 'fr';
  const etatL = ETAT_LABELS[lang] || ETAT_LABELS.fr;

  const sheetLabel = { fr: 'Fiche Châssis', it: 'Scheda Telai', en: 'Chassis Sheet' }[lang] || 'Fiche Châssis';
  let { y, margin } = drawHeader(doc, project, language, sheetLabel);

  const chTitle = { fr: 'Liste des Châssis', it: 'Lista Telai', en: 'Chassis List' }[lang];
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(chTitle, margin, y);
  y += 4;

  const colHeaders = {
    fr: ['Repère', 'Type', 'L (mm)', 'H (mm)', 'Dimension', 'État', 'Livraison'],
    it: ['Repere', 'Tipo', 'L (mm)', 'H (mm)', 'Dimensione', 'Stato', 'Consegna'],
    en: ['ID', 'Type', 'W (mm)', 'H (mm)', 'Dimension', 'Status', 'Delivery'],
  }[lang] || ['Repère', 'Type', 'L (mm)', 'H (mm)', 'Dimension', 'État', 'Livraison'];

  const displayRows = buildDisplayRows(project.chassis, chassisLabels, lang, etatL);

  // Build autoTable body + per-row styles
  const tableBody     = [];
  const rowStylesMap  = {}; // rowIndex → { fillColor, textColor, fontStyle }

  displayRows.forEach((row, idx) => {
    tableBody.push([
      row.repere, row.type, row.largeur, row.hauteur, row.dimension, row.etatLabel, row.delivery
    ]);

    const [er, eg, eb] = ETAT_COLORS_RGB[row.etat] || [200, 200, 200];

    if (row.kind === 'groupHead') {
      // Dark header row for composite group
      rowStylesMap[idx] = {
        fillColor:  [30, 30, 30],
        textColor:  [255, 255, 255],
        fontStyle:  'bold',
        etatColor:  [er, eg, eb],
      };
    } else if (row.kind === 'component') {
      // Slightly indented / light background for components
      rowStylesMap[idx] = {
        fillColor:  [248, 248, 248],
        textColor:  [60, 60, 60],
        fontStyle:  'normal',
        etatColor:  [er, eg, eb],
      };
    } else {
      // Normal unit row — alternate shading handled by willDrawCell
      rowStylesMap[idx] = {
        fillColor:  null,  // use default alternate
        textColor:  [26, 26, 26],
        fontStyle:  'normal',
        etatColor:  [er, eg, eb],
      };
    }
  });

  runAutoTable(doc, {
    startY: y,
    head:   [colHeaders],
    body:   tableBody,
    theme:  'grid',
    headStyles:          { fillColor: [10, 10, 10], textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
    bodyStyles:          { fontSize: 8.5, cellPadding: 2 },
    alternateRowStyles:  { fillColor: [245, 245, 245] },
    margin:              { left: margin, right: margin },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 28 },
      2: { halign: 'center', cellWidth: 16 },
      3: { halign: 'center', cellWidth: 16 },
      4: { cellWidth: 26 },
      5: { cellWidth: 22 },
      6: { cellWidth: 20 },
    },
    willDrawCell(data) {
      if (data.section !== 'body') return;
      const rowIdx  = data.row.index;
      const style   = rowStylesMap[rowIdx];
      if (!style) return;

      // Override fill / text for group heads and component rows
      if (style.fillColor) {
        const [r, g, b] = style.fillColor;
        doc.setFillColor(r, g, b);
        doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'F');
        const [tr, tg, tb] = style.textColor;
        doc.setTextColor(tr, tg, tb);
      }
    },
    didDrawCell(data) {
      if (data.section !== 'body') return;
      // Draw a coloured pill/badge in the État column (col index 5)
      if (data.column.index !== 5) return;
      const rowIdx = data.row.index;
      const style  = rowStylesMap[rowIdx];
      if (!style) return;

      const [er, eg, eb] = style.etatColor || [200, 200, 200];
      const text = String(data.cell.raw || '');
      if (!text) return;

      const cx = data.cell.x + 1;
      const cy = data.cell.y + 1;
      const cw = data.cell.width - 2;
      const ch = data.cell.height - 2;

      doc.setFillColor(er, eg, eb);
      doc.roundedRect(cx, cy, cw, ch, 1.5, 1.5, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.text(text, cx + cw / 2, cy + ch / 2 + 0.8, { align: 'center' });

      // Reset so subsequent cells draw normally
      doc.setTextColor(26, 26, 26);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
    },
  });

  addFooter(doc, project);
  doc.save(`${project.reference || 'projet'}_chassis_${(project.name || 'project').replace(/\s+/g, '_')}.pdf`);
}

/** Export bars-only PDF. */
export function exportBarsPDF(project, language, t) {
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
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
      headStyles:         { fillColor: [10, 10, 10], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles:         { fontSize: 9 },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin:             { left: margin, right: margin },
    });
  }

  addFooter(doc, project);
  doc.save(`${project.reference || 'projet'}_barres_${(project.name || 'project').replace(/\s+/g, '_')}.pdf`);
}