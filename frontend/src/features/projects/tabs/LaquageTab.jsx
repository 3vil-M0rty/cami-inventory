// tabs/LaquageTab.jsx
import { useState, useEffect, useCallback } from 'react';
import projectService from '../../../services/projectService';
import { useProjects } from '../../../context/ProjectContext';
import { useLanguage } from '../../../context/LanguageContext';
import { useCompany } from '../../../context/CompanyContext';
import { useAuth } from '../../../context/AuthContext';
import ProjectCard from '../components/ProjectCard';
import ProjectFormModal from '../components/ProjectFormModal';
import ProjectDetail from '../components/ProjectDetail';

const PAGE_SIZE = 12;
const CAN_ADD = new Set(['Admin', 'Laquage']);

export default function LaquageTab({ categoryKey, statusFilter }) {
  const { addProject, updateProject, deleteProject } = useProjects();
  const { t, currentLanguage } = useLanguage();
  const { companies, selectedCompany } = useCompany();
  const { user } = useAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [openProject, setOpenProject] = useState(null);
  const [openLoading, setOpenLoading] = useState(false);

  const canAdd = CAN_ADD.has(user?.role);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchTerm), 350);
    return () => clearTimeout(id);
  }, [searchTerm]);

  const fetchPage = useCallback(async (targetPage, append) => {
    append ? setLoadingMore(true) : setLoading(true);
    setError(null);
    try {
      const data = await projectService.getProjectsList({
        tab: 'laquage',
        category: categoryKey,
        status: statusFilter,
        companyId: selectedCompany || undefined,
        search: debouncedSearch || undefined,
        page: targetPage,
        limit: PAGE_SIZE,
      });
      setItems(prev => (append ? [...prev, ...data.projects] : data.projects));
      setTotal(data.total);
      setPage(targetPage);
    } catch (err) {
      setError(err.message);
    } finally {
      append ? setLoadingMore(false) : setLoading(false);
    }
  }, [categoryKey, statusFilter, selectedCompany, debouncedSearch]);

  useEffect(() => { fetchPage(1, false); }, [fetchPage]);

  const handleOpen = async (projectId) => {
    setOpenLoading(true);
    try {
      const full = await projectService.getProjectById(projectId);
      setOpenProject(full);
    } catch (err) {
      alert(err.message);
    } finally {
      setOpenLoading(false);
    }
  };

  const handleDelete = async id => {
    if (!window.confirm(t('deleteProjectConfirm'))) return;
    await deleteProject(id);
    fetchPage(1, false);
  };

  const handleSave = async formData => {
    if (editingProject) await updateProject(editingProject.id, formData);
    else await addProject(formData);
    setShowForm(false);
    setEditingProject(null);
    fetchPage(1, false);
  };

  if (openProject) {
    return (
      <ProjectDetail
        projectId={openProject.id}
        onBack={() => {
          setOpenProject(null);
          fetchPage(1, false);
        }}
      />
    );
  }
  if (openLoading) {
    return <div className="loading">{t('loading')}</div>;
  }

  const hasMore = items.length < total;

  return (
    <div className="projects-page">
      <div className="projects-page__header">
        <div className="projects-page__header-left">
          <h2 className="projects-page__title">Laquage</h2>
          <span className="projects-page__count">{total}</span>
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
      ) : error ? (
        <div className="no-items">
          Erreur de chargement: {error}
          <div style={{ marginTop: 10 }}>
            <button onClick={() => fetchPage(1, false)}>Réessayer</button>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="no-items">Aucun projet laquage pour le moment</div>
      ) : (
        <>
          <div className="projects-grid">
            {items.map(project => (
              <ProjectCard
                key={project.id}
                project={project}
                t={t}
                onOpen={() => handleOpen(project.id)}
                onEdit={() => { setEditingProject(project); setShowForm(true); }}
                onDelete={() => handleDelete(project.id)}
              />
            ))}
          </div>
          {hasMore && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <button
                disabled={loadingMore}
                onClick={() => fetchPage(page + 1, true)}
                style={{
                  padding: '10px 28px', borderRadius: 8, border: '1px solid #e5e7eb',
                  background: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', color: '#374151',
                }}
              >
                {loadingMore ? t('loading') : `Charger plus (${total - items.length} restants)`}
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
          tab="laquage"
          t={t}
          onClose={() => { setShowForm(false); setEditingProject(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}