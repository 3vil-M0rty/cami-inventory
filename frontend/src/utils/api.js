import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

// Axios instance that auto-attaches auth token
const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use(config => {
  const token = localStorage.getItem('auth_token');
  if (token) config.headers['x-auth-token'] = token;
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('auth_token');
      window.location.reload(); // force back to login
    }
    return Promise.reject(err);
  }
);

export default api;
export { API_URL };
