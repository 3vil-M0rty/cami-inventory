/**
 * blExcelExport.js
 *
 * Exports a Bon de Livraison as an .xlsx file in the browser.
 * Uses the SheetJS (xlsx) library loaded via CDN in index.html,
 * OR via npm package if available.
 *
 * Two templates:
 *   - GIMAV  → blue theme, GIMAV logo (fetched from /logos/logo_gimav.png)
 *   - CAMI   → red/black theme, CAMI logo + company info block
 *
 * Prestation choices:
 *   fourniture_fabrication_laquage | fourniture_fabrication |
 *   fabrication | laquage | fourniture | retour
 */

export const PRESTATION_OPTIONS = [
  { value: 'fourniture_fabrication_laquage', labelFr: '− FOURNITURE FABRICATION ET LAQUAGE −' },
  { value: 'fourniture_fabrication',          labelFr: '− FOURNITURE ET FABRICATION −'          },
  { value: 'fabrication',                     labelFr: '− FABRICATION −'                        },
  { value: 'laquage',                         labelFr: '− LAQUAGE −'                            },
  { value: 'fourniture',                      labelFr: '− FOURNITURE −'                         },
  { value: 'retour',                          labelFr: '− RETOUR −'                             },
];

const PRESTATION_LABELS = Object.fromEntries(PRESTATION_OPTIONS.map(o => [o.value, o.labelFr]));

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseDim(dim) {
  try {
    const parts = String(dim).split('×');
    const lmm = parts[0]?.trim() ? (isNaN(Number(parts[0].trim())) ? parts[0].trim() : Number(parts[0].trim())) : '_';
    const hmm = parts[1]?.trim() ? (isNaN(Number(parts[1].trim())) ? parts[1].trim() : Number(parts[1].trim())) : '_';
    return { lmm, hmm };
  } catch {
    return { lmm: dim, hmm: '_' };
  }
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'));
    return d.toLocaleDateString('fr-FR');
  } catch { return dateStr; }
}

