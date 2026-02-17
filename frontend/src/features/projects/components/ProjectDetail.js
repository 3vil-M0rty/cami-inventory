import React, { useState } from 'react';
import { useProjects } from '../../../context/ProjectContext';
import { useLanguage } from '../../../context/LanguageContext';
import ChassisForm from './ChassisForm';
import UsedBarsPanel from './UsedBarsPanel';
import LabelPrint from './LabelPrint';
import { exportProjectPDF } from '../utils/pdfExport';
import './ProjectDetail.css';

const CHASSIS_LABELS = {
  fenetre_2_ouvrants:      { fr: 'Fenêtre 2 ouvrants',      it: 'Finestra 2 ante',      en: 'Window 2 sashes' },
  fenetre_1_ouvrant:       { fr: 'Fenêtre 1 ouvrant',       it: 'Finestra 1 anta',      en: 'Window 1 sash' },
  fenetre_oscillo_battant: { fr: 'Fenêtre oscillo-battant',  it: 'Finestra oscillo-battente', en: 'Tilt & turn window' },
  soufflet:                { fr: 'Soufflet',                 it: 'Soffietto',            en: 'Bellows' },
  porte_1_ouvrant:         { fr: 'Porte 1 ouvrant',         it: 'Porta 1 anta',         en: 'Door 1 leaf' },
  mur_rideau:              { fr: 'Mur rideau',               it: 'Muro cortina',         en: 'Curtain wall' },
  volet_roulant:           { fr: 'Volet roulant',            it: 'Tapparella',           en: 'Rolling shutter' },
  faux_cadre:              { fr: 'Faux cadre',               it: 'Falso telaio',         en: 'Sub-frame' },
  minimaliste_2_vantaux:   { fr: 'Minimaliste 2 vantaux',   it: 'Minimalista 2 ante',   en: 'Minimalist 2 leaves' },
  minimaliste_3_vantaux:   { fr: 'Minimaliste 3 vantaux',   it: 'Minimalista 3 ante',   en: 'Minimalist 3 leaves' },
  minimaliste_4_vantaux:   { fr: 'Minimaliste 4 vantaux',   it: 'Minimalista 4 ante',   en: 'Minimalist 4 leaves' },
  coulisse_2_vantaux:      { fr: 'Coulisse 2 vantaux',      it: 'Scorrevole 2 ante',    en: 'Sliding 2 leaves' },
  coulisse_3_vantaux:      { fr: 'Coulisse 3 vantaux',      it: 'Scorrevole 3 ante',    en: 'Sliding 3 leaves' },
  coulisse_4_vantaux:      { fr: 'Coulisse 4 vantaux',      it: 'Scorrevole 4 ante',    en: 'Sliding 4 leaves' },
};

const ETAT_COLORS = {
  non_entame: '#999',
  en_cours:   '#f59e0b',
  fabrique:   '#3b82f6',
  livre:      '#16a34a'
};

function ProjectDetail({ project, onBack }) {
  const { deleteChassis, updateChassis } = useProjects();
  const { t, currentLanguage } = useLanguage();

  const [activeTab, setActiveTab]           = useState('chassis');
  const [showChassisForm, setShowChassisForm] = useState(false);
  const [editingChassis, setEditingChassis]   = useState(null);
  // Single label print
  const [printingChassis, setPrintingChassis] = useState(null);
  // Multi-select batch print
  const [selectedIds, setSelectedIds]         = useState(new Set());
  const [batchPrinting, setBatchPrinting]     = useState(false);
  const [batchIndex, setBatchIndex]           = useState(0);

  const language = currentLanguage;
  const statusColor = { en_cours: '#f59e0b', termine: '#16a34a', livre: '#3b82f6' }[project.status] || '#999';
  const dateStr = project.date ? new Date(project.date).toLocaleDateString('fr-FR') : '';

  const handleDeleteChassis = async (chassisId) => {
    if (!window.confirm(t('deleteChassisConfirm'))) return;
    await deleteChassis(project.id, chassisId);
  };

  const handlePDF = () => {
    exportProjectPDF(project, language, CHASSIS_LABELS, t);
  };

  // ── Selection helpers ─────────────────────────────────
  const allIds = (project.chassis || []).map(ch => ch._id || ch.id);

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === allIds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
  };

  // ── Batch print: open one label at a time ─────────────
  const selectedChassisList = (project.chassis || []).filter(
    ch => selectedIds.has(ch._id || ch.id)
  );

  const startBatchPrint = () => {
    if (selectedChassisList.length === 0) return;
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

      {/* Chassis tab */}
      {activeTab === 'chassis' && (
        <div className="project-detail__panel">
          <div className="panel-toolbar">
            <button className="add-item-btn" onClick={() => setShowChassisForm(true)}>
              + {t('addChassis')}
            </button>

            {/* Selection toolbar */}
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
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(chId)}
                              onClick={e => e.stopPropagation()}
                            />
                          </td>
                          <td><strong>{ch.repere}</strong></td>
                          <td>{CHASSIS_LABELS[ch.type]?.[language] || ch.type}</td>
                          <td><strong>{ch.quantity || 1}</strong></td>
                          <td>{ch.largeur}</td>
                          <td>{ch.hauteur}</td>
                          <td>{ch.dimension || `${ch.largeur}×${ch.hauteur}`}</td>
                          <td>
                            <span className="etat-badge"
                              style={{ backgroundColor: ETAT_COLORS[ch.etat] || '#999' }}>
                              {t(`etat_${ch.etat}`) || ch.etat}
                            </span>
                          </td>
                          <td>
                            <div className="chassis-row__actions">
                              <button className="edit-btn" onClick={() => { setEditingChassis(ch); setShowChassisForm(true); }}>
                                {t('edit')}
                              </button>
                              <button className="edit-btn" title={t('printLabel')} onClick={() => setPrintingChassis(ch)}>
                                🖨
                              </button>
                              <button className="delete-btn" onClick={() => handleDeleteChassis(chId)}>
                                {t('delete')}
                              </button>
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
                              <span className="etat-badge"
                                style={{ backgroundColor: ETAT_COLORS[comp.etat] || '#999', fontSize: 11 }}>
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

      {activeTab === 'bars' && (
        <UsedBarsPanel project={project} language={language} />
      )}

      {showChassisForm && (
        <ChassisForm
          chassis={editingChassis}
          projectId={project.id}
          onClose={() => { setShowChassisForm(false); setEditingChassis(null); }}
          onSave={() => { setShowChassisForm(false); setEditingChassis(null); }}
        />
      )}

      {/* Single chassis label print */}
      {printingChassis && (
        <LabelPrint
          chassis={printingChassis}
          project={project}
          chassisLabels={CHASSIS_LABELS}
          onClose={() => setPrintingChassis(null)}
        />
      )}

      {/* Batch print — sequential labels */}
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
