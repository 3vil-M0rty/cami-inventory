import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import projectService from '../services/projectService';

const ProjectContext = createContext(null);

export const ProjectProvider = ({ children }) => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  useEffect(() => { loadProjects(); }, []);

  const loadProjects = async () => {
    try {
      setLoading(true); setError(null);
      setProjects(await projectService.getAllProjects());
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  // Refresh a single project in state from server
  const refreshProject = async (id) => {
    const updated = await projectService.getProjectById(id);
    setProjects(prev => prev.map(p => p.id === id ? updated : p));
    return updated;
  };

  // ---- Projects ----
  const addProject = async (data) => {
    try {
      const p = await projectService.createProject(data);
      setProjects(prev => [p, ...prev]);
      return { success: true, project: p };
    } catch (err) { return { success: false, error: err.message }; }
  };

  const updateProject = async (id, data) => {
    try {
      const updated = await projectService.updateProject(id, data);
      setProjects(prev => prev.map(p => p.id === id ? updated : p));
      return { success: true, project: updated };
    } catch (err) { return { success: false, error: err.message }; }
  };

  const deleteProject = async (id) => {
    try {
      await projectService.deleteProject(id);
      setProjects(prev => prev.filter(p => p.id !== id));
      return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
  };

  // ---- Chassis ----
  const addChassis = async (projectId, data) => {
    try {
      const updated = await projectService.addChassis(projectId, data);
      setProjects(prev => prev.map(p => p.id === projectId ? updated : p));
      return { success: true, project: updated };
    } catch (err) { return { success: false, error: err.message }; }
  };

  const updateChassis = async (projectId, chassisId, data) => {
    try {
      const updated = await projectService.updateChassis(projectId, chassisId, data);
      setProjects(prev => prev.map(p => p.id === projectId ? updated : p));
      return { success: true, project: updated };
    } catch (err) { return { success: false, error: err.message }; }
  };

  const deleteChassis = async (projectId, chassisId) => {
    try {
      const updated = await projectService.deleteChassis(projectId, chassisId);
      setProjects(prev => prev.map(p => p.id === projectId ? updated : p));
      return { success: true, project: updated };
    } catch (err) { return { success: false, error: err.message }; }
  };

  /**
   * Update a single unit's état and optional deliveryDate.
   * Server auto-computes new project status and returns full project.
   */
  const updateUnit = async (projectId, chassisId, unitIndex, data) => {
    try {
      const updated = await projectService.updateUnit(projectId, chassisId, unitIndex, data);
      setProjects(prev => prev.map(p => p.id === projectId ? updated : p));
      return { success: true, project: updated };
    } catch (err) { return { success: false, error: err.message }; }
  };

  // ---- BL (Bon de Livraison) ----
  const getBonsLivraison = (projectId) => projectService.getBonsLivraison(projectId);
  const getBonLivraison  = (projectId, dateKey) => projectService.getBonLivraison(projectId, dateKey);

  // ---- Used Bars ----
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
      addProject, updateProject, deleteProject,
      addChassis, updateChassis, deleteChassis,
      updateUnit,
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
