import { useLanguage } from '../../../context/LanguageContext';
import './LabelPrint.css';

/**
 * LabelPrint — renders a label preview modal + printable label.
 *
 * FIX: print CSS previously used `display: block !important` which broke
 * the flex/grid layout inside the label. Now uses `visibility` only and
 * keeps flex intact. The label itself is always rendered in the DOM at
 * print-time inside a fixed container.
 *
 * Supports single-chassis and batch (sequential) mode.
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

  const handlePrint = () => {
    window.print();
  };

  const pt = {
    print:    t('print'),
    close:    t('close'),
    preview:  t('labelPreview'),
    project:  t('labelProject'),
    ref:      t('labelRef'),
    ral:      t('labelRal'),
    repere:   t('labelRepere'),
    type:     t('labelType'),
    dim:      t('labelDim'),
    etat:     t('labelEtat'),
    qty:      t('labelQty'),
    next:     batchCurrent < batchTotal ? `${t('print')} & Suivant →` : `${t('print')} & Fermer`,
  };

  const labelProps = { project, chassis, dateStr, typeName, etatName, pt };

  return (
    <>
      {/* Modal — hidden at print time via .no-print */}
      <div className="modal-overlay label-preview-overlay no-print" onClick={onClose}>
        <div className="modal label-preview-modal" onClick={e => e.stopPropagation()}>
          <h2>
            {pt.preview}
            {batchMode && (
              <span className="batch-indicator"> — {batchCurrent}/{batchTotal}</span>
            )}
          </h2>

          <div className="label-preview-frame">
            <LabelContent {...labelProps} />
          </div>

          <div className="modal-actions">
            <button onClick={onClose}>{pt.close}</button>
            {batchMode ? (
              <button className="primary" onClick={() => { handlePrint(); setTimeout(onNext, 200); }}>
                {pt.next}
              </button>
            ) : (
              <button className="primary" onClick={handlePrint}>{pt.print}</button>
            )}
          </div>
        </div>
      </div>

      {/* Printable label — always in DOM, shown ONLY during @media print */}
      <div className="printable-label">
        <LabelContent {...labelProps} />
      </div>
    </>
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
