import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useProjects } from '../../context/ProjectContext';
import { useLanguage } from '../../context/LanguageContext';
import { useCompany } from '../../context/CompanyContext';
import ProjectDetail from './components/ProjectDetail';
import { useAuth } from '../../context/AuthContext';
import './RalPicker.css';
import './ProjectsPage.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const STATUS_COLORS = {
  en_cours: '#f59e0b',
  fabrique: '#3b82f6',
  cloture: '#16a34a'
};



function ProjectsPage() {
  const { projects, loading, addProject, updateProject, deleteProject, loadProjects } = useProjects();
  const { t, currentLanguage } = useLanguage();
  const { companies, selectedCompany } = useCompany();
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [openProjectId, setOpenProjectId] = useState(null);
  const [filterCompany, setFilterCompany] = useState('all');

  

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
          <div className="project-company-tabs">
            <button
              className={`proj-company-tab ${filterCompany === 'all' ? 'active' : ''}`}
              onClick={() => setFilterCompany('all')}
            >{t('allCompanies')}</button>
            {companies.map(c => (
              <button key={c.id}
                className={`proj-company-tab ${filterCompany === c.id ? 'active' : ''}`}
                onClick={() => setFilterCompany(filterCompany === c.id ? 'all' : c.id)}
              >{c.name}</button>
            ))}
          </div>
          <input type="text" className="search-input"
            placeholder={t('projectSearchPlaceholder')}
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
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

/* ── Project Card ─────────────────────────────────────────────────── */
function ProjectCard({ project, language, t, onOpen, onEdit, onDelete }) {
  const statusColor = STATUS_COLORS[project.status] || '#999';
  const statusLabel = t(`status_${project.status}`) || project.status || '';
  const dateStr = project.date ? new Date(project.date).toLocaleDateString('fr-FR') : '';
  const { user } = useAuth();
  const userRole = user?.role;

  const adminThing = userRole === 'Admin';

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
        {adminThing && (
          <button className="edit-btn"   onClick={onEdit}>{t('edit')}</button>
        )}
        {adminThing && (
          <button className="delete-btn" onClick={onDelete}>{t('delete')}</button>
        )}
        

      </div>
    </div>
  );
}

