import { useEffect, useState } from 'react';
import { useLanguage, translate } from '../../../context/LanguageContext';
import './LabelPrint.css';

// Ticket models: 'standard' (the usual ticket) or 'big' (project + repère printed BIG).
// The last model chosen is remembered on this computer and used by every print button.
export const LABEL_MODELS = ['standard', 'big'];
const MODEL_KEY = 'cami_label_model';
export function getLabelModel() {
  try { const m = localStorage.getItem(MODEL_KEY); return LABEL_MODELS.includes(m) ? m : 'standard'; } catch { return 'standard'; }
}
export function setLabelModel(m) {
  try { localStorage.setItem(MODEL_KEY, m); } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent('cami-label-model', { detail: m })); // every switch on the page follows
}
// Current model, kept in step with the other switches of the page
export function useLabelModel() {
  const [model, setModel] = useState(getLabelModel);
  useEffect(() => {
    const h = (e) => setModel(e.detail);
    window.addEventListener('cami-label-model', h);
    return () => window.removeEventListener('cami-label-model', h);
  }, []);
  return [model, (m) => { setLabelModel(m); setModel(m); }];
}

// « Standard | Grand repère » switch
export function LabelModelSwitch({ value, onChange, compact = false }) {
  const { t } = useLanguage();
  return (
    <div className={`label-model-switch${compact ? ' label-model-switch--compact' : ''}`} role="radiogroup" aria-label={t('labelModel')}>
      {!compact && <span className="label-model-switch__k">{t('labelModel')}</span>}
      {LABEL_MODELS.map(m => (
        <button key={m} type="button" role="radio" aria-checked={value === m}
          className={value === m ? 'is-on' : ''}
          onClick={() => onChange(m)}>
          {t(m === 'big' ? 'labelModelBig' : 'labelModelStandard')}
        </button>
      ))}
    </div>
  );
}

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * « Grand repère » tickets: project name and repère printed as big as the ticket allows
 * (each text shrinks just enough to fit), RAL, type and dimensions in small at the bottom.
 * Same paper size as the standard ticket (9.5 × 5.5 cm). `print: false` → for the preview (no print dialog).
 */
