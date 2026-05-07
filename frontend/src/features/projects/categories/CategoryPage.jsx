// categories/CategoryPage.jsx
import { useState } from 'react';
import AluminiumTab from '../tabs/AluminiumTab';
import LaquageTab from '../tabs/LaquageTab';
import VitrageTab from '../tabs/VitrageTab';

const TABS = [
  { key: 'aluminium', label: 'Aluminium', Component: AluminiumTab },
  { key: 'laquage',   label: 'Laquage',   Component: LaquageTab   },
  { key: 'vitrage',   label: 'Vitrage',   Component: VitrageTab   },
];

export default function CategoryPage({ categoryKey }) {
  const [activeTab, setActiveTab] = useState('aluminium');
  const ActiveComponent = TABS.find(t => t.key === activeTab)?.Component || AluminiumTab;

  return (
    <div className="category-page">
      <div className="category-page__tabs">
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`category-page__tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="category-page__content">
        <ActiveComponent categoryKey={categoryKey} />
      </div>
    </div>
  );
}