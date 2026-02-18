import React, { useState, useEffect } from 'react';
import { useProjects } from '../../../context/ProjectContext';
import { useLanguage } from '../../../context/LanguageContext';
import ChassisForm from './ChassisForm';
import ChassisTypeManager from './ChassisTypeManager';
import UsedBarsPanel from './UsedBarsPanel';
import LabelPrint, { buildLabelHTML } from './LabelPrint';
import { exportProjectPDF, exportBarsPDF } from '../utils/pdfExport';
import { fetchChassisTypes, buildChassisLabels, CHASSIS_LABELS as STATIC_LABELS } from './ChassisTypesConfig';
import './ProjectDetail.css';

const ETAT_COLORS = {
  non_entame: '#9ca3af',
  en_cours:   '#f59e0b',
  fabrique:   '#3b82f6',
  livre:      '#16a34a'
};

/* ── Per-unit état helpers ── */
function getUnitEtat(ch, rowIndex) {
  if (ch.etatUnits && ch.etatUnits[rowIndex] !== undefined) return ch.etatUnits[rowIndex];
  return ch.etat || 'non_entame';
}
function buildEtatUnits(ch, qty) {
  const existing = ch.etatUnits || [];
  return Array.from({ length: qty }, (_, i) =>
    existing[i] !== undefined ? existing[i] : (ch.etat || 'non_entame')
  );
}

