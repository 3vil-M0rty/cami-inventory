import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useProjects } from '../../../context/ProjectContext';
import { useLanguage } from '../../../context/LanguageContext';
import './UsedBarsPanel.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const SUPER_CATS = [
  { key: 'aluminium',   icon: '🔩', labelKey: 'superCatAluminium' },
  { key: 'verre',       icon: '💎', labelKey: 'superCatVerre'      },
  { key: 'accessoires', icon: '🔧', labelKey: 'superCatAccessoires'},
  { key: 'poudre', icon: '🎨', labelKey: 'superCatPoudre'},
];

function UsedBarsPanel({ project }) {
  const { addUsedBar, removeUsedBar } = useProjects();
  const { t, currentLanguage: language } = useLanguage();

  const [activeSuperCat, setActiveSuperCat] = useState('aluminium');
  const [searchTerm,     setSearchTerm]     = useState('');
  const [searchResults,  setSearchResults]  = useState([]);
  const [quantities,     setQuantities]     = useState({});
  const [searching,      setSearching]      = useState(false);
  const [error,          setError]          = useState('');

  // Search inventory filtered by supercategory
  useEffect(() => {
    if (!searchTerm.trim()) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await axios.get(
          `${API_URL}/inventory/search?q=${encodeURIComponent(searchTerm)}&superCategory=${activeSuperCat}`
        );
        setSearchResults(res.data);
      } catch (e) { console.error(e); }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, activeSuperCat]);

  // Reset search when switching supercategory
  const handleSuperCatChange = (key) => {
    setActiveSuperCat(key);
    setSearchTerm('');
    setSearchResults([]);
    setError('');
  };

  const handleAdd = async (item) => {
    const qty = Number(quantities[item.id]) || 1;
    if (qty < 1) return;
    setError('');
    const result = await addUsedBar(project.id, item.id, qty);
    if (!result.success) {
      setError(result.error || t('criticalStock'));
    } else {
      setQuantities(prev => ({ ...prev, [item.id]: '' }));
      setSearchTerm('');
      setSearchResults([]);
    }
  };

  const handleRemove = async (itemId) => {
    await removeUsedBar(project.id, itemId);
  };

  // Group used bars by supercategory
  const usedBySuper = (project.usedBars || []).reduce((acc, bar) => {
    const sc = bar.itemId?.superCategory || 'aluminium';
    if (!acc[sc]) acc[sc] = [];
    acc[sc].push(bar);
    return acc;
  }, {});

  return (
    <div className="ubp">
      {/* ── Super-category tabs ── */}
      <div className="ubp__super-tabs">
        {SUPER_CATS.map(sc => {
          const count = (usedBySuper[sc.key] || []).length;
          return (
            <button
              key={sc.key}
              className={`ubp__super-tab ${activeSuperCat === sc.key ? 'active' : ''}`}
              onClick={() => handleSuperCatChange(sc.key)}
            >
              {sc.icon} {t(sc.labelKey)}
              {count > 0 && <span className="ubp__super-count">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* ── Search ── */}
      <div className="ubp__search-wrap">
        <span className="ubp__search-icon">
          <svg width="15" height="15" viewBox="0 0 18 18" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M12.5 12.5L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </span>
        <input
          type="text"
          className="ubp__search-input"
          placeholder={t('searchInventory')}
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
        {searchTerm && (
          <button className="ubp__search-clear" onClick={() => { setSearchTerm(''); setSearchResults([]); }}>✕</button>
        )}
      </div>

      {error && <p className="ubp__error">{error}</p>}

      {/* ── Search results ── */}
      {searchResults.length > 0 && (
        <div className="ubp__results">
          <div className="ubp__results-header">
            <span>{searchResults.length} {t('loading') === 'Chargement...' ? 'résultats' : 'results'}</span>
          </div>
          {searchResults.map(item => (
            <div key={item.id} className="ubp__result-row">
              <div className="ubp__result-info">
                {item.image && <img src={item.image} alt="" className="ubp__result-img" />}
                <div>
                  <div className="ubp__result-name">{item.designation[language] || item.designation.fr}</div>
                  <div className="ubp__result-stock">
                    {t('inStock')}: <strong className={item.quantity === 0 ? 'stock-zero' : ''}>{item.quantity}</strong>
                    {item.categoryId && <span className="ubp__result-cat" style={{ background: item.categoryId.color }}>{item.categoryId.name[language]}</span>}
                  </div>
                </div>
              </div>
              <div className="ubp__result-add">
                <input
                  type="number" min="1" max={item.quantity} step="1"
                  placeholder="Qté"
                  value={quantities[item.id] || ''}
                  onChange={e => setQuantities(prev => ({ ...prev, [item.id]: e.target.value }))}
                  className="ubp__qty-input"
                />
                <button
                  className="ubp__add-btn"
                  onClick={() => handleAdd(item)}
                  disabled={item.quantity === 0}
                >
                  + {t('add')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {searchTerm && !searching && searchResults.length === 0 && (
        <div className="ubp__no-results">{t('noItems')}</div>
      )}

      {/* ── Used items for active supercategory ── */}
      <div className="ubp__used-section">
        <div className="ubp__used-header">
          <h3>{t('usedBarsTitle')}</h3>
          <span className="ubp__used-count">{(usedBySuper[activeSuperCat] || []).length}</span>
        </div>

        {!(usedBySuper[activeSuperCat] || []).length ? (
          <div className="ubp__empty">{t('noUsedBars')}</div>
        ) : (
          <table className="ubp__table">
            <thead>
              <tr>
                <th>{t('barDesignation')}</th>
                <th style={{ textAlign: 'center' }}>{t('barQtyUsed')}</th>
                <th style={{ textAlign: 'center' }}>{t('barStockRemaining')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(usedBySuper[activeSuperCat] || []).map(bar => {
                const item = bar.itemId;
                if (!item || typeof item !== 'object') return null;
                return (
                  <tr key={item.id || item._id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {item.image && <img src={item.image} alt="" style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4 }} />}
                        <span>{item.designation?.[language] || item.designation?.fr}</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="ubp__qty-badge">{bar.quantity}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`ubp__stock-val ${item.quantity < (item.threshold || 0) ? 'low' : ''}`}>
                        {item.quantity}
                      </span>
                    </td>
                    <td>
                      <button className="ubp__remove-btn" onClick={() => handleRemove(item.id || item._id)}>
                        {t('delete')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Summary of all supercategories ── */}
      {(project.usedBars || []).length > 0 && (
        <div className="ubp__summary">
          {SUPER_CATS.map(sc => {
            const items = usedBySuper[sc.key] || [];
            if (!items.length) return null;
            const total = items.reduce((s, b) => s + b.quantity, 0);
            return (
              <div key={sc.key} className="ubp__summary-pill">
                {sc.icon} {t(sc.labelKey)}: <strong>{total}</strong>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default UsedBarsPanel;