async function fetchImageAsBase64(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

// ── Main export function ──────────────────────────────────────────────────────

/**
 * @param {object} bl           - BL object from API (blId, deliveryDate, units[])
 * @param {object} project      - Project object (name, reference, ralCode)
 * @param {'CAMI'|'GIMAV'} company
 * @param {string} prestationKey
 */
export async function exportBLtoExcel(bl, project, company, prestationKey) {
  // Dynamically import SheetJS (works if installed via npm)
  let XLSX;
  try {
    XLSX = await import('xlsx');
    XLSX = XLSX.default || XLSX;
  } catch {
    // fallback: try window.XLSX (CDN)
    XLSX = window.XLSX;
  }

  if (!XLSX) {
    alert('Erreur: bibliothèque Excel non disponible. Veuillez installer xlsx (npm install xlsx).');
    return;
  }

  const wb = XLSX.utils.book_new();
  const prestationLabel = PRESTATION_LABELS[prestationKey] || PRESTATION_LABELS['fourniture_fabrication_laquage'];
  const units = bl.units || [];
  const dateStr = fmtDate(bl.deliveryDate);

  if (company === 'GIMAV') {
    await buildGimavSheet(wb, XLSX, bl, project, prestationLabel, units, dateStr);
  } else {
    await buildCamiSheet(wb, XLSX, bl, project, prestationLabel, units, dateStr);
  }

  const filename = `BL_${company}_${bl.blId}_${(project.reference || '').replace(/[^a-zA-Z0-9\-]/g, '_')}.xlsx`;
  XLSX.writeFile(wb, filename);
}


// ── GIMAV Sheet ──────────────────────────────────────────────────────────────

async function buildGimavSheet(wb, XLSX, bl, project, prestationLabel, units, dateStr) {
  const sheetName = ('BL ' + bl.blId).slice(0, 31);
  const ws = {};

  // ── Styles (xlsx-js-style compatible) ────────────────────────────────────
  const hdrStyle = {
    font: { bold: true, sz: 9, name: 'Arial', color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: '2E75B6' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: false },
    border: {
      top: { style: 'thin', color: { rgb: '000000' } },
      bottom: { style: 'thin', color: { rgb: '000000' } },
      left: { style: 'thin', color: { rgb: '000000' } },
      right: { style: 'thin', color: { rgb: '000000' } },
    }
  };

  const labelStyle = {
    font: { bold: true, sz: 9, name: 'Arial' },
    fill: { patternType: 'solid', fgColor: { rgb: 'D6E4F0' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: { top:{style:'thin',color:{rgb:'000000'}}, bottom:{style:'thin',color:{rgb:'000000'}}, left:{style:'thin',color:{rgb:'000000'}}, right:{style:'thin',color:{rgb:'000000'}} }
  };

  const valueStyle = {
    font: { bold: true, sz: 10, name: 'Arial' },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: { top:{style:'thin',color:{rgb:'000000'}}, bottom:{style:'thin',color:{rgb:'000000'}}, left:{style:'thin',color:{rgb:'000000'}}, right:{style:'thin',color:{rgb:'000000'}} }
  };

  const prestStyle = {
    font: { bold: true, sz: 12, name: 'Arial', color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: '1F4E79' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: { top:{style:'thin',color:{rgb:'000000'}}, bottom:{style:'thin',color:{rgb:'000000'}}, left:{style:'thin',color:{rgb:'000000'}}, right:{style:'thin',color:{rgb:'000000'}} }
  };

  const dataStyle = {
    font: { sz: 9, name: 'Arial' },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: { top:{style:'thin',color:{rgb:'000000'}}, bottom:{style:'thin',color:{rgb:'000000'}}, left:{style:'thin',color:{rgb:'000000'}}, right:{style:'thin',color:{rgb:'000000'}} }
  };

  const dataStyleBlue = { ...dataStyle, fill: { patternType: 'solid', fgColor: { rgb: 'EBF3FB' } } };
  const dataStyleLeft = { ...dataStyle, alignment: { horizontal: 'left', vertical: 'center' } };
  const dataStyleLeftBlue = { ...dataStyleBlue, alignment: { horizontal: 'left', vertical: 'center' } };

  // Rows 1-8: logo placeholder (image added separately)
  // Build data row by row. Use array-of-arrays approach for simplicity.
  // Columns A=0, B=1, C=2, D=3, E=4, F=5, G=6, H=7  (8 columns)

  const rows = [];

  // Rows 0-7: blank logo area
  for (let i = 0; i < 8; i++) rows.push([null,null,null,null,null,null,null,null]);

  // Row 8: Type BL | | Réf Projet | value (merged across E-H)
  rows.push([
    { v: 'Type', s: labelStyle },
    { v: 'BL', s: valueStyle },
    { v: 'BL', s: valueStyle },   // merged B-C fill
    { v: 'Réf Projet', s: labelStyle },
    { v: project.reference || '', s: valueStyle },
    { v: '', s: valueStyle },
    { v: '', s: valueStyle },
    { v: '', s: valueStyle },
  ]);

  // Row 9: N° BL
  rows.push([
    { v: 'N° BL', s: labelStyle },
    { v: bl.blId, s: valueStyle },
    { v: '', s: valueStyle },
    { v: 'Date', s: labelStyle },
    { v: dateStr, s: valueStyle },
    { v: '', s: valueStyle },
    { v: '', s: valueStyle },
    { v: '', s: valueStyle },
  ]);

  // Row 10: TOTAL PIÈCES (formula placeholder)
  const firstDataRow = 17; // 1-indexed, matches Excel row
  rows.push([
    { v: 'TOTAL PIÈCES', s: labelStyle },
    { f: `SUM(F${firstDataRow}:F${firstDataRow + units.length})`, s: valueStyle },
    { v: '', s: valueStyle },
    { v: 'Client', s: labelStyle },
    { v: project.name || '', s: valueStyle },
    { v: '', s: valueStyle },
    { v: '', s: valueStyle },
    { v: '', s: valueStyle },
  ]);

  // Row 11: Transport
  rows.push([
    { v: 'Transport', s: labelStyle },
    { v: 'GIMAV', s: valueStyle },
    { v: '', s: valueStyle },
    { v: 'RAL', s: labelStyle },
    { v: project.ralCode || '', s: valueStyle },
    { v: '', s: valueStyle },
    { v: '', s: valueStyle },
    { v: '', s: valueStyle },
  ]);

  // Row 12: spacer
  rows.push([null,null,null,null,null,null,null,null]);

  // Row 13: Prestation banner (A-H merged)
  rows.push([
    { v: prestationLabel, s: prestStyle },
    null, null, null, null, null, null, null
  ]);

  // Row 14: spacer
  rows.push([null,null,null,null,null,null,null,null]);

  // Row 15: headers
  rows.push([
    { v: 'N°', s: hdrStyle },
    { v: 'Réf', s: hdrStyle },
    { v: 'Désignation', s: hdrStyle },
    { v: 'L(mm)', s: hdrStyle },
    { v: 'H(mm)', s: hdrStyle },
    { v: 'QTE', s: hdrStyle },
    { v: 'M²', s: hdrStyle },
    { v: 'REMARQUE', s: hdrStyle },
  ]);

  // Data rows
  let itemNum = 1;
  units.forEach((u, idx) => {
    const isComp = u.isComponent;
    const { lmm, hmm } = parseDim(u.dimension);
    const ds = isComp ? dataStyleBlue : dataStyle;
    const dsL = isComp ? dataStyleLeftBlue : dataStyleLeft;
    const excelRow = firstDataRow + idx;

    let label = u.chassisType || '';
    if (isComp) label = `  ↳ ${u.role || ''} — ${u.chassisType || ''}`;

    rows.push([
      { v: isComp ? '' : itemNum++, s: ds },
      { v: u.chassisRepere || '', s: ds },
      { v: label, s: { ...dsL, font: { ...dsL.font, italic: isComp } } },
      { v: lmm, s: ds },
      { v: hmm, s: ds },
      { v: 1, s: { ...ds, font: { bold: true, sz: 9, name: 'Arial' } } },
      { f: `IF(AND(ISNUMBER(D${excelRow}),ISNUMBER(E${excelRow})),D${excelRow}*E${excelRow}*F${excelRow}/1000000,"_")`, s: ds },
      { v: u.notes || '_', s: dsL },
    ]);
  });

  // Spacer
  rows.push([null,null,null,null,null,null,null,null]);

  // Signature row
  rows.push([
    { v: 'Signature Livreur', s: { alignment: { horizontal: 'center', vertical: 'bottom' }, border: { top: { style: 'thin', color: { rgb:'000000' } } } } },
    null, null,
    null,
    null,
    { v: 'Signature Réceptionnaire', s: { alignment: { horizontal: 'center', vertical: 'bottom' }, border: { top: { style: 'thin', color: { rgb:'000000' } } } } },
    null, null,
  ]);

  // Convert to worksheet
  const wsXLSX = XLSX.utils.aoa_to_sheet(rows);

  // Merges (0-indexed: s=start, e=end, r=row, c=col)
  wsXLSX['!merges'] = [
    // Logo rows already handled by image
    // Row 8 (index 8): B-C merged, E-H merged
    { s:{r:8,c:1}, e:{r:8,c:2} }, { s:{r:8,c:4}, e:{r:8,c:7} },
    // Row 9: B-C, E-H
    { s:{r:9,c:1}, e:{r:9,c:2} }, { s:{r:9,c:4}, e:{r:9,c:7} },
    // Row 10: B-C, E-H
    { s:{r:10,c:1}, e:{r:10,c:2} }, { s:{r:10,c:4}, e:{r:10,c:7} },
    // Row 11: B-C, E-H
    { s:{r:11,c:1}, e:{r:11,c:2} }, { s:{r:11,c:4}, e:{r:11,c:7} },
    // Row 13: A-H (prestation)
    { s:{r:13,c:0}, e:{r:13,c:7} },
    // Signature row: A-C, F-H
    { s:{r:rows.length-1,c:0}, e:{r:rows.length-1,c:2} },
    { s:{r:rows.length-1,c:5}, e:{r:rows.length-1,c:7} },
  ];

  // Column widths
  wsXLSX['!cols'] = [
    {wch:6},{wch:10},{wch:36},{wch:10},{wch:10},{wch:8},{wch:12},{wch:26}
  ];

  // Row heights (in pts)
  wsXLSX['!rows'] = rows.map((_, i) => {
    if (i < 8) return { hpt: 15 };
    if (i >= 8 && i <= 11) return { hpt: 18 };
    if (i === 12) return { hpt: 6 };
    if (i === 13) return { hpt: 22 };
    if (i === 14) return { hpt: 6 };
    if (i === 15) return { hpt: 22 };
    if (i === rows.length - 1) return { hpt: 45 };
    return { hpt: 16 };
  });

  XLSX.utils.book_append_sheet(wb, wsXLSX, sheetName);
}


// ── CAMI Sheet ───────────────────────────────────────────────────────────────

async function buildCamiSheet(wb, XLSX, bl, project, prestationLabel, units, dateStr) {
  const sheetName = ('BL CAMI ' + bl.blId).slice(0, 31);

  const labelStyle = {
    font: { bold: true, sz: 9, name: 'Arial' },
    fill: { patternType: 'solid', fgColor: { rgb: 'F2F2F2' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: { top:{style:'thin',color:{rgb:'000000'}}, bottom:{style:'thin',color:{rgb:'000000'}}, left:{style:'thin',color:{rgb:'000000'}}, right:{style:'thin',color:{rgb:'000000'}} }
  };

  const valueStyle = {
    font: { bold: true, sz: 10, name: 'Arial' },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: { top:{style:'thin',color:{rgb:'000000'}}, bottom:{style:'thin',color:{rgb:'000000'}}, left:{style:'thin',color:{rgb:'000000'}}, right:{style:'thin',color:{rgb:'000000'}} }
  };

  const prestStyle = {
    font: { bold: true, sz: 12, name: 'Arial', color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'C00000' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: { top:{style:'thin',color:{rgb:'000000'}}, bottom:{style:'thin',color:{rgb:'000000'}}, left:{style:'thin',color:{rgb:'000000'}}, right:{style:'thin',color:{rgb:'000000'}} }
  };

  const hdrStyle = {
    font: { bold: true, sz: 9, name: 'Arial', color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: '1a1a1a' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: { top:{style:'thin',color:{rgb:'000000'}}, bottom:{style:'thin',color:{rgb:'000000'}}, left:{style:'thin',color:{rgb:'000000'}}, right:{style:'thin',color:{rgb:'000000'}} }
  };

  const dataStyle = {
    font: { sz: 9, name: 'Arial' },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: { top:{style:'thin',color:{rgb:'000000'}}, bottom:{style:'thin',color:{rgb:'000000'}}, left:{style:'thin',color:{rgb:'000000'}}, right:{style:'thin',color:{rgb:'000000'}} }
  };
  const dataStyleGrey = { ...dataStyle, fill: { patternType: 'solid', fgColor: { rgb: 'F9F9F9' } } };
  const dataStyleLeft = { ...dataStyle, alignment: { horizontal: 'left', vertical: 'center' } };
  const dataStyleLeftGrey = { ...dataStyleGrey, alignment: { horizontal: 'left', vertical: 'center' } };

  // CAMI has 11 columns: A B C D E F G H I J K
  // Logo: A1 (columns A-G), Info block: H1 (columns H-K)
  // Data grid uses columns C-K (idx 2-10)

  const rows = [];

  // Rows 0-11: logo zone (12 rows)
  for (let i = 0; i < 12; i++) rows.push(Array(11).fill(null));

  const firstDataRow = 21; // 1-indexed Excel row for first data row

  // Row 12: Type | BL | | | | | | Réf Projet | | value | value
  rows.push([
    null, null,
    { v: 'Type', s: labelStyle }, { v: '', s: labelStyle },   // C-D merged label
    { v: 'BL', s: valueStyle }, { v: '', s: valueStyle }, { v: '', s: valueStyle }, // E-G merged value
    { v: 'Réf Projet', s: labelStyle }, { v: '', s: labelStyle }, // H-I merged label
    { v: project.reference || '', s: valueStyle }, { v: '', s: valueStyle }, // J-K merged value
  ]);

  // Row 13: N° BL
  rows.push([
    null, null,
    { v: 'N° BL', s: labelStyle }, { v: '', s: labelStyle },
    { v: bl.blId, s: valueStyle }, { v: '', s: valueStyle }, { v: '', s: valueStyle },
    { v: 'Date', s: labelStyle }, { v: '', s: labelStyle },
    { v: dateStr, s: valueStyle }, { v: '', s: valueStyle },
  ]);

  // Row 14: Total pièces
  rows.push([
    null, null,
    { v: 'TOTAL PIÈCES', s: labelStyle }, { v: '', s: labelStyle },
    { f: `SUM(I${firstDataRow}:I${firstDataRow + units.length})`, s: valueStyle }, { v: '', s: valueStyle }, { v: '', s: valueStyle },
    { v: 'Client', s: labelStyle }, { v: '', s: labelStyle },
    { v: project.name || '', s: valueStyle }, { v: '', s: valueStyle },
  ]);

  // Row 15: RAL | Transport
  rows.push([
    null, null,
    { v: 'RAL', s: labelStyle }, { v: '', s: labelStyle },
    { v: project.ralCode || '', s: valueStyle }, { v: '', s: valueStyle }, { v: '', s: valueStyle },
    { v: 'Transport', s: labelStyle }, { v: '', s: labelStyle },
    { v: 'CAMI ALUMINIUM', s: valueStyle }, { v: '', s: valueStyle },
  ]);

  // Row 16: spacer
  rows.push(Array(11).fill(null));

  // Row 17: Prestation title (C-K)
  rows.push([
    null, null,
    { v: prestationLabel, s: prestStyle },
    null,null,null,null,null,null,null,null
  ]);

  // Row 18: spacer
  rows.push(Array(11).fill(null));

  // Row 19: headers (C-K)
  rows.push([
    null, null,
    { v: 'N°', s: hdrStyle },
    { v: 'REF', s: hdrStyle },
    { v: 'Désignation', s: hdrStyle }, { v: '', s: hdrStyle }, // E-F merged
    { v: 'L(mm)', s: hdrStyle },
    { v: 'H(mm)', s: hdrStyle },
    { v: 'QTE', s: hdrStyle },
    { v: 'M²', s: hdrStyle },
    { v: 'REMARQUE', s: hdrStyle },
  ]);

  // Data rows
  let itemNum = 1;
  units.forEach((u, idx) => {
    const isComp = u.isComponent;
    const { lmm, hmm } = parseDim(u.dimension);
    const ds = isComp ? dataStyleGrey : dataStyle;
    const dsL = isComp ? dataStyleLeftGrey : dataStyleLeft;
    const excelRow = firstDataRow + idx;
    let label = u.chassisType || '';
    if (isComp) label = `  ↳ ${u.role || ''} — ${u.chassisType || ''}`;

    rows.push([
      null, null,
      { v: isComp ? '' : itemNum++, s: ds },   // C
      { v: u.chassisRepere || '', s: ds },       // D
      { v: label, s: { ...dsL, font: { ...dsL.font, italic: isComp } } }, // E
      { v: '', s: ds },                          // F (merged with E)
      { v: lmm, s: ds },                         // G
      { v: hmm, s: ds },                         // H
      { v: 1, s: { ...ds, font: { bold: true, sz: 9, name: 'Arial' } } }, // I
      { f: `IF(AND(ISNUMBER(G${excelRow}),ISNUMBER(H${excelRow})),G${excelRow}*H${excelRow}*I${excelRow}/1000000,"_")`, s: ds }, // J
      { v: u.notes || '_', s: dsL },             // K
    ]);
  });

  // Spacer
  rows.push(Array(11).fill(null));

  // Signature row
  rows.push([
    null, null,
    { v: 'Signature Livreur', s: { alignment:{horizontal:'center',vertical:'bottom'}, border:{top:{style:'thin',color:{rgb:'000000'}}} } },
    null, null, null, null, null,
    { v: 'Signature Réceptionnaire', s: { alignment:{horizontal:'center',vertical:'bottom'}, border:{top:{style:'thin',color:{rgb:'000000'}}} } },
    null, null,
  ]);

  const wsXLSX = XLSX.utils.aoa_to_sheet(rows);

  const lastRow = rows.length - 1;
  const infoR = 12; // 0-indexed row for first info row

  wsXLSX['!merges'] = [
    // Logo area: A1:G12 (handled by image)
    // Info block: H1:K12 (handled by image)
    // Info rows: C-D label, E-G value, H-I label, J-K value
    ...([12,13,14,15].flatMap(r => [
      { s:{r,c:2}, e:{r,c:3} },    // C-D label
      { s:{r,c:4}, e:{r,c:6} },    // E-G value
      { s:{r,c:7}, e:{r,c:8} },    // H-I label
      { s:{r,c:9}, e:{r,c:10} },   // J-K value
    ])),
    // Prestation row 17 (0-idx): C-K
    { s:{r:17,c:2}, e:{r:17,c:10} },
    // Header E-F merge (row 19)
    { s:{r:19,c:4}, e:{r:19,c:5} },
    // Data rows: E-F merge for each unit row
    ...units.map((_, idx) => ({ s:{r:20+idx,c:4}, e:{r:20+idx,c:5} })),
    // Signatures
    { s:{r:lastRow,c:2}, e:{r:lastRow,c:4} },
    { s:{r:lastRow,c:8}, e:{r:lastRow,c:10} },
  ];

  wsXLSX['!cols'] = [
    {wch:3},{wch:3},{wch:10},{wch:10},{wch:22},{wch:12},{wch:8},{wch:8},{wch:7},{wch:12},{wch:20}
  ];

  wsXLSX['!rows'] = rows.map((_, i) => {
    if (i < 12) return { hpt: 14 };
    if (i >= 12 && i <= 15) return { hpt: 16 };
    if (i === 16) return { hpt: 6 };
    if (i === 17) return { hpt: 22 };
    if (i === 18) return { hpt: 6 };
    if (i === 19) return { hpt: 22 };
    if (i === lastRow) return { hpt: 45 };
    return { hpt: 14 };
  });

  XLSX.utils.book_append_sheet(wb, wsXLSX, sheetName);
}