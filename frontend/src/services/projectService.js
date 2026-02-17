/**
 * Project Service
 *
 * Mirrors the pattern of inventoryService.js.
 * All API calls for projects, chassis, and used bars.
 */

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

// ==================== PROJECTS ====================

export const getAllProjects = async () => {
  const response = await fetch(`${API_BASE_URL}/projects`);
  if (!response.ok) { const e = await response.json(); throw new Error(e.message || 'Failed to fetch projects'); }
  return response.json();
};

export const getProjectById = async (id) => {
  const response = await fetch(`${API_BASE_URL}/projects/${id}`);
  if (!response.ok) { const e = await response.json(); throw new Error(e.message || 'Project not found'); }
  return response.json();
};

export const createProject = async (projectData) => {
  const response = await fetch(`${API_BASE_URL}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(projectData)
  });
  if (!response.ok) { const e = await response.json(); throw new Error(e.message || 'Failed to create project'); }
  return response.json();
};

export const updateProject = async (id, projectData) => {
  const response = await fetch(`${API_BASE_URL}/projects/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(projectData)
  });
  if (!response.ok) { const e = await response.json(); throw new Error(e.message || 'Failed to update project'); }
  return response.json();
};

export const deleteProject = async (id) => {
  const response = await fetch(`${API_BASE_URL}/projects/${id}`, { method: 'DELETE' });
  if (!response.ok) { const e = await response.json(); throw new Error(e.message || 'Failed to delete project'); }
  return response.json();
};

// ==================== CHASSIS ====================

export const addChassis = async (projectId, chassisData) => {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/chassis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(chassisData)
  });
  if (!response.ok) { const e = await response.json(); throw new Error(e.message || 'Failed to add chassis'); }
  return response.json();
};

export const updateChassis = async (projectId, chassisId, chassisData) => {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/chassis/${chassisId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(chassisData)
  });
  if (!response.ok) { const e = await response.json(); throw new Error(e.message || 'Failed to update chassis'); }
  return response.json();
};

export const deleteChassis = async (projectId, chassisId) => {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/chassis/${chassisId}`, { method: 'DELETE' });
  if (!response.ok) { const e = await response.json(); throw new Error(e.message || 'Failed to delete chassis'); }
  return response.json();
};

// ==================== USED BARS ====================

export const addUsedBar = async (projectId, itemId, quantity) => {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/bars`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId, quantity })
  });
  if (!response.ok) { const e = await response.json(); throw new Error(e.message || 'Failed to add bar'); }
  return response.json();
};

export const removeUsedBar = async (projectId, itemId) => {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/bars/${itemId}`, { method: 'DELETE' });
  if (!response.ok) { const e = await response.json(); throw new Error(e.message || 'Failed to remove bar'); }
  return response.json();
};

const projectService = {
  getAllProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  addChassis,
  updateChassis,
  deleteChassis,
  addUsedBar,
  removeUsedBar
};

export default projectService;
