/**
 * Project Service — Unit-level chassis + BL (Bon de Livraison) support
 */

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const handle = async (res) => {
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || e.message || `HTTP ${res.status}`); }
  return res.json();
};

export const getAllProjects   = () => fetch(`${API_BASE}/projects`).then(handle);
export const getProjectById   = (id) => fetch(`${API_BASE}/projects/${id}`).then(handle);
export const createProject    = (data) => fetch(`${API_BASE}/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(handle);
export const updateProject    = (id, data) => fetch(`${API_BASE}/projects/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(handle);
export const deleteProject    = (id) => fetch(`${API_BASE}/projects/${id}`, { method: 'DELETE' }).then(handle);

export const addChassis    = (projectId, data) => fetch(`${API_BASE}/projects/${projectId}/chassis`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(handle);
export const updateChassis = (projectId, cid, data) => fetch(`${API_BASE}/projects/${projectId}/chassis/${cid}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(handle);
export const deleteChassis = (projectId, cid) => fetch(`${API_BASE}/projects/${projectId}/chassis/${cid}`, { method: 'DELETE' }).then(handle);

/** Patch a single unit's etat and/or deliveryDate. Returns updated project. */
export const updateUnit = (projectId, chassisId, unitIndex, data) =>
  fetch(`${API_BASE}/projects/${projectId}/chassis/${chassisId}/units/${unitIndex}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  }).then(handle);

export const getBonsLivraison = (projectId) => fetch(`${API_BASE}/projects/${projectId}/bons-livraison`).then(handle);
export const getBonLivraison  = (projectId, dateKey) => fetch(`${API_BASE}/projects/${projectId}/bons-livraison/${dateKey}`).then(handle);

export const addUsedBar    = (projectId, itemId, quantity) => fetch(`${API_BASE}/projects/${projectId}/bars`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId, quantity }) }).then(handle);
export const removeUsedBar = (projectId, itemId) => fetch(`${API_BASE}/projects/${projectId}/bars/${itemId}`, { method: 'DELETE' }).then(handle);

const projectService = { getAllProjects, getProjectById, createProject, updateProject, deleteProject, addChassis, updateChassis, deleteChassis, updateUnit, getBonsLivraison, getBonLivraison, addUsedBar, removeUsedBar };
export default projectService;
