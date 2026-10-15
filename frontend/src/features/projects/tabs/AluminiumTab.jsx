// tabs/AluminiumTab.jsx
import { useState, useEffect, useCallback } from 'react';
import projectService from '../../../services/projectService';
import { useProjects } from '../../../context/ProjectContext';
import { useLanguage } from '../../../context/LanguageContext';
import { dialog, errorMessage } from '../../../components/common/dialog';
import { useCompany } from '../../../context/CompanyContext';
import { useAuth } from '../../../context/AuthContext';
import ProjectCard from '../components/ProjectCard';
import ProjectFormModal from '../components/ProjectFormModal';
import ProjectDetail from '../components/ProjectDetail';
import { useProjectUrl, setProjectUrl } from '../useProjectUrl';

const PAGE_SIZE = 12;

export default function AluminiumTab({ categoryKey, statusFilter }) {
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
  const [openProject, setOpenProject] = useState(null);   // full detail doc, fetched on demand
  const [openLoading, setOpenLoading] = useState(false);

  const isAdmin = user?.role === 'Admin';

  // debounce search input
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchTerm), 350);
    return () => clearTimeout(id);
  }, [searchTerm]);

  const fetchPage = useCallback(async (targetPage, append) => {
    append ? setLoadingMore(true) : setLoading(true);
    setError(null);
    try {
      const data = await projectService.getProjectsList({
        tab: 'aluminium',
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

  // reset + reload whenever filters change
  useEffect(() => { fetchPage(1, false); }, [fetchPage]);

  // fromUrl: opened from the address (/projets/<id>, refresh, back button) → the URL is already right
  const handleOpen = async (projectId, { fromUrl = false } = {}) => {
    setOpenLoading(true);
    try {
      const full = await projectService.getProjectById(projectId);
      setOpenProject(full);
      if (!fromUrl) setProjectUrl(projectId);
    } catch (err) {
      if (fromUrl) setProjectUrl(null, { replace: true }); // unknown / deleted project → back to the list
      else dialog.alert(errorMessage(err, t('errLoad')));
    } finally {
      setOpenLoading(false);
    }
  };
  useProjectUrl({
    openId: openProject?.id,
    open: handleOpen,
    close: () => { setOpenProject(null); fetchPage(1, false); },
  });

  const handleDelete = async id => {
    if (!(await dialog.confirm({ title: t('deleteTitle'), message: t('deleteProjectConfirm'), danger: true, confirmLabel: t('deleteAction') }))) return;
    try {
      await deleteProject(id);
    } catch (err) { dialog.alert(errorMessage(err, t('errDelete'))); return; }
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
          setProjectUrl(null);
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
          <h2 className="projects-page__title">{t('projectsTitle')}</h2>
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
          {isAdmin && (
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
          {t('pjLoadError', { msg: error })}
          <div style={{ marginTop: 12 }}>
            <button onClick={() => fetchPage(1, false)}>{t('retry')}</button>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="no-items">{t('noProjects')}</div>
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
            <div className="projects-load-more">
              <button
                className="projects-load-more__btn"
                disabled={loadingMore}
                onClick={() => fetchPage(page + 1, true)}
              >
                {loadingMore ? t('loading') : t('pjLoadMore', { n: total - items.length })}
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
          tab="aluminium"
          t={t}
          onClose={() => { setShowForm(false); setEditingProject(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}