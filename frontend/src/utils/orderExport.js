import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABELS = {
  en_attente: { fr: 'En attente', en: 'Pending',   it: 'In attesa'  },
  partielle:  { fr: 'Partielle',  en: 'Partial',   it: 'Parziale'   },
  recue:      { fr: 'Reçue',      en: 'Received',  it: 'Ricevuta'   },
  annulee:    { fr: 'Annulée',    en: 'Cancelled', it: 'Annullata'  },
};

function statusLabel(status, lang) {
  return STATUS_LABELS[status]?.[lang] || STATUS_LABELS[status]?.fr || status;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR');
}

function runAutoTable(doc, options) {
  if (typeof doc.autoTable === 'function') {
    doc.autoTable(options);
  } else {
    autoTable(doc, options);
  }
}

/**
 * Clean URLs that have BBCode or markdown artifacts appended.
 * e.g. "https://i.ibb.co/x.jpg[/img][/url]" → "https://i.ibb.co/x.jpg"
 */
function cleanUrl(url) {
  if (!url) return null;
  // Strip everything from the first non-URL character after the extension
  return url.replace(/[\[\]<>"\s].*$/, '').trim() || null;
}

/**
 * Load a remote image via an <img> element (avoids CORS fetch restrictions)
 * and return a base64 data-URL, or null on failure.
 */
function toBase64(url) {
  const clean = cleanUrl(url);
  if (!clean) return Promise.resolve(null);
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // request CORS headers when available
    const canvas = document.createElement('canvas');
    img.onload = () => {
      try {
        canvas.width  = img.naturalWidth  || 80;
        canvas.height = img.naturalHeight || 80;
        canvas.getContext('2d').drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      } catch {
        // Canvas tainted (CORS denied) — resolve null, fallback to default
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    // Short timeout so a broken image doesn't stall the whole export
    setTimeout(() => resolve(null), 6000);
    img.src = clean;
  });
}

/**
 * Tiny inline SVG used when an item has no image.
 * Matches the 📦 placeholder already used in InventoryPage.
 */
const DEFAULT_IMG = 'data:image/svg+xml;base64,' + btoa(
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">' +
  '<rect width="80" height="80" rx="10" fill="#f3f4f6"/>' +
  '<rect x="20" y="28" width="40" height="30" rx="3" fill="#d1d5db"/>' +
  '<rect x="20" y="28" width="40" height="10" rx="3" fill="#9ca3af"/>' +
  '<rect x="34" y="28" width="12" height="10" fill="#6b7280"/>' +
  '</svg>'
);

// ── Excel export ──────────────────────────────────────────────────────────────

/**
 * Export all visible orders to a single .xlsx file.
 * One row per order line, with order metadata repeated on each row.
 */
export function exportOrdersExcel(orders, lang = 'fr') {
  const wb = XLSX.utils.book_new();

  const rows = [];
  orders.forEach(order => {
    (order.lines || []).forEach(line => {
      const designation = line.itemId?.designation?.[lang]
                       || line.itemId?.designation?.fr
                       || '—';
      rows.push({
        'Référence':       order.reference,
        'Société':         order.companyId?.name || '—',
        'Fournisseur':     order.supplier        || '—',
        'Date commande':   fmtDate(order.orderDate),
        'Date prévue':     fmtDate(order.expectedDate),
        'Statut':          statusLabel(order.status, lang),
        'Article':         designation,
        'Qté commandée':   line.quantityOrdered,
        'Qté reçue':       line.quantityReceived || 0,
        'Prix unitaire':   line.unitPrice        || 0,
        'Total ligne':     +((line.quantityOrdered * (line.unitPrice || 0)).toFixed(2)),
        'Note article':    line.note             || '',
        'Notes commande':  order.notes           || '',
      });
    });
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [16, 14, 18, 14, 14, 12, 32, 14, 10, 13, 12, 22, 22].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, 'Commandes');
  XLSX.writeFile(wb, `commandes_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// ── PDF export (single order) ─────────────────────────────────────────────────

/**
 * Generate and download a PDF for a single order.
 *
 * @param {object} order   - full order object (lines populated with itemId)
 * @param {string} lang    - 'fr' | 'en' | 'it'
 * @param {object} company - company object { name, address, email, phone, logo }
 */
export async function exportOrderPDF(order, lang = 'fr', company = null) {
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW  = doc.internal.pageSize.getWidth();
  const pageH  = doc.internal.pageSize.getHeight();
  const margin = 14;
  const lines  = order.lines || [];

  // ── Pre-fetch all product images in parallel ──────────────────────────────
  const images = await Promise.all(
    lines.map(async line => {
      const b64 = await toBase64(line.itemId?.image);
      return b64 || DEFAULT_IMG;
    })
  );

  // Company logo
  let logoB64 = null;
  if (company?.logo) logoB64 = await toBase64(company.logo);

  // ── Header band ───────────────────────────────────────────────────────────
  doc.setFillColor(10, 10, 10);
  doc.rect(0, 0, pageW, 30, 'F');

  const logoW = 22, logoH = 18;
  let textX = margin;
  if (logoB64) {
    try {
      doc.addImage(logoB64, margin, 5, logoW, logoH);
      textX = margin + logoW + 4;
    } catch { /* skip */ }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text(company?.name || 'Commande', textX, 14);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  if (company?.address) doc.text(company.address, textX, 20);
  if (company?.phone || company?.email) {
    doc.text([company?.phone, company?.email].filter(Boolean).join('  •  '), textX, 26);
  }

  // Order ref top-right
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(order.reference, pageW - margin, 13, { align: 'right' });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const docLabel = { fr: 'Bon de commande', en: 'Purchase Order', it: 'Ordine d\'acquisto' }[lang] || 'Bon de commande';
  doc.text(docLabel, pageW - margin, 20, { align: 'right' });

  let y = 38;
  doc.setTextColor(20, 20, 20);

  // ── Info block (two columns) ───────────────────────────────────────────────
  const L = {
    fr: { supplier: 'Fournisseur', ordered: 'Date commande', expected: 'Date prévue', status: 'Statut', society: 'Société', notes: 'Notes' },
    en: { supplier: 'Supplier',    ordered: 'Order date',    expected: 'Expected date', status: 'Status', society: 'Company', notes: 'Notes' },
    it: { supplier: 'Fornitore',   ordered: 'Data ordine',   expected: 'Data prevista', status: 'Stato',  society: 'Società', notes: 'Note' },
  }[lang] || {};

  const colMid = pageW / 2 + 4;
  const infoLeft = [
    [L.supplier, order.supplier || '—'],
    [L.ordered,  fmtDate(order.orderDate)],
    [L.expected, fmtDate(order.expectedDate)],
  ];
  const infoRight = [
    [L.society, order.companyId?.name || company?.name || '—'],
    [L.status,  statusLabel(order.status, lang)],
  ];

  doc.setFontSize(9);
  infoLeft.forEach(([label, value], i) => {
    doc.setFont('helvetica', 'bold');   doc.text(label + ' :', margin, y + i * 6);
    doc.setFont('helvetica', 'normal'); doc.text(value,        margin + 36, y + i * 6);
  });
  infoRight.forEach(([label, value], i) => {
    doc.setFont('helvetica', 'bold');   doc.text(label + ' :', colMid,      y + i * 6);
    doc.setFont('helvetica', 'normal'); doc.text(value,        colMid + 26, y + i * 6);
  });

  y += Math.max(infoLeft.length, infoRight.length) * 6 + 4;

  if (order.notes) {
    doc.setFont('helvetica', 'bold');   doc.text(L.notes + ' :', margin, y);
    doc.setFont('helvetica', 'normal'); doc.text(order.notes, margin + 14, y);
    y += 6;
  }

  // ── Divider ───────────────────────────────────────────────────────────────
  doc.setDrawColor(220, 220, 220);
  doc.line(margin, y, pageW - margin, y);
  y += 5;

  // ── Articles table with images ────────────────────────────────────────────
  const IMG = 14; // image cell size in mm

  const colHeaders = {
    fr: ['', 'Désignation', 'Qté cmd.', 'Qté reçue', 'Prix unit.', 'Total', 'Note'],
    en: ['', 'Designation', 'Qty ord.', 'Qty recv.', 'Unit price', 'Total', 'Note'],
    it: ['', 'Designazione','Qtà ord.', 'Qtà ric.',  'Prezzo u.',  'Totale','Nota'],
  }[lang] || [];

  runAutoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [colHeaders],
    body: lines.map(line => [
      '',   // image — drawn in didDrawCell
      line.itemId?.designation?.[lang] || line.itemId?.designation?.fr || '—',
      line.quantityOrdered,
      line.quantityReceived || 0,
      (line.unitPrice || 0).toFixed(2) + ' MAD',
      (line.quantityOrdered * (line.unitPrice || 0)).toFixed(2) + ' MAD',
      line.note || '',
    ]),
    columnStyles: {
      0: { cellWidth: IMG + 4, cellPadding: 1 },
      1: { cellWidth: 52 },
      2: { halign: 'center', cellWidth: 20 },
      3: { halign: 'center', cellWidth: 20 },
      4: { halign: 'right',  cellWidth: 22 },
      5: { halign: 'right',  cellWidth: 22 },
      6: { cellWidth: 28, fontSize: 7 },
    },
    headStyles: {
      fillColor: [10, 10, 10], textColor: 255,
      fontStyle: 'bold', fontSize: 8,
    },
    bodyStyles: { fontSize: 8, minCellHeight: IMG + 4 },
    alternateRowStyles: { fillColor: [247, 248, 250] },

    // Draw product image inside image cell
    didDrawCell(data) {
      if (data.section === 'body' && data.column.index === 0) {
        const img = images[data.row.index];
        if (img) {
          try {
            doc.addImage(img, data.cell.x + 1, data.cell.y + 1, IMG, IMG);
          } catch { /* corrupt image — skip */ }
        }
      }
    },

    // Colour received rows green
    didParseCell(data) {
      if (data.section === 'body') {
        const line   = lines[data.row.index];
        const recv   = line?.quantityReceived || 0;
        const ordered = line?.quantityOrdered  || 1;
        if (recv >= ordered) data.cell.styles.textColor = [22, 163, 74];
      }
    },
  });

  y = (doc.lastAutoTable?.finalY || y + 40) + 8;

  // ── Totals block ──────────────────────────────────────────────────────────
  const totalOrdered  = lines.reduce((s, l) => s + (l.quantityOrdered || 0), 0);
  const totalReceived = lines.reduce((s, l) => s + (l.quantityReceived || 0), 0);
  const totalHT       = lines.reduce((s, l) => s + (l.quantityOrdered * (l.unitPrice || 0)), 0);
  const progress      = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;

  const totLabel = {
    fr: { art: 'Articles', recv: 'Réceptionnés', prog: 'Progression', ht: 'Total HT' },
    en: { art: 'Items', recv: 'Received', prog: 'Progress', ht: 'Total excl. tax' },
    it: { art: 'Articoli', recv: 'Ricevuti', prog: 'Progresso', ht: 'Totale IVA escl.' },
  }[lang] || {};

  if (y > pageH - 40) { doc.addPage(); y = margin; }

  doc.setDrawColor(220, 220, 220);
  doc.line(margin, y, pageW - margin, y);
  y += 5;

  const totRows = [
    [totLabel.art,  `${lines.length}`],
    [totLabel.recv, `${totalReceived} / ${totalOrdered} (${progress}%)`],
    [totLabel.ht,   `${totalHT.toFixed(2)} MAD`],
  ];
  doc.setFontSize(9);
  totRows.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');   doc.text(label + ' :', pageW - margin - 70, y);
    doc.setFont('helvetica', 'normal'); doc.text(value,         pageW - margin,     y, { align: 'right' });
    y += 6;
  });

  // ── Footer (all pages) ────────────────────────────────────────────────────
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(160);
    doc.text(
      `${company?.name || ''} — ${order.reference} — ${fmtDate(order.orderDate)} — ${i}/${pageCount}`,
      margin,
      pageH - 6
    );
  }

  doc.save(`commande_${order.reference.replace(/\s+/g, '_')}.pdf`);
}