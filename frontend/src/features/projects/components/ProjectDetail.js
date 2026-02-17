import React, { useState } from 'react';
import { useProjects } from '../../../context/ProjectContext';
import ChassisForm from './ChassisForm';
import UsedBarsPanel from './UsedBarsPanel';
import LabelPrint from './LabelPrint';
import { exportProjectPDF } from '../utils/pdfExport';
import './ProjectDetail.css';

// ==================== TRANSLATIONS ====================
const translations = {
  fr: {
    backToProjects: '← Projets',
    tabChassis: 'Châssis',
    tabBars: 'Barres utilisées',
    addChassis: 'Ajouter châssis',
    exportPDF: 'Exporter PDF',
    printLabel: 'Étiquette',
    chassis: 'Châssis',
    repere: 'Repère',
    type: 'Type',
    largeur: 'Largeur',
    hauteur: 'Hauteur',
    dimension: 'Dimension',
    etat: 'État',
    actions: 'Actions',
    noChassis: 'Aucun châssis ajouté',
    edit: 'Modifier',
    delete: 'Supprimer',
    deleteChassisConfirm: 'Supprimer ce châssis ?',
    status_en_cours: 'En cours',
    status_termine: 'Terminé',
    status_livre: 'Livré',
    etat_non_entame: 'Non entamé',
    etat_en_cours: 'En cours',
    etat_fabrique: 'Fabriqué',
    etat_livre: 'Livré',
    ref: 'Réf.',
    ral: 'RAL',
    date: 'Date',
  },
  it: {
    backToProjects: '← Progetti',
    tabChassis: 'Telai',
    tabBars: 'Barre utilizzate',
    addChassis: 'Aggiungi telaio',
    exportPDF: 'Esporta PDF',
    printLabel: 'Etichetta',
    chassis: 'Telaio',
    repere: 'Repere',
    type: 'Tipo',
    largeur: 'Larghezza',
    hauteur: 'Altezza',
    dimension: 'Dimensione',
    etat: 'Stato',
    actions: 'Azioni',
    noChassis: 'Nessun telaio aggiunto',
    edit: 'Modifica',
    delete: 'Elimina',
    deleteChassisConfirm: 'Eliminare questo telaio?',
    status_en_cours: 'In corso',
    status_termine: 'Terminato',
    status_livre: 'Consegnato',
    etat_non_entame: 'Non iniziato',
    etat_en_cours: 'In corso',
    etat_fabrique: 'Fabbricato',
    etat_livre: 'Consegnato',
    ref: 'Rif.',
    ral: 'RAL',
    date: 'Data',
  },
  en: {
    backToProjects: '← Projects',
    tabChassis: 'Chassis',
    tabBars: 'Used Bars',
    addChassis: 'Add Chassis',
    exportPDF: 'Export PDF',
    printLabel: 'Label',
    chassis: 'Chassis',
    repere: 'ID',
    type: 'Type',
    largeur: 'Width',
    hauteur: 'Height',
    dimension: 'Dimension',
    etat: 'Status',
    actions: 'Actions',
    noChassis: 'No chassis added yet',
    edit: 'Edit',
    delete: 'Delete',
    deleteChassisConfirm: 'Delete this chassis?',
    status_en_cours: 'In Progress',
    status_termine: 'Completed',
    status_livre: 'Delivered',
    etat_non_entame: 'Not Started',
    etat_en_cours: 'In Progress',
    etat_fabrique: 'Fabricated',
    etat_livre: 'Delivered',
    ref: 'Ref.',
    ral: 'RAL',
    date: 'Date',
  }
};

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

// ==================== COMPONENT ====================

