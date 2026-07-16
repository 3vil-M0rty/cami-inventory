import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import projectService from '../services/projectService';
import { computeEtatCounts } from '../features/projects/components/ProjectCard';

const ProjectContext = createContext(null);

export const ProjectProvider = ({ children }) => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [projectList, setProjectList] = useState(null);
  const [listParams, setListParams] = useState(null);
  const [listLoading, setListLoading] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      setProjects(await projectService.getAllProjects());
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  const loadProjectList = useCallback(async (params, { force = false } = {}) => {
    setListLoading(true);
    try {
      const data = await projectService.getProjectsList(params);
      setProjectList(data);
      setListParams(params);
      return data;
    } finally {
      setListLoading(false);
    }
  }, []);

  const patchProjectInList = useCallback((id, patch) => {
    setProjectList(prev => prev && {
      ...prev,
      projects: prev.projects.map(p => p.id === id ? { ...p, ...patch } : p),
    });
  }, []);

  const refreshProject = useCallback(async (id) => {
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
      etatCounts: computeEtatCounts(updated.chassis || []),
      name: updated.name,
      reference: updated.reference,
      ralCode: updated.ralCode,
      ralColor: updated.ralColor,
    });

    return updated;
  }, [patchProjectInList]);

  const addProject = useCallback(async (data) => {
    try {
      const p = await projectService.createProject(data);
      setProjects(prev => [p, ...prev]);
      setProjectList(null);
      return { success: true, project: p };
    } catch (err) { return { success: false, error: err.message }; }
  }, []);

  const updateProject = useCallback(async (id, data) => {
    try {
      const updated = await projectService.updateProject(id, data);
      setProjects(prev => prev.map(p => p.id === id ? updated : p));
      patchProjectInList(id, { name: updated.name, reference: updated.reference, ralCode: updated.ralCode, ralColor: updated.ralColor });
      return { success: true, project: updated };
    } catch (err) { return { success: false, error: err.message }; }
  }, [patchProjectInList]);

  const deleteProject = useCallback(async (id) => {
    try {
      await projectService.deleteProject(id);
      setProjects(prev => prev.filter(p => p.id !== id));
      setProjectList(prev => prev && { ...prev, projects: prev.projects.filter(p => p.id !== id) });
      return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
  }, []);

  const addChassis = useCallback(async (projectId, data) => {
    try {
      const updated = await projectService.addChassis(projectId, data);
      setProjects(prev => prev.map(p => p.id === projectId ? updated : p));
      patchProjectInList(projectId, { status: updated.status, etatCounts: computeEtatCounts(updated.chassis || []) });
      return { success: true, project: updated };
    } catch (err) { return { success: false, error: err.message }; }
  }, [patchProjectInList]);

  const updateChassis = useCallback(async (projectId, chassisId, data) => {
    try {
      const updated = await projectService.updateChassis(projectId, chassisId, data);
      setProjects(prev => prev.map(p => p.id === projectId ? updated : p));
      patchProjectInList(projectId, { status: updated.status, etatCounts: computeEtatCounts(updated.chassis || []) });
      return { success: true, project: updated };
    } catch (err) { return { success: false, error: err.message }; }
  }, [patchProjectInList]);

  const deleteChassis = useCallback(async (projectId, chassisId) => {
    try {
      const updated = await projectService.deleteChassis(projectId, chassisId);
      setProjects(prev => prev.map(p => p.id === projectId ? updated : p));
      patchProjectInList(projectId, { status: updated.status, etatCounts: computeEtatCounts(updated.chassis || []) });
      return { success: true, project: updated };
    } catch (err) { return { success: false, error: err.message }; }
  }, [patchProjectInList]);

  const updateUnit = useCallback(async (projectId, chassisId, unitIndex, data) => {
    try {
      const updated = await projectService.updateUnit(projectId, chassisId, unitIndex, data);
      setProjects(prev => prev.map(p => p.id === projectId ? updated : p));
      patchProjectInList(projectId, { status: updated.status, etatCounts: computeEtatCounts(updated.chassis || []) });
      return { success: true, project: updated };
    } catch (err) { return { success: false, error: err.message }; }
  }, [patchProjectInList]);

  const updateComponent = useCallback(async (projectId, chassisId, unitIndex, compIndex, data) => {
    try {
      const updated = await projectService.updateComponent(projectId, chassisId, unitIndex, compIndex, data);
      setProjects(prev => prev.map(p => p.id === projectId ? updated : p));
      patchProjectInList(projectId, { status: updated.status, etatCounts: computeEtatCounts(updated.chassis || []) });
      return { success: true, project: updated };
    } catch (err) { return { success: false, error: err.message }; }
  }, [patchProjectInList]);

  const getBonsLivraison = useCallback((projectId) => projectService.getBonsLivraison(projectId), []);
  const getBonLivraison = useCallback((projectId, dateKey) => projectService.getBonLivraison(projectId, dateKey), []);

  const addUsedBar = useCallback(async (projectId, itemId, quantity) => {
    try {
      const updated = await projectService.addUsedBar(projectId, itemId, quantity);
      setProjects(prev => prev.map(p => p.id === projectId ? updated : p));
      return { success: true, project: updated };
    } catch (err) { return { success: false, error: err.message }; }
  }, []);

  const removeUsedBar = useCallback(async (projectId, itemId) => {
    try {
      const updated = await projectService.removeUsedBar(projectId, itemId);
      setProjects(prev => prev.map(p => p.id === projectId ? updated : p));
      return { success: true, project: updated };
    } catch (err) { return { success: false, error: err.message }; }
  }, []);

  const getProjectById = useCallback((id) => projects.find(p => p.id === id) || null, [projects]);

  const value = useMemo(() => ({
    projects, loading, error, loadProjects, refreshProject,
    projectList, listLoading, loadProjectList, patchProjectInList,
    addProject, updateProject, deleteProject,
    addChassis, updateChassis, deleteChassis,
    updateUnit, updateComponent,
    getBonsLivraison, getBonLivraison,
    addUsedBar, removeUsedBar,
    getProjectById,
  }), [
    projects, loading, error, loadProjects, refreshProject,
    projectList, listLoading, loadProjectList, patchProjectInList,
    addProject, updateProject, deleteProject,
    addChassis, updateChassis, deleteChassis,
    updateUnit, updateComponent,
    getBonsLivraison, getBonLivraison,
    addUsedBar, removeUsedBar,
    getProjectById,
  ]);

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
};

export const useProjects = () => {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProjects must be used within ProjectProvider');
  return ctx;
};

export default ProjectContext;