import { useLanguage } from '../../../context/LanguageContext';
import './LabelPrint.css';

/* Shared print HTML builder — used by both single print and batch print */
export function buildLabelHTML(chassisList, project, chassisLabels, language) {
  const ralHex  = project.ralColor || '#cccccc';
  const dateStr = project.date ? new Date(project.date).toLocaleDateString('fr-FR') : '';

  const oneLabelHTML = (chassis) => {
    const typeName = chassisLabels[chassis.type]?.[language] || chassis.type;
    const rowNum   = (chassis._printRowIndex ?? 0) > 0 ? ` #${chassis._printRowIndex + 1}` : '';
    return `<div class="label">
    <div class="lh">
      <span class="brand">CAMI ALUMINIUM</span>
      <span class="swatch"></span>
    </div>
    <div class="row">
      <span class="f"><span class="k">Projet</span><span class="v">${project.name}</span></span>
      <span class="f"><span class="k">Réf.</span><span class="v">${project.reference}</span></span>
    </div>
    <div class="row">
      <span class="f"><span class="k">RAL</span><span class="v">${project.ralCode}</span></span>
      <span class="f"><span class="k">Date</span><span class="v">${dateStr}</span></span>
    </div>
    <div class="div"></div>
    <div class="grid">
      <div class="cell"><span class="k">Repère</span><span class="repere">${chassis.repere}${rowNum}</span></div>
      <div class="cell"><span class="k">Type</span><span class="v">${typeName}</span></div>
      <div class="cell full"><span class="k">Dimensions</span><span class="dim">${chassis.largeur} × ${chassis.hauteur} mm</span></div>
    </div>
  </div>`;
  };

  const pages = chassisList.map(ch =>
    `<div class="page">${oneLabelHTML(ch)}</div>`
  ).join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title> </title>
<style>
  /* Setting margin:0 on @page removes the browser's space for date/URL headers+footers */
  @page {
    size: 9.5cm 5.5cm;
    margin: 0;
  }
  @media print {
    html, body { margin: 0 !important; padding: 0 !important; }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { page-break-after: always; }
    .page:last-child { page-break-after: avoid; }
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page  { width: 9.5cm; height: 5.5cm; overflow: hidden; }
  .label { width: 100%; height: 100%; padding: 0mm; display: flex; flex-direction: column; gap: 0mm; }
  .lh    { display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px solid #1a1a1a; padding-bottom: 1.5mm; margin-bottom: 1mm; }
  .brand { font-size: 9pt; font-weight: 900; color: #1a1a1a; letter-spacing: 0.05em; text-transform: uppercase; }
  .swatch { width: 10mm; height: 6mm; border-radius: 2px; border: 1px solid #ccc; background-color: ${ralHex}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .row   { display: flex; gap: 8mm; }
  .f     { display: flex; gap: 2px; align-items: baseline; }
  .k     { font-size: 6pt; font-weight: 700; color: #666; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; margin-right: 2px; }
  .v     { font-size: 7pt; font-weight: 500; color: #1a1a1a; }
  .div   { border-top: 1px dashed #ccc; margin: 1mm 0; }
  .grid  { display: grid; grid-template-columns: 1fr 1fr; gap: 0mm 1mm; flex: 1; }
  .cell  { display: flex; flex-direction: column; gap: 0.0mm; }
  .full  { grid-column: 1 / -1; }
  .repere { font-size: 18pt; font-weight: 900; color: #1a1a1a; letter-spacing: -0.02em; line-height: 1; }
  .dim   { font-size: 10pt; font-weight: 700; color: #1a1a1a; }
</style>
</head>
<body>
${pages}
<script>
  document.title = ' ';
  window.onload = function() {
    window.focus();
    window.print();
    setTimeout(function(){ window.close(); }, 1000);
  };
<\/script>
</body>
</html>`;
}

/* ── Single label print modal ── */
function LabelPrint({ chassis, project, chassisLabels, onClose }) {
  const { t, currentLanguage } = useLanguage();
  const language = currentLanguage;

  const dateStr  = project.date ? new Date(project.date).toLocaleDateString('fr-FR') : '';
  const typeName = chassisLabels[chassis.type]?.[language] || chassis.type;
  const rowNum   = (chassis._printRowIndex ?? 0) > 0 ? ` #${chassis._printRowIndex + 1}` : '';

  const handlePrint = () => {
    const html = buildLabelHTML(
      [{ ...chassis, _printRowIndex: chassis._printRowIndex ?? 0 }],
      project,
      chassisLabels,
      language
    );
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal label-preview-modal" onClick={e => e.stopPropagation()}>
        <h2>{t('labelPreview')}</h2>

        <div className="label-preview-frame">
          <div className="label-preview">
            <div className="lp-header">
              <span className="lp-brand">CAMI ALUMINIUM</span>
              <span className="lp-swatch" style={{ backgroundColor: project.ralColor || '#eee' }} />
            </div>
            <div className="lp-row">
              <span className="lp-field"><span className="lp-k">{t('labelProject')}</span><span className="lp-v">{project.name}</span></span>
              <span className="lp-field"><span className="lp-k">{t('labelRef')}</span><span className="lp-v">{project.reference}</span></span>
            </div>
            <div className="lp-row">
              <span className="lp-field"><span className="lp-k">{t('labelRal')}</span><span className="lp-v">{project.ralCode}</span></span>
              <span className="lp-field"><span className="lp-k">Date</span><span className="lp-v">{dateStr}</span></span>
            </div>
            <div className="lp-divider" />
            <div className="lp-grid">
              <div className="lp-cell">
                <span className="lp-k">{t('labelRepere')}</span>
                <span className="lp-repere">{chassis.repere}{rowNum}</span>
              </div>
              <div className="lp-cell">
                <span className="lp-k">{t('labelType')}</span>
                <span className="lp-v">{typeName}</span>
              </div>
              <div className="lp-cell lp-full">
                <span className="lp-k">{t('labelDim')}</span>
                <span className="lp-dim">{chassis.largeur} × {chassis.hauteur} mm</span>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button onClick={onClose}>{t('close')}</button>
          <button className="primary" onClick={handlePrint}>{t('print')}</button>
        </div>
      </div>
    </div>
  );
}

export default LabelPrint;