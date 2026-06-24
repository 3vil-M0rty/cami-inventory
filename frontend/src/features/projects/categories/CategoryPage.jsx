// categories/CategoryPage.jsx
import { useState, useEffect } from 'react';
import AluminiumTab from '../tabs/AluminiumTab';
import LaquageTab from '../tabs/LaquageTab';
import VitrageTab from '../tabs/VitrageTab';

const TABS = [
  { key: 'aluminium', label: 'Aluminium', Component: AluminiumTab },
  { key: 'laquage', label: 'Laquage', Component: LaquageTab },
  { key: 'vitrage', label: 'Vitrage', Component: VitrageTab },
];

const PAGE_SIZE = 10;

export default function CategoryPage({ categoryKey, statusFilter }) {
  const [activeTab, setActiveTab] = useState('aluminium');
  const [limit, setLimit] = useState(PAGE_SIZE);

  // Reset limit when category or status filter changes from parent
  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [categoryKey, statusFilter]);

  const handleTabChange = (key) => {
    setActiveTab(key);
    setLimit(PAGE_SIZE);
  };

  const ActiveComponent =
    TABS.find(t => t.key === activeTab)?.Component || AluminiumTab;

  return (
    <div className="category-page">
      <div className="category-page__tabs">
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`category-page__tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => handleTabChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="category-page__content">
        <ActiveComponent
          categoryKey={categoryKey}
          statusFilter={statusFilter}
          limit={limit}
          onLoadMore={(target) => typeof target === 'number' ? setLimit(target) : setLimit(prev => prev + PAGE_SIZE)} />
      </div>
    </div>
  );
}