/* ── RAL Picker ─────────────────────────────────────────────────────
   Loads items from superCategory=poudres and lets user pick one.
   Falls back to a free-text input if no poudres exist yet.
─────────────────────────────────────────────────────────────────── */
function RalPicker({ language, value, colorValue, onChange, t }) {
  const [poudres, setPoudres] = useState([]);
  const [loading, setLoading] = useState(true);
  const [manualMode, setManualMode] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    axios.get(`${API_URL}/inventory/poudres`)
      .then(r => {
        setPoudres(r.data);
        // If currently saved value matches a poudre, stay in picker mode
        // If no poudres at all, auto-switch to manual
        if (r.data.length === 0) setManualMode(true);
      })
      .catch(() => setManualMode(true))
      .finally(() => setLoading(false));
  }, []);

  const filtered = poudres.filter(p => {
    const name = p.designation[language] || p.designation.fr || '';
    return !search || name.toLowerCase().includes(search.toLowerCase());
  });

  const selectedPoudre = poudres.find(p => {
    const name = p.designation[language] || p.designation.fr || '';
    return name === value;
  });

  if (loading) return <div className="ral-picker__loading">Chargement des poudres...</div>;

  if (manualMode || poudres.length === 0) {
    return (
      <div className="ral-picker ral-picker--manual">
        <div className="form-row" style={{ gap: 8 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <input
              type="text"
              required
              placeholder="RAL 9010"
              value={value}
              onChange={e => onChange({ ralCode: e.target.value, ralColor: colorValue })}
            />
          </div>
          <div className="form-group" style={{ flex: 'none' }}>
            <input
              type="color"
              value={colorValue}
              onChange={e => onChange({ ralCode: value, ralColor: e.target.value })}
              style={{ width: 48, height: 38, padding: 2 }}
            />
          </div>
        </div>
        {poudres.length > 0 && (
          <button type="button" className="ral-picker__switch-btn" onClick={() => setManualMode(false)}>
            ← {t('ralPickerSwitch') || 'Choisir depuis les poudres'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="ral-picker">
      {/* Selected display */}
      {selectedPoudre ? (
        <div className="ral-picker__selected">
          <span
            className="ral-picker__swatch"
            style={{ background: selectedPoudre.designation[language] ? colorValue : colorValue }}
          />
          <span className="ral-picker__selected-name">
            {selectedPoudre.designation[language] || selectedPoudre.designation.fr}
          </span>
          <button type="button" className="ral-picker__clear-btn" onClick={() => onChange({ ralCode: '', ralColor: '#ffffff' })}>✕</button>
        </div>
      ) : (
        <div className="ral-picker__placeholder">
          <span style={{ color: '#9ca3af', fontSize: 13 }}>
            {t('ralPickerPlaceholder') || '— Sélectionner une poudre —'}
          </span>
        </div>
      )}

      {/* Search */}
      <div className="ral-picker__search-wrap">
        <input
          type="text"
          className="ral-picker__search"
          placeholder={t('searchPlaceholder') || 'Rechercher...'}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* List */}
      <div className="ral-picker__list">
        {filtered.length === 0 ? (
          <div className="ral-picker__empty">{t('noItems') || 'Aucun résultat'}</div>
        ) : (
          filtered.map(p => {
            const name = p.designation[language] || p.designation.fr;
            const isActive = value === name;
            // Extract color from the item's ralColor field or use a swatch color
            // Items in poudres should have image or designation referencing the color
            // We'll use the category color as a fallback swatch
            const swatchColor = p.categoryId?.color || '#e5e7eb';
            return (
              <button
                key={p.id}
                type="button"
                className={`ral-picker__option ${isActive ? 'active' : ''}`}
                onClick={() => {
                  onChange({ ralCode: name, ralColor: swatchColor });
                  setSearch('');
                }}
              >
                {p.image
                  ? <img src={p.image} alt="" className="ral-picker__option-img" />
                  : <span className="ral-picker__option-swatch" style={{ background: swatchColor }} />
                }
                <span className="ral-picker__option-name">{name}</span>
                <span className="ral-picker__option-stock">
                  {t('inStock') || 'En stock'}: {p.quantity}
                </span>
                {isActive && <span className="ral-picker__checkmark">✓</span>}
              </button>
            );
          })
        )}
      </div>

      {/* Manual fallback */}
      <button type="button" className="ral-picker__switch-btn" onClick={() => setManualMode(true)}>
        {t('ralPickerManual') || 'Saisir manuellement'}
      </button>
    </div>
  );
}

/* ── Project Form Modal ───────────────────────────────────────────── */
function ProjectFormModal({ language, project, companies, t, onClose, onSave }) {
  const [clients, setClients] = useState([]);
  const [formData, setFormData] = useState(project ? {
    name: project.name,
    reference: project.reference,
    ralCode: project.ralCode,
    ralColor: project.ralColor || '#ffffff',
    date: project.date ? project.date.split('T')[0] : '',
    companyId: project.companyId?.id || project.companyId?._id || '',
    clientId: project.clientId?.id || project.clientId?._id || '',
  } : {
    name: '', reference: '', ralCode: '', ralColor: '#ffffff',
    date: new Date().toISOString().split('T')[0],
    companyId: companies[0]?.id || '',
    clientId: ''
  });

  useEffect(() => {
    axios.get(`${API_URL}/clients`).then(r => setClients(r.data)).catch(console.error);
  }, []);

  const set = (key, val) => setFormData(prev => ({ ...prev, [key]: val }));

  const filteredClients = formData.companyId
    ? clients.filter(c => !c.companyId || c.companyId?.id === formData.companyId || c.companyId?._id === formData.companyId)
    : clients;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal large" onClick={e => e.stopPropagation()}>
        <h2>{project ? t('projectTitleEdit') : t('projectTitleAdd')}</h2>

        {/* Company selector */}
        <div className="project-form-company-selector">
          <label style={{ fontWeight: 700, marginBottom: 8, display: 'block' }}>{t('society')} *</label>
          <div className="company-choice-btns">
            {companies.map(c => (
              <button key={c.id} type="button"
                className={`company-choice-btn ${formData.companyId === c.id ? 'active' : ''}`}
                onClick={() => set('companyId', c.id)}>
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

          {/* RAL — poudres picker */}
          <div className="form-group">
            <label>{t('ralCode')} / {t('poudre') || 'Poudre'}</label>
            <RalPicker
              language={language}
              value={formData.ralCode}
              colorValue={formData.ralColor}
              t={t}
              onChange={({ ralCode, ralColor }) => setFormData(prev => ({ ...prev, ralCode, ralColor }))}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>{t('date')}</label>
              <input type="date" required value={formData.date}
                onChange={e => set('date', e.target.value)} />
            </div>
            <div className="form-group">
              <label>{t('navClients')} ({t('cancel') === 'Annuler' ? 'optionnel' : 'optional'})</label>
              <select value={formData.clientId} onChange={e => set('clientId', e.target.value)}>
                <option value="">—</option>
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