function ProjectDetail({ project, language, onBack }) {
  const { deleteChassis, updateChassis } = useProjects();
  const [activeTab, setActiveTab]         = useState('chassis');
  const [showChassisForm, setShowChassisForm] = useState(false);
  const [editingChassis, setEditingChassis]   = useState(null);
  const [printingChassis, setPrintingChassis] = useState(null);

  const t = translations[language];
  const statusColor = { en_cours: '#f59e0b', termine: '#16a34a', livre: '#3b82f6' }[project.status] || '#999';
  const dateStr = project.date ? new Date(project.date).toLocaleDateString('fr-FR') : '';

  const handleDeleteChassis = async (chassisId) => {
    if (!window.confirm(t.deleteChassisConfirm)) return;
    await deleteChassis(project.id, chassisId);
  };

  const handlePDF = () => {
    exportProjectPDF(project, language, CHASSIS_LABELS, translations[language]);
  };

  return (
    <div className="project-detail">

      {/* Breadcrumb */}
      <button className="project-detail__back" onClick={onBack}>{t.backToProjects}</button>

      {/* Project header */}
      <div className="project-detail__header">
        <div className="project-detail__info">
          <div className="project-detail__ral-swatch" style={{ backgroundColor: project.ralColor || '#eee' }} />
          <div>
            <h2 className="project-detail__name">{project.name}</h2>
            <div className="project-detail__meta">
              <span>{t.ref} <strong>{project.reference}</strong></span>
              <span>{t.ral} <strong>{project.ralCode}</strong></span>
              <span>{t.date}: <strong>{dateStr}</strong></span>
              <span className="project-detail__status" style={{ backgroundColor: statusColor }}>
                {t[`status_${project.status}`]}
              </span>
            </div>
          </div>
        </div>
        <div className="project-detail__header-actions">
          <button className="excel-btn" onClick={handlePDF}>{t.exportPDF}</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="project-detail__tabs">
        <button
          className={`project-detail__tab ${activeTab === 'chassis' ? 'project-detail__tab--active' : ''}`}
          onClick={() => setActiveTab('chassis')}
        >
          {t.tabChassis} <span className="tab-count">{project.chassis?.length || 0}</span>
        </button>
        <button
          className={`project-detail__tab ${activeTab === 'bars' ? 'project-detail__tab--active' : ''}`}
          onClick={() => setActiveTab('bars')}
        >
          {t.tabBars} <span className="tab-count">{project.usedBars?.length || 0}</span>
        </button>
      </div>

      {/* Chassis tab */}
      {activeTab === 'chassis' && (
        <div className="project-detail__panel">
          <div className="panel-toolbar">
            <button className="add-item-btn" onClick={() => setShowChassisForm(true)}>
              + {t.addChassis}
            </button>
          </div>

          {!project.chassis?.length ? (
            <div className="no-items">{t.noChassis}</div>
          ) : (
            <div className="chassis-table-wrapper">
              <table className="chassis-table">
                <thead>
                  <tr>
                    <th>{t.repere}</th>
                    <th>{t.type}</th>
                    <th>{t.largeur} (mm)</th>
                    <th>{t.hauteur} (mm)</th>
                    <th>{t.dimension}</th>
                    <th>{t.etat}</th>
                    <th>{t.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {project.chassis.map(ch => (
                    <React.Fragment key={ch._id || ch.id}>
                      <tr className="chassis-row">
                        <td><strong>{ch.repere}</strong></td>
                        <td>{CHASSIS_LABELS[ch.type]?.[language] || ch.type}</td>
                        <td>{ch.largeur}</td>
                        <td>{ch.hauteur}</td>
                        <td>{ch.dimension || `${ch.largeur}×${ch.hauteur}`}</td>
                        <td>
                          <span className="etat-badge"
                            style={{ backgroundColor: ETAT_COLORS[ch.etat] || '#999' }}>
                            {t[`etat_${ch.etat}`] || ch.etat}
                          </span>
                        </td>
                        <td>
                          <div className="chassis-row__actions">
                            <button className="edit-btn" onClick={() => { setEditingChassis(ch); setShowChassisForm(true); }}>
                              {t.edit}
                            </button>
                            <button className="edit-btn" onClick={() => setPrintingChassis(ch)}>
                              🖨
                            </button>
                            <button className="delete-btn" onClick={() => handleDeleteChassis(ch._id || ch.id)}>
                              {t.delete}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {/* Composite chassis — show components */}
                      {ch.components?.length > 0 && ch.components.map((comp, idx) => (
                        <tr key={idx} className="component-row">
                          <td className="component-indent">↳ {comp.repere || `${comp.role} ${idx + 1}`}</td>
                          <td className="component-role">{comp.role}</td>
                          <td>{comp.largeur}</td>
                          <td>{comp.hauteur}</td>
                          <td>—</td>
                          <td>
                            <span className="etat-badge"
                              style={{ backgroundColor: ETAT_COLORS[comp.etat] || '#999', fontSize: 11 }}>
                              {t[`etat_${comp.etat}`] || comp.etat}
                            </span>
                          </td>
                          <td></td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Used bars tab */}
      {activeTab === 'bars' && (
        <UsedBarsPanel project={project} language={language} />
      )}

      {/* Chassis form modal */}
      {showChassisForm && (
        <ChassisForm
          language={language}
          chassis={editingChassis}
          projectId={project.id}
          onClose={() => { setShowChassisForm(false); setEditingChassis(null); }}
          onSave={() => { setShowChassisForm(false); setEditingChassis(null); }}
        />
      )}

      {/* Label print */}
      {printingChassis && (
        <LabelPrint
          chassis={printingChassis}
          project={project}
          language={language}
          chassisLabels={CHASSIS_LABELS}
          etatLabels={translations[language]}
          onClose={() => setPrintingChassis(null)}
        />
      )}
    </div>
  );
}

export { CHASSIS_LABELS };
export default ProjectDetail;
