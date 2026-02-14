import { useState } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import './InventoryFilters.css';

/**
 * InventoryFilters Component
 * 
 * Provides filtering and search capabilities
 */

export const FILTER_TYPES = {
  ALL: 'all',
  LOW_STOCK: 'low_stock'
};

const InventoryFilters = ({ onFilterChange, onSearchChange }) => {
  const { t } = useLanguage();
  const [activeFilter, setActiveFilter] = useState(FILTER_TYPES.ALL);
  const [searchTerm, setSearchTerm] = useState('');

  const handleFilterClick = (filterType) => {
    setActiveFilter(filterType);
    onFilterChange(filterType);
  };

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    onSearchChange(value);
  };

  const handleSearchClear = () => {
    setSearchTerm('');
    onSearchChange('');
  };

  return (
    <div className="inventory-filters">
      {/* Filter Buttons */}
      <div className="inventory-filters__buttons">
        <button
          className={`filter-btn ${activeFilter === FILTER_TYPES.ALL ? 'filter-btn--active' : ''}`}
          onClick={() => handleFilterClick(FILTER_TYPES.ALL)}
        >
          {t('showAll')}
        </button>
        <button
          className={`filter-btn ${activeFilter === FILTER_TYPES.LOW_STOCK ? 'filter-btn--active' : ''}`}
          onClick={() => handleFilterClick(FILTER_TYPES.LOW_STOCK)}
        >
          {t('showLowStock')}
        </button>
      </div>

      {/* Search Input */}
      <div className="inventory-filters__search">
        <div className="search-input">
          <svg 
            className="search-input__icon" 
            width="18" 
            height="18" 
            viewBox="0 0 18 18" 
            fill="none"
          >
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M12.5 12.5L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            className="search-input__field"
            placeholder={t('searchPlaceholder')}
            value={searchTerm}
            onChange={handleSearchChange}
          />
          {searchTerm && (
            <button
              className="search-input__clear"
              onClick={handleSearchClear}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default InventoryFilters;
