// ProjectsPage.jsx
import { useState } from 'react';
import CategoryPage from './categories/CategoryPage';
import './ProjectsPage.css';

const MAIN_CATEGORIES = [
  { key: 'particuliers', label: 'Particuliers' },
  { key: 'tgalu',        label: 'TGALU' },
];

export default function ProjectsPage() {
  const [activeCategory, setActiveCategory] = useState('particuliers');

  return (
    <div className="projects-page-shell">
      {/* Particuliers | TGALU */}
      <div className="projects-page-shell__categories">
        {MAIN_CATEGORIES.map(cat => (
          <button
            key={cat.key}
            className={`projects-category-tab ${activeCategory === cat.key ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat.key)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="projects-page-shell__body">
        <CategoryPage categoryKey={activeCategory} />
      </div>
    </div>
  );
}