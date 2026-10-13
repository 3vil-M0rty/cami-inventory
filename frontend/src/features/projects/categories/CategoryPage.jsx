// categories/CategoryPage.jsx
import { useState } from 'react';
import AluminiumTab from '../tabs/AluminiumTab';
import LaquageTab from '../tabs/LaquageTab';
import VitrageTab from '../tabs/VitrageTab';
import { useLanguage } from '../../../context/LanguageContext';

const TABS = [
  { key: 'aluminium', label: 'superCatAluminium', Component: AluminiumTab },
  { key: 'laquage', label: 'pjTabLaquage', Component: LaquageTab },
  { key: 'vitrage', label: 'pjTabVitrage', Component: VitrageTab },
];

export default function CategoryPage({ categoryKey, statusFilter }) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('aluminium');
  const ActiveComponent = TABS.find(tb => tb.key === activeTab)?.Component || AluminiumTab;

  return (
    <div className="category-page">
      <div className="category-page__tabs">
        <div className="category-page__seg" role="tablist">
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`category-page__tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
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