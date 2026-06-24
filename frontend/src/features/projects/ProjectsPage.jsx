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

const PAGE_SIZE = 10;

export default function ProjectsPage() {
  const [activeCategory, setActiveCategory] = useState('particuliers');
  const [statusFilter, setStatusFilter] = useState('all');
  const [limit, setLimit] = useState(PAGE_SIZE);

  const currentStatusLabel = useMemo(() => {
    return PROJECT_STATUS_FILTERS.find(s => s.key === statusFilter)?.label || 'Tous';
  }, [statusFilter]);

  // Reset limit when category or filter changes
  const handleCategoryChange = (key) => {
    setActiveCategory(key);
    setLimit(PAGE_SIZE);
  };

  const handleStatusChange = (key) => {
    setStatusFilter(key);
    setLimit(PAGE_SIZE);
  };

  return (
    <div className="projects-page-shell">
      {/* ── Main categories ───────────────────────── */}
      <div className="projects-page-shell__categories">
        {MAIN_CATEGORIES.map(cat => (
          <button
            key={cat.key}
            className={`projects-category-tab ${activeCategory === cat.key ? 'active' : ''}`}
            onClick={() => handleCategoryChange(cat.key)}
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
              className={`project-status-tab ${statusFilter === status.key ? 'active' : ''}`}
              onClick={() => handleStatusChange(status.key)}
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
          limit={limit}
          onLoadMore={() => setLimit(prev => prev + PAGE_SIZE)}
        />
      </div>
    </div>
  );
}