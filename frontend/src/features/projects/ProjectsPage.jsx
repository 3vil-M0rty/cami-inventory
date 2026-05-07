// ProjectsPage.jsx
import { useMemo, useState } from 'react';
import CategoryPage from './categories/CategoryPage';
import './ProjectsPage.css';

const MAIN_CATEGORIES = [
  { key: 'particuliers', label: 'Particuliers' },
  { key: 'tgalu', label: 'TGALU' },
];

const PROJECT_STATUS_FILTERS = [
  { key: 'all', label: 'Tous' },
  { key: 'non_entame', label: 'Non entamé' },
  { key: 'en_cours', label: 'En cours' },
  { key: 'fabrique', label: 'Fabriqué' },
  { key: 'pret_a_livrer', label: 'Prêt à livrer' },
  { key: 'cloture', label: 'Clôturé' },
  { key: 'non_vitre', label: 'Non vitré' },
];

export default function ProjectsPage() {
  const [activeCategory, setActiveCategory] = useState('particuliers');
  const [statusFilter, setStatusFilter] = useState('all');

  const currentStatusLabel = useMemo(() => {
    return (
      PROJECT_STATUS_FILTERS.find(s => s.key === statusFilter)?.label || 'Tous'
    );
  }, [statusFilter]);

  return (
    <div className="projects-page-shell">
      {/* ── Main categories ───────────────────────── */}
      <div className="projects-page-shell__categories">
        {MAIN_CATEGORIES.map(cat => (
          <button
            key={cat.key}
            className={`projects-category-tab ${
              activeCategory === cat.key ? 'active' : ''
            }`}
            onClick={() => setActiveCategory(cat.key)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* ── Status filters row ───────────────────── */}
      <div className="projects-page-shell__filters">
        <div className="project-status-tabs">
          {PROJECT_STATUS_FILTERS.map(status => (
            <button
              key={status.key}
              className={`project-status-tab ${
                statusFilter === status.key ? 'active' : ''
              }`}
              onClick={() => setStatusFilter(status.key)}
            >
              {status.label}
            </button>
          ))}
        </div>

        <div className="projects-page-shell__filter-label">
          État: <strong>{currentStatusLabel}</strong>
        </div>
      </div>

      {/* ── Content ──────────────────────────────── */}
      <div className="projects-page-shell__body">
        <CategoryPage
          categoryKey={activeCategory}
          statusFilter={statusFilter}
        />
      </div>
    </div>
  );
}