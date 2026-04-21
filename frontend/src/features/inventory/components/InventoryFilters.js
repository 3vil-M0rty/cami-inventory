import { useState } from 'react';
import { Search, X, AlertTriangle, List } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import './InventoryFilters.css';

export const FILTER_TYPES = {
  ALL: 'all',
  LOW_STOCK: 'low_stock',
};

const InventoryFilters = ({ onFilterChange, onSearchChange }) => {
  const { t } = useLanguage();
  const [activeFilter, setActiveFilter] = useState(FILTER_TYPES.ALL);
  const [searchTerm,   setSearchTerm]   = useState('');

  const handleFilterClick = (type) => {
    setActiveFilter(type);
    onFilterChange(type);
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    onSearchChange(e.target.value);
  };

  const clearSearch = () => {
    setSearchTerm('');
    onSearchChange('');
  };

  return (
    <div className="inv-filters">
      <div className="inv-filters__pills">
        <button
          className={`inv-filter-btn ${activeFilter === FILTER_TYPES.ALL ? 'active' : ''}`}
          onClick={() => handleFilterClick(FILTER_TYPES.ALL)}
        >
          <List size={12} strokeWidth={2.5} />
          {t('showAll')}
        </button>
        <button
          className={`inv-filter-btn inv-filter-btn--alert ${activeFilter === FILTER_TYPES.LOW_STOCK ? 'active' : ''}`}
          onClick={() => handleFilterClick(FILTER_TYPES.LOW_STOCK)}
        >
          <AlertTriangle size={12} strokeWidth={2.5} />
          {t('showLowStock')}
        </button>
      </div>

      <div className="inv-filters__search">
        <Search size={14} className="inv-search-icon" />
        <input
          type="text"
          className="inv-search-field"
          placeholder={t('searchPlaceholder')}
          value={searchTerm}
          onChange={handleSearchChange}
        />
        {searchTerm && (
          <button className="inv-search-clear" onClick={clearSearch} aria-label="Clear search">
            <X size={14} strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  );
};

export default InventoryFilters;