export function buildBigLabelHTML(chassisList, project, chassisLabels, language, { print = true } = {}) {
  const ralHex = project.ralColor || '#cccccc';
  // « RAL 7016 » (the code may already start with RAL)
  const ralText = !project.ralCode ? '' : /^\s*ral\b/i.test(project.ralCode) ? project.ralCode : `RAL ${project.ralCode}`;

  const oneLabelHTML = (chassis) => {
    const comp = chassis._component;
    const typeName = chassisLabels[chassis.type]?.[language] || chassis.type;
    const qty = chassis._totalQty || chassis.quantity || 1;
    const unitSuffix = qty > 1 ? ` #${(chassis._printRowIndex ?? 0) + 1}` : '';
    // BIG: the chassis repère (« 68 B40 #2 »), also for a piece of a composite chassis;
    // that piece (« Dormant », « Vantail 1 ») is written small under it
    const repere = `${chassis.repere}${unitSuffix}`;
    const piece = comp ? (comp.repere && comp.repere !== comp.roleLabel ? `${comp.roleLabel} · ${comp.repere}` : comp.roleLabel) : '';
    const largeur = comp ? comp.largeur : chassis.largeur;
    const hauteur = comp ? comp.hauteur : chassis.hauteur;
    return `<div class="label">
    <div class="top">
      <span class="swatch"></span>
      <div class="project"><div class="fit" data-fit="22" data-min="7" data-wrap="1">${esc(project.name)}</div></div>
    </div>
    <div class="mid">
      <div class="fit repere" data-fit="64" data-min="12">${esc(repere)}</div>
      ${piece ? `<div class="piece">${esc(piece)}</div>` : ''}
    </div>
    <div class="bottom">
      <span><b>${esc(typeName)}</b>${largeur && hauteur ? ` · ${esc(largeur)} × ${esc(hauteur)} mm` : ''}</span>
      <span>${esc(ralText)}${project.reference ? ` · ${esc(project.reference)}` : ''}</span>
    </div>
  </div>`;
  };

  const pages = chassisList.map(ch => `<div class="page">${oneLabelHTML(ch)}</div>`).join('\n');
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title> </title>
<style>
  @page { size: 9.5cm 5.5cm; margin: 0mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 9.5cm; margin: 0 !important; padding: 0 !important; background: #fff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  @media print {
    .page { page-break-after: always; page-break-inside: avoid; }
    .page:last-child { page-break-after: avoid; }
  }
  @media screen { .page + .page { margin-top: 4mm; } }
  .page { width: 9.5cm; height: 5.5cm; overflow: hidden; display: block; background: #fff; }
  .label { width: 9.5cm; height: 5.5cm; padding: 2.5mm 3.5mm; display: flex; flex-direction: column; gap: 1.2mm; overflow: hidden; color: #111; }
  .top { display: flex; align-items: center; gap: 2.5mm; height: 12mm; flex-shrink: 0; border-bottom: 1.5px solid #111; padding-bottom: 1.2mm; }
  .swatch { width: 4mm; align-self: stretch; border-radius: 1mm; border: 1px solid #bbb; background-color: ${ralHex}; flex-shrink: 0; }
  .project { flex: 1; min-width: 0; height: 100%; display: flex; align-items: center; overflow: hidden; }
  .project .fit { width: 100%; font-weight: 900; line-height: 1.12; letter-spacing: -0.01em; text-transform: uppercase; overflow: hidden; padding-top: 0.3mm; }
  .mid { flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; }
  .repere { width: 100%; text-align: center; font-weight: 900; line-height: 1.05; letter-spacing: -0.03em; white-space: nowrap; overflow: hidden; }
  .piece { font-size: 11pt; font-weight: 800; color: #333; margin-top: 0.6mm; white-space: nowrap; text-transform: uppercase; letter-spacing: 0.04em; }
  .bottom { display: flex; justify-content: space-between; gap: 3mm; flex-shrink: 0; border-top: 1px dashed #bbb; padding-top: 1mm; font-size: 7pt; color: #333; white-space: nowrap; overflow: hidden; }
  .bottom span { overflow: hidden; text-overflow: ellipsis; }
  .bottom span:first-child { flex: 0 0 auto; }               /* type + dimensions always whole */
  .bottom span:last-child { flex: 0 1 auto; min-width: 0; text-align: right; } /* RAL · réf. shortened first */
</style>
</head>
<body>
${pages}
<script>
  // each big text: start at its maximum size, shrink until it fits its box (width of the text, and the
  // height of everything in its box). A word too long even at the smallest size is then cut over 2 lines.
  function fitAll() {
    document.querySelectorAll('[data-fit]').forEach(function (el) {
      var size = parseFloat(el.getAttribute('data-fit')), min = parseFloat(el.getAttribute('data-min') || '6');
      var box = el.parentNode;
      var range = document.createRange();
      var over = function () {
        var h = 0; for (var i = 0; i < box.children.length; i++) h += box.children[i].offsetHeight;
        range.selectNodeContents(el); // real width of the letters (a clipped text reports no overflow)
        return range.getBoundingClientRect().width > el.clientWidth - 3 || h > box.clientHeight + 1;
      };
      el.style.fontSize = size + 'pt';
      var guard = 0;
      while (size > min && guard++ < 200 && over()) { size -= 0.5; el.style.fontSize = size + 'pt'; }
      if (over() && el.getAttribute('data-wrap')) el.style.overflowWrap = 'anywhere';
    });
  }
  document.title = ' ';
  window.onload = function () {
    fitAll();
    ${print ? "window.focus(); window.print(); setTimeout(function(){ window.close(); }, 1000);" : ''}
  };
</script>
</body>
</html>`;
}

/**
 * Shared print HTML builder — used by both single print and batch print.
 *
 * Each item in chassisList may carry an optional `_component` field:
 *   { repere, role, largeur, hauteur, unitLabel }
 * When present, the label is printed for the COMPONENT, not the parent chassis.
 * `_printRowIndex` is still used to disambiguate the parent unit instance label.
 */
export function buildLabelHTML(chassisList, project, chassisLabels, language, model = getLabelModel()) {
  if (model === 'big') return buildBigLabelHTML(chassisList, project, chassisLabels, language);
  const tr = (k) => translate(language, k);
  const ralHex = project.ralColor || '#cccccc';
  const dateStr = project.date ? new Date(project.date).toLocaleDateString('fr-FR') : '';

  const oneLabelHTML = (chassis) => {
    const comp = chassis._component;  // set for composite component labels
    const typeName = chassisLabels[chassis.type]?.[language] || chassis.type;
    const qty = chassis._totalQty || chassis.quantity || 1;
    const unitNum = (chassis._printRowIndex ?? 0);
    const unitSuffix = qty > 1 ? ` #${unitNum + 1}` : '';

    // For a component label: repere = comp.repere, type = role, dims = comp dims
    const repere = comp ? comp.repere : `${chassis.repere}${unitSuffix}`;
    const type = comp ? comp.roleLabel : typeName;
    const largeur = comp ? comp.largeur : chassis.largeur;
    const hauteur = comp ? comp.hauteur : chassis.hauteur;
    // Show parent repere + unit as a sub-line when printing a component
    const parentLine = comp ? `<div class="parent-ref">${chassis.repere}${unitSuffix}</div>` : '';

    return `<div class="label">
    <div class="lh">
      <span class="brand">CAMI ALUMINIUM</span>
      <span class="swatch"></span>
    </div>
    <div class="row">
      <span class="f"><span class="k">${tr('labelProject')}</span><span class="v">${project.name}</span></span>
      <span class="f"><span class="k">${tr('labelRef')}</span><span class="v">${project.reference}</span></span>
    </div>
    <div class="row">
      <span class="f"><span class="k">${tr('labelRal')}</span><span class="v">${project.ralCode}</span></span>
      <span class="f"><span class="k">${tr('labelDate')}</span><span class="v">${dateStr}</span></span>
    </div>
    <div class="div"></div>
    <div class="grid">
      <div class="cell"><span class="k">${tr('labelRepere')}</span><span class="repere">${repere}${parentLine}</span></div>
      <div class="cell"><span class="k">${tr('labelType')}</span><span class="v">${type}</span></div>
      <div class="cell full"><span class="k">${tr('labelDim')}</span><span class="dim">${largeur} × ${hauteur} mm</span></div>
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
  .repere { font-size: 12pt; font-weight: 900; color: #1a1a1a; letter-spacing: -0.02em; line-height: 1; }
  .dim   { font-size: 9.5pt; font-weight: 700; color: #1a1a1a; line-height: 1.1; }
  .parent-ref { font-size: 12pt; font-weight: 900; color: #1a1a1a; line-heihgt: 1; }
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

  const comp = chassis._component;   // set when printing a composite component
  const dateStr = project.date ? new Date(project.date).toLocaleDateString('fr-FR') : '';
  const typeName = chassisLabels[chassis.type]?.[language] || chassis.type;
  const qty = chassis._totalQty || chassis.quantity || 1;
  const unitIndex = chassis._printRowIndex ?? 0;
  const unitSuffix = qty > 1 ? ` #${unitIndex + 1}` : '';

  // What to show in the preview and on the printed label
  const displayRepere = comp ? comp.repere : `${chassis.repere}${unitSuffix}`;
  const displayType = comp ? comp.roleLabel : typeName;
  const displayLargeur = comp ? comp.largeur : chassis.largeur;
  const displayHauteur = comp ? comp.hauteur : chassis.hauteur;

  const [model, setModel] = useLabelModel();

  const handlePrint = () => {
    const html = buildLabelHTML([{ ...chassis }], project, chassisLabels, language, model);
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal label-preview-modal" onClick={e => e.stopPropagation()}>
        <h2>{t('labelPreview')}</h2>
        <LabelModelSwitch value={model} onChange={setModel} />

        {model === 'big' ? (
          /* exactly what will be printed (same HTML, without the print dialog) */
          <div className="label-preview-frame label-preview-frame--big">
            <iframe className="label-big-iframe" title={t('labelPreview')}
              srcDoc={buildBigLabelHTML([{ ...chassis }], project, chassisLabels, language, { print: false })} />
          </div>
        ) : (
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
              <span className="lp-field"><span className="lp-k">{t('labelDate')}</span><span className="lp-v">{dateStr}</span></span>
            </div>
            <div className="lp-divider" />
            <div className="lp-grid">
              <div className="lp-cell">
                <span className="lp-k">{t('labelRepere')}</span>
                <span className="lp-repere">{displayRepere}</span>
                {comp && (
                  <div style={{ fontSize: '9px', color: '#888', marginTop: 4 }}>
                    {t('labelChassis')} {chassis.repere}{unitSuffix}
                  </div>
                )}
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

          </div>
        </div>
        )}

        <div className="modal-actions">
          <button onClick={onClose}>{t('close')}</button>
          <button className="primary" onClick={handlePrint}>{t('print')}</button>
        </div>
      </div>
    </div>
  );
}

export default LabelPrint;