import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Hide images that fail to load (no alt text / broken icon spilling over the layout); show them again if a new src loads
document.addEventListener('error', (e) => { if (e.target?.tagName === 'IMG') e.target.classList.add('img--broken'); }, true);
document.addEventListener('load', (e) => { if (e.target?.tagName === 'IMG') e.target.classList.remove('img--broken'); }, true);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
