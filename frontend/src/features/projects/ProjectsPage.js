import React, { useState } from 'react';
import axios from 'axios';
import { useProjects } from '../../context/ProjectContext';
import ProjectDetail from './components/ProjectDetail';
import './ProjectsPage.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

// ==================== TRANSLATIONS ====================
const translations = {
  fr: {
    title: 'Projets',
    addProject: 'Nouveau Projet',
    noProjects: 'Aucun projet trouvé',
    loading: 'Chargement...',
    searchPlaceholder: 'Rechercher un projet...',
    status_en_cours: 'En cours',
    status_termine: 'Terminé',
    status_livre: 'Livré',
    chassis: 'châssis',
    bars: 'barres',
    deleteConfirm: 'Supprimer ce projet ? Le stock des barres sera restauré.',
    // form
    titleAdd: 'Nouveau Projet',
    titleEdit: 'Modifier le Projet',
    name: 'Nom du projet',
    reference: 'Référence',
    ralCode: 'Code RAL',
    ralColor: 'Couleur RAL',
    date: 'Date',
    status: 'Statut',
    cancel: 'Annuler',
    create: 'Créer',
    update: 'Mettre à jour',
    ref: 'Réf.',
    ral: 'RAL',
  },
  it: {
    title: 'Progetti',
    addProject: 'Nuovo Progetto',
    noProjects: 'Nessun progetto trovato',
    loading: 'Caricamento...',
    searchPlaceholder: 'Cerca progetto...',
    status_en_cours: 'In corso',
    status_termine: 'Terminato',
    status_livre: 'Consegnato',
    chassis: 'telai',
    bars: 'barre',
    deleteConfirm: 'Eliminare questo progetto? Lo stock delle barre verrà ripristinato.',
    titleAdd: 'Nuovo Progetto',
    titleEdit: 'Modifica Progetto',
    name: 'Nome progetto',
    reference: 'Riferimento',
    ralCode: 'Codice RAL',
    ralColor: 'Colore RAL',
    date: 'Data',
    status: 'Stato',
    cancel: 'Annulla',
    create: 'Crea',
    update: 'Aggiorna',
    ref: 'Rif.',
    ral: 'RAL',
  },
  en: {
    title: 'Projects',
    addProject: 'New Project',
    noProjects: 'No projects found',
    loading: 'Loading...',
    searchPlaceholder: 'Search projects...',
    status_en_cours: 'In Progress',
    status_termine: 'Completed',
    status_livre: 'Delivered',
    chassis: 'chassis',
    bars: 'bars',
    deleteConfirm: 'Delete this project? Bar stock will be restored.',
    titleAdd: 'New Project',
    titleEdit: 'Edit Project',
    name: 'Project name',
    reference: 'Reference',
    ralCode: 'RAL Code',
    ralColor: 'RAL Color',
    date: 'Date',
    status: 'Status',
    cancel: 'Cancel',
    create: 'Create',
    update: 'Update',
    ref: 'Ref.',
    ral: 'RAL',
  }
};

const STATUS_COLORS = {
  en_cours: '#f59e0b',
  termine:  '#16a34a',
  livre:    '#3b82f6'
};

// ==================== PROJECTS PAGE ====================

