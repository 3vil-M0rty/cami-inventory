// categories/CategoryPage.jsx
import { useEffect, useState } from 'react';
import AluminiumTab from '../tabs/AluminiumTab';
import LaquageTab from '../tabs/LaquageTab';
import VitrageTab from '../tabs/VitrageTab';
import { useLanguage } from '../../../context/LanguageContext';
import { PAGE_PATHS, getQueryParam, updateQuery } from '../../../routes';

const TABS = [
  { key: 'aluminium', label: 'superCatAluminium', Component: AluminiumTab },
  { key: 'laquage', label: 'pjTabLaquage', Component: LaquageTab },
  { key: 'vitrage', label: 'pjTabVitrage', Component: VitrageTab },
];

// Tab kept in the URL (?onglet=laquage): a refresh stays on the same tab
const tabFromUrl = () => { const o = getQueryParam('onglet'); return TABS.some(tb => tb.key === o) ? o : 'aluminium'; };

export default function CategoryPage({ categoryKey, statusFilter }) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState(tabFromUrl);
  // Another tab → back to its list (an open project belongs to the previous tab)
  const changeTab = (key) => {
    setActiveTab(key);
    updateQuery({ onglet: key === 'aluminium' ? null : key, vue: null }, { path: PAGE_PATHS.projects });
  };
  useEffect(() => {
    const onPop = () => setActiveTab(tabFromUrl());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const ActiveComponent = TABS.find(tb => tb.key === activeTab)?.Component || AluminiumTab;

  return (
    <div className="category-page">
      <div className="category-page__tabs">
        <div className="category-page__seg" role="tablist">
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`category-page__tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => changeTab(tab.key)}
          >
            {t(tab.label)}
          </button>
        ))}
        </div>
      </div>
      <div className="category-page__content">
        <ActiveComponent categoryKey={categoryKey} statusFilter={statusFilter} />
      </div>
    </div>
  );
}