import './LabelPrint.css';

/**
 * LabelPrint
 *
 * Renders a 9.5cm × 5.5cm label in a modal preview.
 * Clicking "Print" triggers window.print() which uses @media print CSS
 * to show only the label at the exact dimensions.
 */
function LabelPrint({ chassis, project, language, chassisLabels, etatLabels, onClose }) {
  const dateStr = project.date
    ? new Date(project.date).toLocaleDateString('fr-FR')
    : '';

  const typeName = chassisLabels[chassis.type]?.[language] || chassis.type;
  const etatName = etatLabels[`etat_${chassis.etat}`] || chassis.etat;

  const printLabels = {
    fr: { print: 'Imprimer', close: 'Fermer', preview: 'Aperçu étiquette', project: 'Projet', ref: 'Réf.', ral: 'RAL', repere: 'Repère', type: 'Type', dim: 'Dim.', etat: 'État' },
    it: { print: 'Stampa',   close: 'Chiudi',  preview: 'Anteprima etichetta', project: 'Progetto', ref: 'Rif.', ral: 'RAL', repere: 'Repere', type: 'Tipo', dim: 'Dim.', etat: 'Stato' },
    en: { print: 'Print',    close: 'Close',   preview: 'Label Preview', project: 'Project', ref: 'Ref.', ral: 'RAL', repere: 'ID', type: 'Type', dim: 'Dim.', etat: 'Status' }
  };
  const pt = printLabels[language];

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      {/* Modal with preview — hidden during print */}
      <div className="modal-overlay label-preview-overlay no-print" onClick={onClose}>
        <div className="modal label-preview-modal" onClick={e => e.stopPropagation()}>
          <h2>{pt.preview}</h2>

          {/* Label preview (same markup as the printable one) */}
          <div className="label-preview-frame">
            <LabelContent
              project={project}
              chassis={chassis}
              dateStr={dateStr}
              typeName={typeName}
              etatName={etatName}
              pt={pt}
            />
          </div>

          <div className="modal-actions">
            <button onClick={onClose}>{pt.close}</button>
            <button className="primary" onClick={handlePrint}>{pt.print}</button>
          </div>
        </div>
      </div>

      {/* The actual printable label — only visible during print */}
      <div className="printable-label">
        <LabelContent
          project={project}
          chassis={chassis}
          dateStr={dateStr}
          typeName={typeName}
          etatName={etatName}
          pt={pt}
        />
      </div>
    </>
  );
}

function LabelContent({ project, chassis, dateStr, typeName, etatName, pt }) {
  return (
    <div className="label">
      {/* Header row */}
      <div className="label__header">
        <span className="label__brand">CAMI ALUMINIUM</span>
        <span className="label__ral-swatch" style={{ backgroundColor: project.ralColor || '#eee' }} />
      </div>

      {/* Project info */}
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

      {/* Chassis info */}
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
          <span className="label__key">{pt.etat}</span>
          <span className="label__val label__etat">{etatName}</span>
        </div>
      </div>
    </div>
  );
}

export default LabelPrint;
