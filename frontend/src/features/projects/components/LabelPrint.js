import { useLanguage } from '../../../context/LanguageContext';
import './LabelPrint.css';

/**
 * LabelPrint
 *
 * PRINT FIX: Instead of window.print() (which prints the entire React app page),
 * we open a NEW WINDOW containing ONLY the label HTML, then print that window.
 * This guarantees exactly 1 page with the correct content regardless of app state.
 */
function LabelPrint({
  chassis, project, chassisLabels,
  batchMode = false, batchCurrent, batchTotal,
  onNext, onClose
}) {
  const { t, currentLanguage } = useLanguage();
  const language = currentLanguage;

  const dateStr = project.date
    ? new Date(project.date).toLocaleDateString('fr-FR')
    : '';

  const typeName = chassisLabels[chassis.type]?.[language] || chassis.type;
  const etatName = t(`etat_${chassis.etat}`) || chassis.etat;

  const pt = {
    print:   t('print'),
    close:   t('close'),
    preview: t('labelPreview'),
    project: t('labelProject'),
    ref:     t('labelRef'),
    ral:     t('labelRal'),
    repere:  t('labelRepere'),
    type:    t('labelType'),
    dim:     t('labelDim'),
    etat:    t('labelEtat'),
    qty:     t('labelQty'),
  };

  // Build the HTML for the printed label in a brand new window
  const handlePrint = () => {
    const ralHex = project.ralColor || '#cccccc';

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>CAMI — ${project.name} — ${chassis.repere}</title>
  <style>
    @page {
      size: 9.5cm 5.5cm;
      margin: 0.4cm;
      /* Remove browser default headers & footers */
    }
    @media print {
      html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 8.7cm;
      height: 4.0cm;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      background: #fff;
      overflow: hidden;
    }
    .label {
      width: 100%;
      height: 100%;
      padding: 3mm;
      display: flex;
      flex-direction: column;
      gap: 1.5mm;
    }
    .label__header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1.5px solid #1a1a1a;
      padding-bottom: 1.5mm;
      margin-bottom: 1mm;
    }
    .label__brand {
      font-size: 9pt;
      font-weight: 900;
      color: #1a1a1a;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .label__ral-swatch {
      width: 10mm;
      height: 6mm;
      border-radius: 2px;
      border: 1px solid #ccc;
      background-color: ${ralHex};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .label__row {
      display: flex;
      gap: 8mm;
    }
    .label__field {
      display: flex;
      gap: 2px;
      align-items: baseline;
    }
    .label__key {
      font-size: 6pt;
      font-weight: 700;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      white-space: nowrap;
    }
    .label__val {
      font-size: 7pt;
      font-weight: 500;
      color: #1a1a1a;
    }
    .label__divider {
      border-top: 1px dashed #ccc;
      margin: 1mm 0;
    }
    .label__grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5mm 8mm;
      flex: 1;
    }
    .label__cell {
      display: flex;
      flex-direction: column;
      gap: 0.5mm;
    }
    .label__repere-val {
      font-size: 14pt;
      font-weight: 900;
      color: #1a1a1a;
      letter-spacing: -0.02em;
      line-height: 1;
    }
    .label__full {
      grid-column: 1 / -1;
    }
  </style>
</head>
<body>
  <div class="label">
    <div class="label__header">
      <span class="label__brand">CAMI ALUMINIUM</span>
      <span class="label__ral-swatch"></span>
    </div>
    <div class="label__row">
      <span class="label__field">
        <span class="label__key">${pt.project}</span>
        <span class="label__val">${project.name}</span>
      </span>
      <span class="label__field">
        <span class="label__key">${pt.ref}</span>
        <span class="label__val">${project.reference}</span>
      </span>
    </div>
    <div class="label__row">
      <span class="label__field">
        <span class="label__key">${pt.ral}</span>
        <span class="label__val">${project.ralCode}</span>
      </span>
      <span class="label__field">
        <span class="label__key">Date</span>
        <span class="label__val">${dateStr}</span>
      </span>
    </div>
    <div class="label__divider"></div>
    <div class="label__grid">
      <div class="label__cell">
        <span class="label__key">${pt.repere}</span>
        <span class="label__repere-val">${chassis.repere}</span>
      </div>
      <div class="label__cell">
        <span class="label__key">${pt.type}</span>
        <span class="label__val">${typeName}</span>
      </div>
      <div class="label__cell">
        <span class="label__key">${pt.dim}</span>
        <span class="label__val">${chassis.largeur} × ${chassis.hauteur} mm</span>
      </div>
      <div class="label__cell">
        <span class="label__key">${pt.qty}</span>
        <span class="label__val">${chassis.quantity || 1}</span>
      </div>
      <div class="label__cell label__full">
        <span class="label__key">${pt.etat}</span>
        <span class="label__val">${etatName}</span>
      </div>
    </div>
  </div>
  <script>
    window.onload = function() {
      // Remove default browser title so header shows our custom title not URL
      document.title = '';
      window.focus();
      window.print();
      setTimeout(function() { window.close(); }, 800);
    };
  </script>
</body>
</html>`;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
    }
  };

  const labelProps = { project, chassis, dateStr, typeName, etatName, pt };

  return (
    <div className="modal-overlay label-preview-overlay" onClick={onClose}>
      <div className="modal label-preview-modal" onClick={e => e.stopPropagation()}>
        <h2>
          {pt.preview}
          {batchMode && <span className="batch-indicator"> — {batchCurrent}/{batchTotal}</span>}
        </h2>

        <div className="label-preview-frame">
          <LabelContent {...labelProps} />
        </div>

        <div className="modal-actions">
          <button onClick={onClose}>{pt.close}</button>
          {batchMode ? (
            <button className="primary" onClick={() => { handlePrint(); setTimeout(onNext, 300); }}>
              {batchCurrent < batchTotal ? `${pt.print} & Suivant →` : `${pt.print} & Fermer`}
            </button>
          ) : (
            <button className="primary" onClick={handlePrint}>{pt.print}</button>
          )}
        </div>
      </div>
    </div>
  );
}

function LabelContent({ project, chassis, dateStr, typeName, etatName, pt }) {
  return (
    <div className="label">
      <div className="label__header">
        <span className="label__brand">CAMI ALUMINIUM</span>
        <span className="label__ral-swatch" style={{ backgroundColor: project.ralColor || '#eee' }} />
      </div>
      <div className="label__project-row">
        <span className="label__field">
          <span className="label__key">{pt.project}</span>
          <span className="label__val">{project.name}</span>
        </span>
        <span className="label__field">
          <span className="label__key">{pt.ref}</span>
          <span className="label__val">{project.reference}</span>
        </span>
      </div>
      <div className="label__project-row">
        <span className="label__field">
          <span className="label__key">{pt.ral}</span>
          <span className="label__val">{project.ralCode}</span>
        </span>
        <span className="label__field">
          <span className="label__key">Date</span>
          <span className="label__val">{dateStr}</span>
        </span>
      </div>
      <div className="label__divider" />
      <div className="label__chassis-grid">
        <div className="label__chassis-field">
          <span className="label__key">{pt.repere}</span>
          <span className="label__val label__repere">{chassis.repere}</span>
        </div>
        <div className="label__chassis-field">
          <span className="label__key">{pt.type}</span>
          <span className="label__val">{typeName}</span>
        </div>
        <div className="label__chassis-field">
          <span className="label__key">{pt.dim}</span>
          <span className="label__val">{chassis.largeur} × {chassis.hauteur} mm</span>
        </div>
        <div className="label__chassis-field">
          <span className="label__key">{pt.qty}</span>
          <span className="label__val">{chassis.quantity || 1}</span>
        </div>
        <div className="label__chassis-field" style={{ gridColumn: '1 / -1' }}>
          <span className="label__key">{pt.etat}</span>
          <span className="label__val label__etat">{etatName}</span>
        </div>
      </div>
    </div>
  );
}

export default LabelPrint;