function ProjectsPage() {
  const { projects, loading, addProject, updateProject, deleteProject, loadProjects } = useProjects();
  const [language, setLanguage]           = useState('fr');
  const [searchTerm, setSearchTerm]       = useState('');
  const [showForm, setShowForm]           = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [openProjectId, setOpenProjectId] = useState(null);

  const t = translations[language];

  const filteredProjects = projects.filter(p => {
    if (!searchTerm) return true;
    return (
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.reference.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.ralCode.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const handleDelete = async (projectId) => {
    if (!window.confirm(t.deleteConfirm)) return;
    await deleteProject(projectId);
  };

  const handleSave = async (formData) => {
    if (editingProject) {
      await updateProject(editingProject.id, formData);
    } else {
      await addProject(formData);
    }
    setShowForm(false);
    setEditingProject(null);
  };

  // Open project detail inline
  if (openProjectId) {
    const project = projects.find(p => p.id === openProjectId);
    if (project) {
      return (
        <ProjectDetail
          project={project}
          language={language}
          onBack={() => { setOpenProjectId(null); loadProjects(); }}
        />
      );
    }
  }

  return (
    <div className="projects-page">
      {/* Header bar */}
      <div className="projects-page__header">
        <div className="projects-page__header-left">
          <h2 className="projects-page__title">{t.title}</h2>
          <span className="projects-page__count">{filteredProjects.length}</span>
        </div>
        <div className="projects-page__header-right">
          <input
            type="text"
            className="search-input"
            placeholder={t.searchPlaceholder}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          <div className="language-selector">
            {['fr','it','en'].map(lang => (
              <button
                key={lang}
                className={language === lang ? 'active' : ''}
                onClick={() => setLanguage(lang)}
              >
                {lang.toUpperCase()}
              </button>
            ))}
          </div>
          <button className="add-item-btn" onClick={() => setShowForm(true)}>
            + {t.addProject}
          </button>
        </div>
      </div>

      {/* Project grid */}
      {loading ? (
        <div className="loading">{t.loading}</div>
      ) : filteredProjects.length === 0 ? (
        <div className="no-items">{t.noProjects}</div>
      ) : (
        <div className="projects-grid">
          {filteredProjects.map(project => (
            <ProjectCard
              key={project.id}
              project={project}
              language={language}
              t={t}
              onOpen={() => setOpenProjectId(project.id)}
              onEdit={() => { setEditingProject(project); setShowForm(true); }}
              onDelete={() => handleDelete(project.id)}
            />
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      {(showForm || editingProject) && (
        <ProjectFormModal
          language={language}
          project={editingProject}
          t={t}
          onClose={() => { setShowForm(false); setEditingProject(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

// ==================== PROJECT CARD ====================

function ProjectCard({ project, language, t, onOpen, onEdit, onDelete }) {
  const statusColor = STATUS_COLORS[project.status] || '#999';
  const statusLabel = t[`status_${project.status}`] || project.status;
  const dateStr = project.date ? new Date(project.date).toLocaleDateString('fr-FR') : '';

  return (
    <div className="project-card" onClick={onOpen} style={{ borderTopColor: project.ralColor || '#ccc' }}>
      <div className="project-card__ral" style={{ backgroundColor: project.ralColor || '#eee' }} />
      <div className="project-card__body">
        <div className="project-card__top">
          <h3 className="project-card__name">{project.name}</h3>
          <span className="project-card__status" style={{ backgroundColor: statusColor }}>
            {statusLabel}
          </span>
        </div>
        <div className="project-card__meta">
          <span>{t.ref} <strong>{project.reference}</strong></span>
          <span>{t.ral} <strong>{project.ralCode}</strong></span>
          <span>{dateStr}</span>
        </div>
        <div className="project-card__stats">
          <span>{project.chassis?.length || 0} {t.chassis}</span>
          <span>{project.usedBars?.length || 0} {t.bars}</span>
        </div>
      </div>
      <div className="project-card__actions" onClick={e => e.stopPropagation()}>
        <button className="edit-btn" onClick={onEdit}>{t.update ? 'Modifier' : 'Edit'}</button>
        <button className="delete-btn" onClick={onDelete}>{t.cancel ? 'Supprimer' : 'Delete'}</button>
      </div>
    </div>
  );
}

// ==================== PROJECT FORM MODAL ====================

function ProjectFormModal({ language, project, t, onClose, onSave }) {
  const [formData, setFormData] = useState(project ? {
    name:      project.name,
    reference: project.reference,
    ralCode:   project.ralCode,
    ralColor:  project.ralColor || '#ffffff',
    date:      project.date ? project.date.split('T')[0] : '',
    status:    project.status
  } : {
    name: '', reference: '', ralCode: '', ralColor: '#ffffff',
    date: new Date().toISOString().split('T')[0],
    status: 'en_cours'
  });

  const set = (key, val) => setFormData(prev => ({ ...prev, [key]: val }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  const statusOptions = [
    { value: 'en_cours', label: t.status_en_cours },
    { value: 'termine',  label: t.status_termine },
    { value: 'livre',    label: t.status_livre }
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal large" onClick={e => e.stopPropagation()}>
        <h2>{project ? t.titleEdit : t.titleAdd}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>{t.name}</label>
              <input type="text" required value={formData.name}
                onChange={e => set('name', e.target.value)} />
            </div>
            <div className="form-group">
              <label>{t.reference}</label>
              <input type="text" required value={formData.reference}
                onChange={e => set('reference', e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>{t.ralCode}</label>
              <input type="text" required placeholder="RAL 9010" value={formData.ralCode}
                onChange={e => set('ralCode', e.target.value)} />
            </div>
            <div className="form-group">
              <label>{t.ralColor}</label>
              <input type="color" value={formData.ralColor}
                onChange={e => set('ralColor', e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>{t.date}</label>
              <input type="date" required value={formData.date}
                onChange={e => set('date', e.target.value)} />
            </div>
            <div className="form-group">
              <label>{t.status}</label>
              <select value={formData.status} onChange={e => set('status', e.target.value)}>
                {statusOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose}>{t.cancel}</button>
            <button type="submit" className="primary">
              {project ? t.update : t.create}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ProjectsPage;
