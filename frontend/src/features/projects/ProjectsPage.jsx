// ProjectsPage.jsx — same as before but drop `limit`/`onLoadMore` entirely
import { useEffect, useMemo, useState } from 'react';
import CategoryPage from './categories/CategoryPage';
import { useLanguage } from '../../context/LanguageContext';
import { PAGE_PATHS, getQueryParam, updateQuery } from '../../routes';
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

// URL changed in code → let the tabs react like on back / forward (close an open project)
const notifyUrl = () => window.dispatchEvent(new PopStateEvent('popstate'));

// Client (?client=tgalu) and état (?etat=en_cours) are kept in the URL: a refresh stays on the same list
const categoryFromUrl = () => { const c = getQueryParam('client'); return MAIN_CATEGORIES.some(x => x.key === c) ? c : 'particuliers'; };
const statusFromUrl = () => { const s = getQueryParam('etat'); return PROJECT_STATUS_FILTERS.some(x => x.key === s) ? s : 'all'; };

export default function ProjectsPage() {
  const { t } = useLanguage();
  const [activeCategory, setActiveCategory] = useState(categoryFromUrl);
  const [statusFilter, setStatusFilter] = useState(statusFromUrl);

  // A filter change goes back to the list (an open project is closed)
  const changeCategory = (key) => { setActiveCategory(key); updateQuery({ client: key === 'particuliers' ? null : key, vue: null }, { path: PAGE_PATHS.projects }); notifyUrl(); };
  const changeStatus = (key) => { setStatusFilter(key); updateQuery({ etat: key === 'all' ? null : key, vue: null }, { path: PAGE_PATHS.projects }); notifyUrl(); };

  // Back / forward buttons, "Projets" in the menu
  useEffect(() => {
    const onPop = () => { setActiveCategory(categoryFromUrl()); setStatusFilter(statusFromUrl()); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

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
            onClick={() => changeCategory(cat.key)}
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
              onClick={() => changeStatus(status.key)}
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