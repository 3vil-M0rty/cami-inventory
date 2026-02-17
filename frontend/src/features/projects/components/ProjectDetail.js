import React, { useState } from 'react';
import { useProjects } from '../../../context/ProjectContext';
import { useLanguage } from '../../../context/LanguageContext';
import ChassisForm from './ChassisForm';
import UsedBarsPanel from './UsedBarsPanel';
import LabelPrint from './LabelPrint';
import { exportProjectPDF } from '../utils/pdfExport';
import { CHASSIS_LABELS } from './ChassisTypesConfig';
import './ProjectDetail.css';

const ETAT_COLORS = {
  non_entame: '#9ca3af',
  en_cours:   '#f59e0b',
  fabrique:   '#3b82f6',
  livre:      '#16a34a'
};

function ProjectDetail({ project, onBack }) {
  const { deleteChassis } = useProjects();
  const { t, currentLanguage } = useLanguage();

  const [activeTab, setActiveTab]             = useState('chassis');
  const [showChassisForm, setShowChassisForm] = useState(false);
  const [editingChassis, setEditingChassis]   = useState(null);
  const [printingChassis, setPrintingChassis] = useState(null);
  const [selectedIds, setSelectedIds]         = useState(new Set());
  const [batchPrinting, setBatchPrinting]     = useState(false);
  const [batchIndex, setBatchIndex]           = useState(0);

  const language = currentLanguage;
  const statusColor = { en_cours: '#f59e0b', termine: '#16a34a', livre: '#3b82f6' }[project.status] || '#9ca3af';
  const dateStr = project.date ? new Date(project.date).toLocaleDateString('fr-FR') : '';

  const handleDeleteChassis = async (chassisId) => {
    if (!window.confirm(t('deleteChassisConfirm'))) return;
    await deleteChassis(project.id, chassisId);
  };

  const handlePDF = () => exportProjectPDF(project, language, CHASSIS_LABELS, t);

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

  const startBatchPrint = () => {
    if (!selectedChassisList.length) return;
    setBatchIndex(0);
    setBatchPrinting(true);
  };

  const handleBatchNext = () => {
    if (batchIndex + 1 < selectedChassisList.length) {
      setBatchIndex(i => i + 1);
    } else {
      setBatchPrinting(false);
      setBatchIndex(0);
    }
  };

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
          <button className="excel-btn" onClick={handlePDF}>{t('exportPDF')}</button>
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
                  {project.chassis.map(ch => {
                    const chId = ch._id || ch.id;
                    const isSelected = selectedIds.has(chId);
                    return (
                      <React.Fragment key={chId}>
                        <tr className={`chassis-row ${isSelected ? 'chassis-row--selected' : ''}`}>
                          <td>
                            <input type="checkbox" checked={isSelected}
                              onChange={() => toggleSelect(chId)}
                              onClick={e => e.stopPropagation()}
                            />
                          </td>
                          <td><strong>{ch.repere}</strong></td>
                          <td>{CHASSIS_LABELS[ch.type]?.[language] || ch.type}</td>
                          <td><strong>{ch.quantity ?? 1}</strong></td>
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
                              <button className="edit-btn" onClick={() => { setEditingChassis(ch); setShowChassisForm(true); }}>{t('edit')}</button>
                              <button className="edit-btn" title={t('printLabel')} onClick={() => setPrintingChassis(ch)}>🖨</button>
                              <button className="delete-btn" onClick={() => handleDeleteChassis(chId)}>{t('delete')}</button>
                            </div>
                          </td>
                        </tr>
                        {ch.components?.length > 0 && ch.components.map((comp, idx) => (
                          <tr key={idx} className="component-row">
                            <td></td>
                            <td className="component-indent">↳ {comp.repere || `${comp.role} ${idx + 1}`}</td>
                            <td className="component-role">{comp.role}</td>
                            <td>—</td>
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

      {printingChassis && (
        <LabelPrint chassis={printingChassis} project={project} chassisLabels={CHASSIS_LABELS} onClose={() => setPrintingChassis(null)} />
      )}

      {batchPrinting && selectedChassisList[batchIndex] && (
        <LabelPrint
          chassis={selectedChassisList[batchIndex]}
          project={project}
          chassisLabels={CHASSIS_LABELS}
          batchMode={true}
          batchCurrent={batchIndex + 1}
          batchTotal={selectedChassisList.length}
          onNext={handleBatchNext}
          onClose={() => { setBatchPrinting(false); setBatchIndex(0); }}
        />
      )}
    </div>
  );
}

export { CHASSIS_LABELS };
export default ProjectDetail;
