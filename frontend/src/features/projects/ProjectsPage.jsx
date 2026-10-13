// ProjectsPage.jsx — same as before but drop `limit`/`onLoadMore` entirely
import { useMemo, useState } from 'react';
import CategoryPage from './categories/CategoryPage';
import { useLanguage } from '../../context/LanguageContext';
import './ProjectsPage.css';

// label = translation key
const MAIN_CATEGORIES = [
  { key: 'particuliers', label: 'pjParticuliers' },
  { key: 'tgalu', label: 'pjTGALU' },
];
const PROJECT_STATUS_FILTERS = [
  { key: 'all', label: 'pjAll' },
  { key: 'non_entame', label: 'etat_non_entame' },
  { key: 'en_cours', label: 'etat_en_cours' },
  { key: 'fabrique', label: 'etat_fabrique' },
  { key: 'pret_a_livrer', label: 'etat_pret_a_livrer' },
  { key: 'cloture', label: 'chStCloture' },
  { key: 'non_vitre', label: 'etat_non_vitre' },
];

export default function ProjectsPage() {
  const { t } = useLanguage();
  const [activeCategory, setActiveCategory] = useState('particuliers');
  const [statusFilter, setStatusFilter] = useState('all');

  const currentStatusLabel = useMemo(() => {
    return t(PROJECT_STATUS_FILTERS.find(s => s.key === statusFilter)?.label || 'pjAll');
  }, [statusFilter, t]);

  return (
    <div className="projects-page-shell">
      <div className="projects-page-shell__categories">
        {MAIN_CATEGORIES.map(cat => (
          <button
            key={cat.key}
            className={`projects-category-tab ${activeCategory === cat.key ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat.key)}
          >
            {t(cat.label)}
          </button>
        ))}
      </div>
      <div className="projects-page-shell__filters">
        <div className="project-status-tabs">
          {PROJECT_STATUS_FILTERS.map(status => (
            <button
              key={status.key}
              className={`project-status-tab ${statusFilter === status.key ? 'active' : ''}`}
              onClick={() => setStatusFilter(status.key)}
            >
              {t(status.label)}
            </button>
          ))}
        </div>
        <div className="projects-page-shell__filter-label">
          {t('pjState')} <strong>{currentStatusLabel}</strong>
        </div>
      </div>
      <div className="projects-page-shell__body">
        <CategoryPage categoryKey={activeCategory} statusFilter={statusFilter} />
      </div>
    </div>
  );
}