function ProjectDetail({ project, onBack }) {
  const { deleteChassis, updateChassis } = useProjects();
  const { t, currentLanguage } = useLanguage();

  const [activeTab,       setActiveTab]       = useState('chassis');
  const [showChassisForm, setShowChassisForm] = useState(false);
  const [showTypeManager, setShowTypeManager] = useState(false);
  const [editingChassis,  setEditingChassis]  = useState(null);
  const [printingChassis, setPrintingChassis] = useState(null);
  const [chassisLabels,   setChassisLabels]   = useState(STATIC_LABELS);
  const [etatOverrides,   setEtatOverrides]   = useState({});
  // selectedRowKeys = Set of "chassisId-rowIndex" — one per expanded row
  const [selectedRowKeys, setSelectedRowKeys] = useState(new Set());

  const language    = currentLanguage;
  const statusColor = { en_cours: '#f59e0b', termine: '#16a34a', livre: '#3b82f6' }[project.status] || '#9ca3af';
  const dateStr     = project.date ? new Date(project.date).toLocaleDateString('fr-FR') : '';

  useEffect(() => {
    const init = {};
    (project.chassis || []).forEach(ch => {
      const chId = ch._id || ch.id;
      const qty  = ch.quantity ?? 1;
      init[chId] = buildEtatUnits(ch, qty);
    });
    setEtatOverrides(init);
  }, [project.chassis]);

  useEffect(() => {
    fetchChassisTypes()
      .then(types => setChassisLabels(buildChassisLabels(types)))
      .catch(() => {});
  }, [showTypeManager]);

  const getRowEtat = (ch, rowIndex) => {
    const chId = ch._id || ch.id;
    return etatOverrides[chId]?.[rowIndex] ?? getUnitEtat(ch, rowIndex);
  };

  const handleEtatChange = async (ch, rowIndex, newEtat) => {
    const chId    = ch._id || ch.id;
    const qty     = ch.quantity ?? 1;
    const current = etatOverrides[chId] || buildEtatUnits(ch, qty);
    const updated = [...current];
    updated[rowIndex] = newEtat;
    setEtatOverrides(prev => ({ ...prev, [chId]: updated }));
    await updateChassis(project.id, chId, { ...ch, etat: updated[0], etatUnits: updated });
  };

  const handleDeleteRow = async (ch, rowIndex) => {
    const chId = ch._id || ch.id;
    const qty  = ch.quantity ?? 1;
    if (qty <= 1) {
      if (!window.confirm(t('deleteChassisConfirm'))) return;
      await deleteChassis(project.id, chId);
    } else {
      if (!window.confirm(`Supprimer cette unité ? (${qty - 1} restante(s))`)) return;
      const currentEtats = etatOverrides[chId] || buildEtatUnits(ch, qty);
      const newEtats     = currentEtats.filter((_, i) => i !== rowIndex);
      await updateChassis(project.id, chId, {
        ...ch, quantity: qty - 1, etat: newEtats[0] || ch.etat, etatUnits: newEtats
      });
    }
  };

  /* ── Expand chassis into individual rows ── */
  const expandedRows = (project.chassis || []).flatMap(ch => {
    const qty         = ch.quantity ?? 1;
    const chId        = ch._id || ch.id;
    const isComposite = (ch.components?.length ?? 0) > 0;
    return Array.from({ length: qty }, (_, i) => ({
      ch, chId, rowIndex: i, isFirst: i === 0, isComposite,
      rowKey: `${chId}-${i}`
    }));
  });

  /* ── Selectable keys: for composite rows, each component; for simple rows, the row itself ── */
  const allSelectableKeys = expandedRows.flatMap(({ ch, chId, rowIndex, isComposite, rowKey }) => {
    if (isComposite) {
      return (ch.components || []).map((_, idx) => `${rowKey}-comp-${idx}`);
    }
    return [rowKey];
  });

  const toggleSelectRow = (key) =>
    setSelectedRowKeys(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const toggleSelectAll = () =>
    setSelectedRowKeys(selectedRowKeys.size === allSelectableKeys.length ? new Set() : new Set(allSelectableKeys));

  /* ── Batch print ── */
  const startBatchPrint = () => {
    // For non-composite: collect rows where rowKey is selected
    // For composite: collect component rows selected
    const toPrint = [];
    expandedRows.forEach(r => {
      if (!r.isComposite && selectedRowKeys.has(r.rowKey)) {
        toPrint.push({ ...r.ch, _printRowIndex: r.rowIndex });
      } else if (r.isComposite) {
        const selectedComps = (r.ch.components || []).filter((_, idx) =>
          selectedRowKeys.has(`${r.rowKey}-comp-${idx}`)
        );
        if (selectedComps.length > 0) {
          toPrint.push({ ...r.ch, _printRowIndex: r.rowIndex, components: selectedComps });
        }
      }
    });
    if (!toPrint.length) return;
    const html = buildLabelHTML(toPrint, project, chassisLabels, language);
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  };

  return (
    <div className="project-detail">
      <button className="project-detail__back" onClick={onBack}>{t('backToProjects')}</button>

      {/* Header */}
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
          <button className="excel-btn" onClick={() => exportProjectPDF(project, language, chassisLabels, t)}>
            📄 {t('exportPDF')} — Châssis
          </button>
          <button className="excel-btn" onClick={() => exportBarsPDF(project, language, t)}>
            📄 {t('exportPDF')} — Barres
          </button>
        </div>
      </div>

      {/* Tabs */}
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

      {/* Chassis panel */}
      {activeTab === 'chassis' && (
        <div className="project-detail__panel">
          <div className="panel-toolbar">
            <button className="add-item-btn" onClick={() => { setEditingChassis(null); setShowChassisForm(true); }}>
              + {t('addChassis')}
            </button>
            <button className="ct-config-btn" onClick={() => setShowTypeManager(true)}>
              ⚙️ {t('chassisTypeConfig')}
            </button>
            {expandedRows.length > 0 && (
              <div className="selection-toolbar">
                <button className="select-btn" onClick={toggleSelectAll}>
                  {selectedRowKeys.size === allSelectableKeys.length ? t('deselectAll') : t('selectAll')}
                </button>
                {selectedRowKeys.size > 0 && (
                  <button className="print-selected-btn" onClick={startBatchPrint}>
                    🖨 {t('printSelected')} ({selectedRowKeys.size} {t('selectedCount')})
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
                    <th style={{ width: 40, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={allSelectableKeys.length > 0 && selectedRowKeys.size === allSelectableKeys.length}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th>{t('repere')}</th>
                    <th>{t('type')}</th>
                    <th>{t('largeur')} (mm)</th>
                    <th>{t('hauteur')} (mm)</th>
                    <th>{t('dimension')}</th>
                    <th>{t('etat')}</th>
                    <th>{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {expandedRows.map(({ ch, chId, rowIndex, isComposite, rowKey }) => {
                    const rowEtat    = getRowEtat(ch, rowIndex);
                    return (
                      <React.Fragment key={rowKey}>
                        <tr className={`chassis-row ${!isComposite && selectedRowKeys.has(rowKey) ? 'chassis-row--selected' : ''}`}>
                          {/* Checkbox: only for non-composite rows; composite gets checkboxes on components */}
                          <td className="chassis-row__check">
                            {!isComposite ? (
                              <input
                                type="checkbox"
                                checked={selectedRowKeys.has(rowKey)}
                                onChange={() => toggleSelectRow(rowKey)}
                                onClick={e => e.stopPropagation()}
                              />
                            ) : null}
                          </td>
                          <td>
                            <strong>{ch.repere}</strong>
                            {rowIndex > 0 && <span className="row-index-badge"> #{rowIndex + 1}</span>}
                          </td>
                          <td>{chassisLabels[ch.type]?.[language] || ch.type}</td>
                          <td>{ch.largeur}</td>
                          <td>{ch.hauteur}</td>
                          <td className="dim-cell">{ch.dimension || `${ch.largeur}×${ch.hauteur}`}</td>
                          {/* État dropdown — independent per row */}
                          <td>
                            <select
                              className="etat-select"
                              value={rowEtat}
                              onChange={e => handleEtatChange(ch, rowIndex, e.target.value)}
                              style={{ borderLeftColor: ETAT_COLORS[rowEtat] || '#9ca3af' }}
                            >
                              {['non_entame', 'en_cours', 'fabrique', 'livre'].map(opt => (
                                <option key={opt} value={opt}>{t(`etat_${opt}`)}</option>
                              ))}
                            </select>
                          </td>
                          {/* All 3 actions on every row */}
                          <td>
                            <div className="chassis-row__actions">
                              <button className="edit-btn"
                                onClick={() => {
                                  // Create a single-unit snapshot for this specific row
                                  const rowEtatVal = getRowEtat(ch, rowIndex);
                                  const singleUnit = {
                                    ...ch,
                                    quantity: 1,
                                    etat: rowEtatVal,
                                    _originalId: chId,
                                    _rowIndex: rowIndex,
                                    _totalQty: ch.quantity ?? 1,
                                  };
                                  setEditingChassis(singleUnit);
                                  setShowChassisForm(true);
                                }}>
                                ✏️ {t('edit')}
                              </button>
                              <button className="print-btn" title={t('printLabel')}
                                onClick={() => setPrintingChassis({ ...ch, _printRowIndex: rowIndex })}>
                                🖨
                              </button>
                              <button className="delete-btn" onClick={() => handleDeleteRow(ch, rowIndex)}>
                                🗑 {t('delete')}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {/* Sub-components */}
                        {isComposite && ch.components?.map((comp, idx) => {
                          const compKey = `${rowKey}-comp-${idx}`;
                          const compSelected = selectedRowKeys.has(compKey);
                          return (
                          <tr key={compKey} className={`component-row ${compSelected ? 'chassis-row--selected' : ''}`}>
                            <td className="chassis-row__check">
                              <input
                                type="checkbox"
                                checked={compSelected}
                                onChange={() => toggleSelectRow(compKey)}
                                onClick={e => e.stopPropagation()}
                              />
                            </td>
                            <td className="component-indent">↳ {comp.repere || `${comp.role} ${idx + 1}`}</td>
                            <td className="component-role">{comp.role}</td>
                            <td>{comp.largeur}</td>
                            <td>{comp.hauteur}</td>
                            <td>—</td>
                            <td>
                              <span className="etat-badge" style={{ backgroundColor: ETAT_COLORS[comp.etat] || '#9ca3af' }}>
                                {t(`etat_${comp.etat}`) || comp.etat}
                              </span>
                            </td>
                            <td></td>
                          </tr>
                          );
                        })}
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
      {showTypeManager && <ChassisTypeManager onClose={() => setShowTypeManager(false)} />}
      {printingChassis && (
        <LabelPrint
          chassis={printingChassis}
          project={project}
          chassisLabels={chassisLabels}
          onClose={() => setPrintingChassis(null)}
        />
      )}
    </div>
  );
}

export { STATIC_LABELS as CHASSIS_LABELS };
export default ProjectDetail;