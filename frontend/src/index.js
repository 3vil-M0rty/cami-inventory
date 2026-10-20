import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { initCardTilt } from './components/common/cardTilt';

// Theme: dark by default, light when chosen (remembered in localStorage). Applied before the first paint.
try { if (localStorage.getItem('app_theme') === 'light') document.documentElement.dataset.theme = 'light'; } catch (e) { }

// Hide images that fail to load (no alt text / broken icon spilling over the layout); show them again if a new src loads
document.addEventListener('error', (e) => { if (e.target?.tagName === 'IMG') e.target.classList.add('img--broken'); }, true);
document.addEventListener('load', (e) => { if (e.target?.tagName === 'IMG') e.target.classList.remove('img--broken'); }, true);

initCardTilt(); // desktop: cards tilt slightly under the mouse

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
