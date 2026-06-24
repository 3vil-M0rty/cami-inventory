// tabs/VitrageTab.jsx
import { useState } from 'react';
import { useProjects } from '../../../context/ProjectContext';
import { useLanguage } from '../../../context/LanguageContext';
import { useCompany } from '../../../context/CompanyContext';
import { useAuth } from '../../../context/AuthContext';
import ProjectCard from '../components/ProjectCard';
import ProjectFormModal from '../components/ProjectFormModal';
import ProjectDetail from '../components/ProjectDetail';

function isTgalu(project) {
  const name = (project.clientId?.name || '').toLowerCase();
  return name.includes('infinite') || name.includes('tgalu');
}

const CAN_ADD = new Set(['Admin', 'Coordinateur-vitrage']);

export default function VitrageTab({ categoryKey, statusFilter, limit, onLoadMore }) {
  const { projects, loading, addProject, updateProject, deleteProject, loadProjects } = useProjects();
  const { t, currentLanguage } = useLanguage();
  const { companies, selectedCompany } = useCompany();
  const { user } = useAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [openProjectId, setOpenProjectId] = useState(null);

  const canAdd = CAN_ADD.has(user?.role);

  const filteredProjects = projects.filter(p => {
    const matchTab = p.tab === 'vitrage';
    const matchCompany = !selectedCompany || p.companyId?.id === selectedCompany || p.companyId?._id === selectedCompany;
    const matchCategory = categoryKey === 'tgalu' ? isTgalu(p) : !isTgalu(p);
    const matchStatus = !statusFilter || statusFilter === 'all' || p.status === statusFilter;
    const matchSearch = !searchTerm ||
      p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.reference?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.ralCode?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchTab && matchCompany && matchCategory && matchStatus && matchSearch;
  });

  const visibleProjects = filteredProjects.slice(0, limit);
  const hasMore = filteredProjects.length > limit;

  const handleDelete = async id => {
    if (!window.confirm(t('deleteProjectConfirm'))) return;
    await deleteProject(id);
  };

  const handleSave = async formData => {
    if (editingProject) await updateProject(editingProject.id, formData);
    else await addProject(formData);
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
          <h2 className="projects-page__title">Vitrage</h2>
          <span className="projects-page__count">{filteredProjects.length}</span>
        </div>
        <div className="projects-page__header-right">
          <input
            type="text"
            className="search-input"
            placeholder={t('searchPlaceholder')}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          {canAdd && (
            <button className="add-item-btn" onClick={() => { setEditingProject(null); setShowForm(true); }}>
              + {t('addProject')}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="loading">{t('loading')}</div>
      ) : filteredProjects.length === 0 ? (
        <div className="no-items">Aucun projet vitrage pour le moment</div>
      ) : (
        <>
          <div className="projects-grid">
            {visibleProjects.map(project => (
              <ProjectCard
                key={project.id}
                project={project}
                t={t}
                onOpen={() => setOpenProjectId(project.id)}
                onEdit={() => { setEditingProject(project); setShowForm(true); }}
                onDelete={() => handleDelete(project.id)}
              />
            ))}
          </div>
          {hasMore && (
            <div style={{ textAlign: 'center', padding: '24px 0', display: 'flex', justifyContent: 'center', gap: 10 }}>
              <button
                onClick={onLoadMore}
                style={{
                  padding: '10px 28px', borderRadius: 8, border: '1px solid #e5e7eb',
                  background: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', color: '#374151',
                }}
              >
                Charger plus ({filteredProjects.length - limit} restants)
              </button>
              <button
                onClick={() => onLoadMore(filteredProjects.length)}
                style={{
                  padding: '10px 28px', borderRadius: 8, border: '1px solid #e5e7eb',
                  background: '#f9fafb', fontWeight: 600, fontSize: 14, cursor: 'pointer', color: '#374151',
                }}
              >
                Charger tout ({filteredProjects.length})
              </button>
            </div>
          )}
        </>
      )}

      {showForm && (
        <ProjectFormModal
          language={currentLanguage}
          project={editingProject}
          companies={companies}
          tab="vitrage"
          t={t}
          onClose={() => { setShowForm(false); setEditingProject(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}