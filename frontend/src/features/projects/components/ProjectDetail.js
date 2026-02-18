import React, { useState, useEffect } from 'react';
import { useProjects } from '../../../context/ProjectContext';
import { useLanguage } from '../../../context/LanguageContext';
import ChassisForm from './ChassisForm';
import ChassisTypeManager from './ChassisTypeManager';
import UsedBarsPanel from './UsedBarsPanel';
import LabelPrint from './LabelPrint';
import { exportProjectPDF, exportBarsPDF } from '../utils/pdfExport';
import { fetchChassisTypes, buildChassisLabels, CHASSIS_LABELS as STATIC_LABELS } from './ChassisTypesConfig';
import './ProjectDetail.css';

const ETAT_COLORS = {
  non_entame: '#9ca3af',
  en_cours:   '#f59e0b',
  fabrique:   '#3b82f6',
  livre:      '#16a34a'
};

/**
 * Print all chassis labels in one browser window, each on its own page.
 */
function printAllLabels(chassisList, project, chassisLabels, language, t) {
  const ralHex = project.ralColor || '#cccccc';
  const dateStr = project.date ? new Date(project.date).toLocaleDateString('fr-FR') : '';

  const labelHtml = (chassis) => {
    const typeName = chassisLabels[chassis.type]?.[language] || chassis.type;
    const etatName = t(`etat_${chassis.etat}`) || chassis.etat;
    const rowNum = chassis._printRowIndex > 0 ? ` #${chassis._printRowIndex + 1}` : '';
    return `
  <div class="label">
    <div class="label__header">
      <span class="label__brand">CAMI ALUMINIUM</span>
      <span class="label__ral-swatch" style="background-color:${ralHex}"></span>
    </div>
    <div class="label__row">
      <span class="label__field"><span class="label__key">Projet</span><span class="label__val">${project.name}</span></span>
      <span class="label__field"><span class="label__key">Réf.</span><span class="label__val">${project.reference}</span></span>
    </div>
    <div class="label__row">
      <span class="label__field"><span class="label__key">RAL</span><span class="label__val">${project.ralCode}</span></span>
      <span class="label__field"><span class="label__key">Date</span><span class="label__val">${dateStr}</span></span>
    </div>
    <div class="label__divider"></div>
    <div class="label__grid">
      <div class="label__cell">
        <span class="label__key">Repère</span>
        <span class="label__repere-val">${chassis.repere}${rowNum}</span>
      </div>
      <div class="label__cell">
        <span class="label__key">Type</span>
        <span class="label__val">${typeName}</span>
      </div>
      <div class="label__cell">
        <span class="label__key">Dim.</span>
        <span class="label__val">${chassis.largeur} × ${chassis.hauteur} mm</span>
      </div>
      <div class="label__cell">
        <span class="label__key">Qté</span>
        <span class="label__val">1</span>
      </div>
      <div class="label__cell label__full">
        <span class="label__key">État</span>
        <span class="label__val">${etatName}</span>
      </div>
    </div>
  </div>`;
  };

  const allLabels = chassisList.map((ch, i) =>
    `<div class="page">${labelHtml(ch)}</div>`
  ).join('\n');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>CAMI — ${project.name} — Étiquettes</title>
  <style>
    @page { size: 9.5cm 5.5cm; margin: 0.4cm; }
    @media print {
      html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { page-break-after: always; }
      .page:last-child { page-break-after: avoid; }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background: #fff; }
    .page { width: 8.7cm; height: 4.7cm; overflow: hidden; }
    .label { width: 100%; height: 100%; padding: 3mm; display: flex; flex-direction: column; gap: 1.5mm; }
    .label__header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px solid #1a1a1a; padding-bottom: 1.5mm; margin-bottom: 1mm; }
    .label__brand { font-size: 9pt; font-weight: 900; color: #1a1a1a; letter-spacing: 0.05em; text-transform: uppercase; }
    .label__ral-swatch { width: 10mm; height: 6mm; border-radius: 2px; border: 1px solid #ccc; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .label__row { display: flex; gap: 8mm; }
    .label__field { display: flex; gap: 2px; align-items: baseline; }
    .label__key { font-size: 6pt; font-weight: 700; color: #666; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; }
    .label__val { font-size: 7pt; font-weight: 500; color: #1a1a1a; }
    .label__divider { border-top: 1px dashed #ccc; margin: 1mm 0; }
    .label__grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5mm 8mm; flex: 1; }
    .label__cell { display: flex; flex-direction: column; gap: 0.5mm; }
    .label__repere-val { font-size: 14pt; font-weight: 900; color: #1a1a1a; letter-spacing: -0.02em; line-height: 1; }
    .label__full { grid-column: 1 / -1; }
  </style>
</head>
<body>
${allLabels}
<script>
  window.onload = function() {
    document.title = '';
    window.focus();
    window.print();
    setTimeout(function() { window.close(); }, 1000);
  };
</script>
</body>
</html>`;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  }
}

function ProjectDetail({ project, onBack }) {
  const { deleteChassis } = useProjects();
  const { t, currentLanguage } = useLanguage();

  const [activeTab, setActiveTab]             = useState('chassis');
  const [showChassisForm, setShowChassisForm] = useState(false);
  const [showTypeManager, setShowTypeManager] = useState(false);
  const [editingChassis, setEditingChassis]   = useState(null);
  const [printingChassis, setPrintingChassis] = useState(null);
  const [selectedIds, setSelectedIds]         = useState(new Set());
  const [chassisLabels, setChassisLabels]     = useState(STATIC_LABELS);

  const language = currentLanguage;
  const statusColor = { en_cours: '#f59e0b', termine: '#16a34a', livre: '#3b82f6' }[project.status] || '#9ca3af';
  const dateStr = project.date ? new Date(project.date).toLocaleDateString('fr-FR') : '';

  // Load live chassis type labels
  useEffect(() => {
    fetchChassisTypes()
      .then(types => setChassisLabels(buildChassisLabels(types)))
      .catch(() => {/* keep static */});
  }, [showTypeManager]); // reload after manager closes

  const handleDeleteChassis = async (chassisId) => {
    if (!window.confirm(t('deleteChassisConfirm'))) return;
    await deleteChassis(project.id, chassisId);
  };

  const allIds = (project.chassis || []).map(ch => ch._id || ch.id);

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(selectedIds.size === allIds.length ? new Set() : new Set(allIds));
  };

  const selectedChassisList = (project.chassis || []).filter(ch => selectedIds.has(ch._id || ch.id));

  // Expand selected chassis by their quantity (each unit gets its own ticket)
  const expandedSelectedChassis = selectedChassisList.flatMap(ch => {
    const qty = ch.quantity ?? 1;
    return Array.from({ length: qty }, (_, i) => ({ ...ch, _printRowIndex: i, _printQty: 1 }));
  });

  const startBatchPrint = () => {
    if (!expandedSelectedChassis.length) return;
    // Print all selected chassis tickets in one window (each on its own page)
    printAllLabels(expandedSelectedChassis, project, chassisLabels, language, t);
  };

  /**
   * Expand chassis into display rows.
   * Both simple and composite chassis: repeat N times (qty), each row shows qty=1 and its own action buttons.
   */
  const expandedRows = (project.chassis || []).flatMap(ch => {
    const qty = ch.quantity ?? 1;
    const isComposite = ch.components?.length > 0;
    const chId = ch._id || ch.id;

    // Expand into qty rows, each showing 1 unit
    return Array.from({ length: qty }, (_, i) => ({
      ch, chId, rowIndex: i, qty: 1, showQty: 1, isFirst: i === 0,
      isComposite
    }));
  });

  return (
    <div className="project-detail">
      <button className="project-detail__back" onClick={onBack}>{t('backToProjects')}</button>

      <div className="project-detail__header">
        <div className="project-detail__info">
          <div className="project-detail__ral-swatch" style={{ backgroundColor: project.ralColor || '#eee' }} />
          <div>
            <h2 className="project-detail__name">{project.name}</h2>
            <div className="project-detail__meta">
              <span>{t('ref')} <strong>{project.reference}</strong></span>
              <span>{t('ral')} <strong>{project.ralCode}</strong></span>
              <span>{t('date')}: <strong>{dateStr}</strong></span>
              <span className="project-detail__status" style={{ backgroundColor: statusColor }}>
                {t(`status_${project.status}`)}
              </span>
            </div>
          </div>
        </div>
        <div className="project-detail__header-actions">
          <button className="excel-btn" onClick={() => exportProjectPDF(project, language, chassisLabels, t)}>{t('exportPDF')} — Châssis</button>
          <button className="excel-btn" onClick={() => exportBarsPDF(project, language, t)} style={{ marginLeft: 8 }}>{t('exportPDF')} — Barres</button>
        </div>
      </div>

      <div className="project-detail__tabs">
        <button
          className={`project-detail__tab ${activeTab === 'chassis' ? 'project-detail__tab--active' : ''}`}
          onClick={() => setActiveTab('chassis')}
        >
          {t('tabChassis')} <span className="tab-count">{project.chassis?.length || 0}</span>
        </button>
        <button
          className={`project-detail__tab ${activeTab === 'bars' ? 'project-detail__tab--active' : ''}`}
          onClick={() => setActiveTab('bars')}
        >
          {t('tabBars')} <span className="tab-count">{project.usedBars?.length || 0}</span>
        </button>
      </div>

      {activeTab === 'chassis' && (
        <div className="project-detail__panel">
          <div className="panel-toolbar">
            <button className="add-item-btn" onClick={() => { setEditingChassis(null); setShowChassisForm(true); }}>
              + {t('addChassis')}
            </button>
            <button className="ct-config-btn" title="Gérer les types de chassis" onClick={() => setShowTypeManager(true)}>
              ⚙️ Types de chassis
            </button>
            {(project.chassis?.length || 0) > 0 && (
              <div className="selection-toolbar">
                <button className="select-btn" onClick={toggleSelectAll}>
                  {selectedIds.size === allIds.length ? t('deselectAll') : t('selectAll')}
                </button>
                {selectedIds.size > 0 && (
                  <button className="print-selected-btn" onClick={startBatchPrint}>
                    🖨 {t('printSelected')} ({selectedIds.size} {t('selectedCount')})
                  </button>
                )}
              </div>
            )}
          </div>

          {!project.chassis?.length ? (
            <div className="no-items">{t('noChassis')}</div>
          ) : (
            <div className="chassis-table-wrapper">
              <table className="chassis-table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}></th>
                    <th>{t('repere')}</th>
                    <th>{t('type')}</th>
                    <th>{t('quantityChassis')}</th>
                    <th>{t('largeur')} (mm)</th>
                    <th>{t('hauteur')} (mm)</th>
                    <th>{t('dimension')}</th>
                    <th>{t('etat')}</th>
                    <th>{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {expandedRows.map(({ ch, chId, rowIndex, showQty, isFirst, isComposite }) => {
                    const isSelected = selectedIds.has(chId);
                    const rowKey = `${chId}-${rowIndex}`;
                    return (
                      <React.Fragment key={rowKey}>
                        <tr className={`chassis-row ${isSelected ? 'chassis-row--selected' : ''}`}>
                          <td>
                            {isFirst && (
                              <input type="checkbox" checked={isSelected}
                                onChange={() => toggleSelect(chId)}
                                onClick={e => e.stopPropagation()}
                              />
                            )}
                          </td>
                          <td>
                            <strong>{ch.repere}</strong>
                            {rowIndex > 0 && <span className="row-index-badge"> #{rowIndex + 1}</span>}
                          </td>
                          <td>{chassisLabels[ch.type]?.[language] || ch.type}</td>
                          <td><strong>{showQty}</strong></td>
                          <td>{ch.largeur}</td>
                          <td>{ch.hauteur}</td>
                          <td>{ch.dimension || `${ch.largeur}×${ch.hauteur}`}</td>
                          <td>
                            <span className="etat-badge" style={{ backgroundColor: ETAT_COLORS[ch.etat] || '#9ca3af' }}>
                              {t(`etat_${ch.etat}`) || ch.etat}
                            </span>
                          </td>
                          <td>
                            <div className="chassis-row__actions">
                              {isFirst && (
                                <button className="edit-btn" onClick={() => { setEditingChassis(ch); setShowChassisForm(true); }}>{t('edit')}</button>
                              )}
                              <button className="edit-btn" title={t('printLabel')} onClick={() => setPrintingChassis({ ...ch, _printRowIndex: rowIndex })}>🖨</button>
                              {isFirst && (
                                <button className="delete-btn" onClick={() => handleDeleteChassis(chId)}>{t('delete')}</button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {/* Show sub-components for composite expanded rows */}
                        {isComposite && ch.components?.map((comp, idx) => (
                          <tr key={`${rowKey}-comp-${idx}`} className="component-row">
                            <td></td>
                            <td className="component-indent">↳ {comp.repere || `${comp.role} ${idx + 1}`}</td>
                            <td className="component-role">{comp.role}</td>
                            <td>1</td>
                            <td>{comp.largeur}</td>
                            <td>{comp.hauteur}</td>
                            <td>—</td>
                            <td>
                              <span className="etat-badge" style={{ backgroundColor: ETAT_COLORS[comp.etat] || '#9ca3af', fontSize: 11 }}>
                                {t(`etat_${comp.etat}`) || comp.etat}
                              </span>
                            </td>
                            <td></td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'bars' && <UsedBarsPanel project={project} language={language} />}

      {showChassisForm && (
        <ChassisForm
          chassis={editingChassis}
          projectId={project.id}
          onClose={() => { setShowChassisForm(false); setEditingChassis(null); }}
          onSave={() => { setShowChassisForm(false); setEditingChassis(null); }}
        />
      )}

      {showTypeManager && (
        <ChassisTypeManager onClose={() => setShowTypeManager(false)} />
      )}

      {printingChassis && (
        <LabelPrint chassis={printingChassis} project={project} chassisLabels={chassisLabels} onClose={() => setPrintingChassis(null)} />
      )}
    </div>
  );
}

export { STATIC_LABELS as CHASSIS_LABELS };
export default ProjectDetail;
