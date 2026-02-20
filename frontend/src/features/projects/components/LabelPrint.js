import { useLanguage } from '../../../context/LanguageContext';
import './LabelPrint.css';

/**
 * Shared print HTML builder — used by both single print and batch print.
 *
 * Each item in chassisList may carry an optional `_component` field:
 *   { repere, role, largeur, hauteur, unitLabel }
 * When present, the label is printed for the COMPONENT, not the parent chassis.
 * `_printRowIndex` is still used to disambiguate the parent unit instance label.
 */
export function buildLabelHTML(chassisList, project, chassisLabels, language) {
  const ralHex  = project.ralColor || '#cccccc';
  const dateStr = project.date ? new Date(project.date).toLocaleDateString('fr-FR') : '';

  const oneLabelHTML = (chassis) => {
    const comp     = chassis._component;  // set for composite component labels
    const typeName = chassisLabels[chassis.type]?.[language] || chassis.type;
    const qty      = chassis._totalQty || chassis.quantity || 1;
    const unitNum  = (chassis._printRowIndex ?? 0);
    const unitSuffix = qty > 1 ? ` #${unitNum + 1}` : '';

    // For a component label: repere = comp.repere, type = role, dims = comp dims
    const repere = comp ? comp.repere                           : `${chassis.repere}${unitSuffix}`;
    const type   = comp ? comp.roleLabel                        : typeName;
    const largeur = comp ? comp.largeur : chassis.largeur;
    const hauteur = comp ? comp.hauteur : chassis.hauteur;
    // Show parent repere + unit as a sub-line when printing a component
    const parentLine = comp ? `<div class="parent-ref"><span class="k">Châssis</span> <span class="v">${chassis.repere}${unitSuffix}</span></div>` : '';

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
      <div class="cell"><span class="k">Repère</span><span class="repere">${repere}</span></div>
      <div class="cell"><span class="k">Type</span><span class="v">${type}</span></div>
      <div class="cell full"><span class="k">Dimensions</span><span class="dim">${largeur} × ${hauteur} mm</span></div>
    </div>
    ${parentLine}
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
  @page {
    size: 9.5cm 5.5cm;
    margin: 0mm;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 9.5cm;
    height: 5.5cm;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @media print {
    html, body { margin: 0 !important; padding: 0 !important; }
    .page { page-break-after: always; page-break-inside: avoid; }
    .page:last-child { page-break-after: avoid; }
  }
  .page  {
    width: 9.5cm;
    height: 5.5cm;
    overflow: hidden;
    display: block;
  }
  .label {
    width: 9.5cm;
    height: 5.5cm;
    padding: 3mm 4mm;
    display: flex;
    flex-direction: column;
    gap: 1.2mm;
    overflow: hidden;
  }
  .lh    { display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px solid #1a1a1a; padding-bottom: 1.2mm; }
  .brand { font-size: 8.5pt; font-weight: 900; color: #1a1a1a; letter-spacing: 0.05em; text-transform: uppercase; }
  .swatch { width: 10mm; height: 5mm; border-radius: 2px; border: 1px solid #ccc; background-color: ${ralHex}; flex-shrink: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .row   { display: flex; gap: 6mm; }
  .f     { display: flex; gap: 2px; align-items: baseline; }
  .k     { font-size: 5.5pt; font-weight: 700; color: #666; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; margin-right: 2px; }
  .v     { font-size: 6.5pt; font-weight: 500; color: #1a1a1a; }
  .div   { border-top: 1px dashed #ccc; margin: 0; flex-shrink: 0; }
  .grid  { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5mm 2mm; flex: 1; min-height: 0; }
  .cell  { display: flex; flex-direction: column; gap: 0mm; }
  .full  { grid-column: 1 / -1; }
  .repere { font-size: 17pt; font-weight: 900; color: #1a1a1a; letter-spacing: -0.02em; line-height: 1; }
  .dim   { font-size: 9.5pt; font-weight: 700; color: #1a1a1a; line-height: 1.1; }
  .parent-ref { font-size: 5.5pt; color: #888; }
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
</script>
</body>
</html>`;
}

/* ── Single label print modal ── */
function LabelPrint({ chassis, project, chassisLabels, onClose }) {
  const { t, currentLanguage } = useLanguage();
  const language = currentLanguage;

  const comp       = chassis._component;   // set when printing a composite component
  const dateStr    = project.date ? new Date(project.date).toLocaleDateString('fr-FR') : '';
  const typeName   = chassisLabels[chassis.type]?.[language] || chassis.type;
  const qty        = chassis._totalQty || chassis.quantity || 1;
  const unitIndex  = chassis._printRowIndex ?? 0;
  const unitSuffix = qty > 1 ? ` #${unitIndex + 1}` : '';

  // What to show in the preview and on the printed label
  const displayRepere  = comp ? comp.repere    : `${chassis.repere}${unitSuffix}`;
  const displayType    = comp ? comp.roleLabel  : typeName;
  const displayLargeur = comp ? comp.largeur    : chassis.largeur;
  const displayHauteur = comp ? comp.hauteur    : chassis.hauteur;

  const handlePrint = () => {
    const html = buildLabelHTML([{ ...chassis }], project, chassisLabels, language);
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
                <span className="lp-repere">{displayRepere}</span>
              </div>
              <div className="lp-cell">
                <span className="lp-k">{t('labelType')}</span>
                <span className="lp-v">{displayType}</span>
              </div>
              <div className="lp-cell lp-full">
                <span className="lp-k">{t('labelDim')}</span>
                <span className="lp-dim">{displayLargeur} × {displayHauteur} mm</span>
              </div>
            </div>
            {comp && (
              <div style={{ fontSize: '9px', color: '#888', marginTop: 4 }}>
                Châssis : {chassis.repere}{unitSuffix}
              </div>
            )}
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