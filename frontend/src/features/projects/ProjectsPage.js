import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useProjects } from '../../context/ProjectContext';
import { useLanguage } from '../../context/LanguageContext';
import { useCompany } from '../../context/CompanyContext';
import ProjectDetail from './components/ProjectDetail';
import './ProjectsPage.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const STATUS_COLORS = {
  en_cours: '#f59e0b',
  fabrique: '#3b82f6',
  cloture:  '#16a34a'
};

function ProjectsPage() {
  const { projects, loading, addProject, updateProject, deleteProject, loadProjects } = useProjects();
  const { t, currentLanguage } = useLanguage();
  const { companies, selectedCompany } = useCompany();
  const [searchTerm, setSearchTerm]         = useState('');
  const [showForm, setShowForm]             = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [openProjectId, setOpenProjectId]   = useState(null);
  const [filterCompany, setFilterCompany]   = useState('all');

  // Sync filter with global company selector
  useEffect(() => {
    setFilterCompany(selectedCompany || 'all');
  }, [selectedCompany]);

  const filteredProjects = projects.filter(p => {
    const matchSearch = !searchTerm || (
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.reference.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.ralCode.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const matchCompany = filterCompany === 'all' ||
      p.companyId?.id === filterCompany || p.companyId?._id === filterCompany;
    return matchSearch && matchCompany;
  });

  const handleDelete = async (projectId) => {
    if (!window.confirm(t('deleteProjectConfirm'))) return;
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

  if (openProjectId) {
    const project = projects.find(p => p.id === openProjectId);
    if (project) {
      return (
        <ProjectDetail
          project={project}
          onBack={() => { setOpenProjectId(null); loadProjects(); }}
        />
      );
    }
  }

  return (
    <div className="projects-page">
      <div className="projects-page__header">
        <div className="projects-page__header-left">
          <h2 className="projects-page__title">{t('projectsTitle')}</h2>
          <span className="projects-page__count">{filteredProjects.length}</span>
        </div>
        <div className="projects-page__header-right">
          {/* Company filter tabs */}
          <div className="project-company-tabs">
            <button
              className={`proj-company-tab ${filterCompany === 'all' ? 'active' : ''}`}
              onClick={() => setFilterCompany('all')}
            >Tous</button>
            {companies.map(c => (
              <button
                key={c.id}
                className={`proj-company-tab ${filterCompany === c.id ? 'active' : ''}`}
                onClick={() => setFilterCompany(filterCompany === c.id ? 'all' : c.id)}
              >{c.name}</button>
            ))}
          </div>
          <input
            type="text"
            className="search-input"
            placeholder={t('projectSearchPlaceholder')}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          <button className="add-item-btn" onClick={() => { setEditingProject(null); setShowForm(true); }}>
            + {t('addProject')}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">{t('loading')}</div>
      ) : filteredProjects.length === 0 ? (
        <div className="no-items">{t('noProjects')}</div>
      ) : (
        <div className="projects-grid">
          {filteredProjects.map(project => (
            <ProjectCard
              key={project.id}
              project={project}
              language={currentLanguage}
              t={t}
              onOpen={() => setOpenProjectId(project.id)}
              onEdit={() => { setEditingProject(project); setShowForm(true); }}
              onDelete={() => handleDelete(project.id)}
            />
          ))}
        </div>
      )}

      {(showForm || editingProject) && (
        <ProjectFormModal
          language={currentLanguage}
          project={editingProject}
          companies={companies}
          t={t}
          onClose={() => { setShowForm(false); setEditingProject(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function ProjectCard({ project, language, t, onOpen, onEdit, onDelete }) {
  const statusColor = STATUS_COLORS[project.status] || '#999';
  const statusLabel = t(`status_${project.status}`) || project.status || '';
  const dateStr = project.date ? new Date(project.date).toLocaleDateString('fr-FR') : '';

  return (
    <div className="project-card" onClick={onOpen} style={{ borderTopColor: project.ralColor || '#ccc' }}>
      <div className="project-card__ral" style={{ backgroundColor: project.ralColor || '#eee' }} />
      <div className="project-card__body">
        <div className="project-card__top">
          <h3 className="project-card__name">{project.name}</h3>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {project.companyId && (
              <span className="project-company-tag">{project.companyId.name}</span>
            )}
            <span className="project-card__status" style={{ backgroundColor: statusColor }}>
              {statusLabel}
            </span>
          </div>
        </div>
        <div className="project-card__meta">
          <span>{t('ref')} <strong>{project.reference}</strong></span>
          <span>{t('ral')} <strong>{project.ralCode}</strong></span>
          <span>{dateStr}</span>
        </div>
        {project.clientId && (
          <div className="project-client-tag">👤 {project.clientId.name}</div>
        )}
        <div className="project-card__stats">
          <span>{project.chassis?.length || 0} {t('chassisWord')}</span>
          <span>{project.usedBars?.length || 0} {t('barsWord')}</span>
        </div>
      </div>
      <div className="project-card__actions" onClick={e => e.stopPropagation()}>
        <button className="edit-btn" onClick={onEdit}>{t('edit')}</button>
        <button className="delete-btn" onClick={onDelete}>{t('delete')}</button>
      </div>
    </div>
  );
}

function ProjectFormModal({ language, project, companies, t, onClose, onSave }) {
  const [clients, setClients] = useState([]);
  const [formData, setFormData] = useState(project ? {
    name:      project.name,
    reference: project.reference,
    ralCode:   project.ralCode,
    ralColor:  project.ralColor || '#ffffff',
    date:      project.date ? project.date.split('T')[0] : '',
    companyId: project.companyId?.id || project.companyId?._id || '',
    clientId:  project.clientId?.id  || project.clientId?._id  || '',
  } : {
    name: '', reference: '', ralCode: '', ralColor: '#ffffff',
    date: new Date().toISOString().split('T')[0],
    companyId: companies[0]?.id || '',
    clientId: ''
  });

  useEffect(() => {
    axios.get(`${API_URL}/clients`)
      .then(r => setClients(r.data))
      .catch(console.error);
  }, []);

  const set = (key, val) => setFormData(prev => ({ ...prev, [key]: val }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  // Filter clients by selected company (optional, show all if no company)
  const filteredClients = formData.companyId
    ? clients.filter(c => !c.companyId || c.companyId?.id === formData.companyId || c.companyId?._id === formData.companyId)
    : clients;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal large" onClick={e => e.stopPropagation()}>
        <h2>{project ? t('projectTitleEdit') : t('projectTitleAdd')}</h2>

        {/* Company selector — prominent at top */}
        <div className="project-form-company-selector">
          <label style={{ fontWeight: 700, marginBottom: 8, display: 'block' }}>Société *</label>
          <div className="company-choice-btns">
            {companies.map(c => (
              <button
                key={c.id}
                type="button"
                className={`company-choice-btn ${formData.companyId === c.id ? 'active' : ''}`}
                onClick={() => set('companyId', c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>{t('projectName')}</label>
              <input type="text" required value={formData.name}
                onChange={e => set('name', e.target.value)} />
            </div>
            <div className="form-group">
              <label>{t('reference')}</label>
              <input type="text" required value={formData.reference}
                onChange={e => set('reference', e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>{t('ralCode')}</label>
              <input type="text" required placeholder="RAL 9010" value={formData.ralCode}
                onChange={e => set('ralCode', e.target.value)} />
            </div>
            <div className="form-group">
              <label>{t('ralColor')}</label>
              <input type="color" value={formData.ralColor}
                onChange={e => set('ralColor', e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>{t('date')}</label>
              <input type="date" required value={formData.date}
                onChange={e => set('date', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Client (optionnel)</label>
              <select value={formData.clientId} onChange={e => set('clientId', e.target.value)}>
                <option value="">— Aucun client —</option>
                {filteredClients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.company ? ` (${c.company})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose}>{t('cancel')}</button>
            <button type="submit" className="primary">
              {project ? t('update') : t('create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ProjectsPage;
