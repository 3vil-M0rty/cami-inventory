import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import projectService from '../services/projectService';

/**
 * Project Context
 *
 * Mirrors the pattern of InventoryContext.js.
 * Centralized state for all project data.
 */

const ProjectContext = createContext(null);

export const ProjectProvider = ({ children }) => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  useEffect(() => { loadProjects(); }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await projectService.getAllProjects();
      setProjects(data);
    } catch (err) {
      setError(err.message);
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  };

  // ---- Project CRUD ----

  const addProject = async (projectData) => {
    try {
      const newProject = await projectService.createProject(projectData);
      setProjects(prev => [newProject, ...prev]);
      return { success: true, project: newProject };
    } catch (err) {
      console.error('Failed to add project:', err);
      return { success: false, error: err.message };
    }
  };

  const updateProject = async (id, projectData) => {
    try {
      const updated = await projectService.updateProject(id, projectData);
      setProjects(prev => prev.map(p => p.id === id ? updated : p));
      return { success: true, project: updated };
    } catch (err) {
      console.error('Failed to update project:', err);
      return { success: false, error: err.message };
    }
  };

  const deleteProject = async (id) => {
    try {
      await projectService.deleteProject(id);
      setProjects(prev => prev.filter(p => p.id !== id));
      return { success: true };
    } catch (err) {
      console.error('Failed to delete project:', err);
      return { success: false, error: err.message };
    }
  };

  // ---- Chassis ----

  const addChassis = async (projectId, chassisData) => {
    try {
      await projectService.addChassis(projectId, chassisData);
      // Reload the full project to get updated embedded chassis
      const updated = await projectService.getProjectById(projectId);
      setProjects(prev => prev.map(p => p.id === projectId ? updated : p));
      return { success: true, project: updated };
    } catch (err) {
      console.error('Failed to add chassis:', err);
      return { success: false, error: err.message };
    }
  };

  const updateChassis = async (projectId, chassisId, chassisData) => {
    try {
      await projectService.updateChassis(projectId, chassisId, chassisData);
      const updated = await projectService.getProjectById(projectId);
      setProjects(prev => prev.map(p => p.id === projectId ? updated : p));
      return { success: true, project: updated };
    } catch (err) {
      console.error('Failed to update chassis:', err);
      return { success: false, error: err.message };
    }
  };

  const deleteChassis = async (projectId, chassisId) => {
    try {
      await projectService.deleteChassis(projectId, chassisId);
      const updated = await projectService.getProjectById(projectId);
      setProjects(prev => prev.map(p => p.id === projectId ? updated : p));
      return { success: true, project: updated };
    } catch (err) {
      console.error('Failed to delete chassis:', err);
      return { success: false, error: err.message };
    }
  };

  // ---- Used Bars (also triggers inventory refresh via InventoryContext) ----

  const addUsedBar = async (projectId, itemId, quantity) => {
    try {
      const updated = await projectService.addUsedBar(projectId, itemId, quantity);
      setProjects(prev => prev.map(p => p.id === projectId ? updated : p));
      return { success: true, project: updated };
    } catch (err) {
      console.error('Failed to add used bar:', err);
      return { success: false, error: err.message };
    }
  };

  const removeUsedBar = async (projectId, itemId) => {
    try {
      const updated = await projectService.removeUsedBar(projectId, itemId);
      setProjects(prev => prev.map(p => p.id === projectId ? updated : p));
      return { success: true, project: updated };
    } catch (err) {
      console.error('Failed to remove used bar:', err);
      return { success: false, error: err.message };
    }
  };

  // ---- Computed ----

  const getProjectById = useCallback((id) => {
    return projects.find(p => p.id === id) || null;
  }, [projects]);

  const value = {
    projects,
    loading,
    error,
    loadProjects,
    addProject,
    updateProject,
    deleteProject,
    addChassis,
    updateChassis,
    deleteChassis,
    addUsedBar,
    removeUsedBar,
    getProjectById
  };

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
};

export const useProjects = () => {
  const context = useContext(ProjectContext);
  if (!context) throw new Error('useProjects must be used within ProjectProvider');
  return context;
};

export default ProjectContext;
