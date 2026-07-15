import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import projectService from '../services/projectService';

const ProjectContext = createContext(null);

export const ProjectProvider = ({ children }) => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false); // was true — nothing auto-fetches now
  const [error, setError] = useState(null);

  const [projectList, setProjectList] = useState(null);
  const [listParams, setListParams] = useState(null);
  const [listLoading, setListLoading] = useState(false);

  // REMOVED: useEffect(() => { loadProjects(); }, []);
  // Any page that truly needs the full `projects` array should call
  // loadProjects() itself in its own useEffect.

  const loadProjects = async () => {
    try {
      setLoading(true); setError(null);
      setProjects(await projectService.getAllProjects());
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };
  // ── NEW: cached, paginated loader — used by ProjectsPage/CategoryPage ──
  const loadProjectList = useCallback(async (params, { force = false } = {}) => {
    const sameParams = projectList && listParams && JSON.stringify(params) === JSON.stringify(listParams);
    if (sameParams && !force) return projectList; // reuse cache, no network call
    setListLoading(true);
    try {
      const data = await projectService.getProjectsList(params); // GET /projects/list
      setProjectList(data);
      setListParams(params);
      return data;
    } finally {
      setListLoading(false);
    }
  }, [projectList, listParams]);

  // ── NEW: patch one card in the cached list without refetching ──
  const patchProjectInList = useCallback((id, patch) => {
    setProjectList(prev => prev && {
      ...prev,
      projects: prev.projects.map(p => p.id === id ? { ...p, ...patch } : p),
    });
  }, []);

  // Refresh a single project in state from server
  // Refresh a single project in state from server (UPSERT)
  const refreshProject = async (id) => {
    const updated = await projectService.getProjectById(id);

    setProjects(prev => {
      const index = prev.findIndex(p => p.id === id);

      // Project already exists → replace it
      if (index !== -1) {
        const next = [...prev];
        next[index] = updated;
        return next;
      }

      // Project wasn't loaded yet → insert it
      return [...prev, updated];
    });

    // Keep project cards in sync
    patchProjectInList(id, {
      status: updated.status,
      cachedTotalPieces: updated.cachedTotalPieces,
      name: updated.name,
      reference: updated.reference,
      ralCode: updated.ralCode,
      ralColor: updated.ralColor,
    });

    return updated;
  };
  // ---- Projects ----
  const addProject = async (data) => {
    try {
      const p = await projectService.createProject(data);
      setProjects(prev => [p, ...prev]);
      setProjectList(null); // list is now stale — force a refetch next time it's viewed
      return { success: true, project: p };
    } catch (err) { return { success: false, error: err.message }; }
  };

  const updateProject = async (id, data) => {
    try {
      const updated = await projectService.updateProject(id, data);
      setProjects(prev => prev.map(p => p.id === id ? updated : p));
      patchProjectInList(id, { name: updated.name, reference: updated.reference, ralCode: updated.ralCode, ralColor: updated.ralColor });
      return { success: true, project: updated };
    } catch (err) { return { success: false, error: err.message }; }
  };

  const deleteProject = async (id) => {
    try {
      await projectService.deleteProject(id);
      setProjects(prev => prev.filter(p => p.id !== id));
      setProjectList(prev => prev && { ...prev, projects: prev.projects.filter(p => p.id !== id) });
      return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
  };

  // ---- Chassis ---- (unchanged, but each success now also patches the list's status/count)
  const addChassis = async (projectId, data) => {
    try {
      const updated = await projectService.addChassis(projectId, data);
      setProjects(prev => prev.map(p => p.id === projectId ? updated : p));
      patchProjectInList(projectId, { status: updated.status });
      return { success: true, project: updated };
    } catch (err) { return { success: false, error: err.message }; }
  };

  const updateChassis = async (projectId, chassisId, data) => {
    try {
      const updated = await projectService.updateChassis(projectId, chassisId, data);
      setProjects(prev => prev.map(p => p.id === projectId ? updated : p));
      patchProjectInList(projectId, { status: updated.status });
      return { success: true, project: updated };
    } catch (err) { return { success: false, error: err.message }; }
  };

  const deleteChassis = async (projectId, chassisId) => {
    try {
      const updated = await projectService.deleteChassis(projectId, chassisId);
      setProjects(prev => prev.map(p => p.id === projectId ? updated : p));
      patchProjectInList(projectId, { status: updated.status });
      return { success: true, project: updated };
    } catch (err) { return { success: false, error: err.message }; }
  };

  const updateUnit = async (projectId, chassisId, unitIndex, data) => {
    try {
      const updated = await projectService.updateUnit(projectId, chassisId, unitIndex, data);
      setProjects(prev => prev.map(p => p.id === projectId ? updated : p));
      patchProjectInList(projectId, { status: updated.status });
      return { success: true, project: updated };
    } catch (err) { return { success: false, error: err.message }; }
  };

  const updateComponent = async (projectId, chassisId, unitIndex, compIndex, data) => {
    try {
      const updated = await projectService.updateComponent(projectId, chassisId, unitIndex, compIndex, data);
      setProjects(prev => prev.map(p => p.id === projectId ? updated : p));
      patchProjectInList(projectId, { status: updated.status });
      return { success: true, project: updated };
    } catch (err) { return { success: false, error: err.message }; }
  };

  // ---- BL, Used Bars ---- (unchanged)
  const getBonsLivraison = (projectId) => projectService.getBonsLivraison(projectId);
  const getBonLivraison = (projectId, dateKey) => projectService.getBonLivraison(projectId, dateKey);

  const addUsedBar = async (projectId, itemId, quantity) => {
    try {
      const updated = await projectService.addUsedBar(projectId, itemId, quantity);
      setProjects(prev => prev.map(p => p.id === projectId ? updated : p));
      return { success: true, project: updated };
    } catch (err) { return { success: false, error: err.message }; }
  };

  const removeUsedBar = async (projectId, itemId) => {
    try {
      const updated = await projectService.removeUsedBar(projectId, itemId);
      setProjects(prev => prev.map(p => p.id === projectId ? updated : p));
      return { success: true, project: updated };
    } catch (err) { return { success: false, error: err.message }; }
  };

  const getProjectById = useCallback((id) => projects.find(p => p.id === id) || null, [projects]);

  return (
    <ProjectContext.Provider value={{
      projects, loading, error, loadProjects, refreshProject,
      // NEW exports:
      projectList, listLoading, loadProjectList, patchProjectInList,
      addProject, updateProject, deleteProject,
      addChassis, updateChassis, deleteChassis,
      updateUnit, updateComponent,
      getBonsLivraison, getBonLivraison,
      addUsedBar, removeUsedBar,
      getProjectById
    }}>
      {children}
    </ProjectContext.Provider>
  );
};

export const useProjects = () => {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProjects must be used within ProjectProvider');
  return ctx;
};

export default ProjectContext;