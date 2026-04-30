import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useProjects } from '../../../context/ProjectContext';
import { useLanguage } from '../../../context/LanguageContext';
import './UsedBarsPanel.css';
import {
  Layers, Wrench, Paintbrush, MirrorRectangular,
  Trash2, Clock, X, TrendingDown, ChevronRight
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const SUPER_CATS = [
  { key: 'aluminium', color: '#dfdfdf', icon: <Layers size={13} color='#000' strokeWidth={2.5} />, labelKey: 'superCatAluminium', label: 'Aluminium' },
  { key: 'verre', color: 'lightblue', icon: <MirrorRectangular size={13} color='black' strokeWidth={2.5} />, labelKey: 'superCatVerre', label: 'Verre' },
  { key: 'accessoires', color: 'red', icon: <Wrench size={13} color='black' strokeWidth={2.5} />, labelKey: 'superCatAccessoires', label: 'Accessoires' },
  { key: 'poudre', color: 'orange', icon: <Paintbrush size={13} color='black' strokeWidth={2.5} />, labelKey: 'superCatPoudre', label: 'Poudre' }
];

function fmt(val) {
  if (val === null || val === undefined) return '0';
  const n = parseFloat(val);
  if (isNaN(n)) return '0';
  return parseFloat(n.toFixed(2)).toString();
}

function formatMovementDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Aujourd'hui à ${timeStr}`;
  if (isYesterday) return `Hier à ${timeStr}`;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ` à ${timeStr}`;
}

function MovementModal({ item, projectId, onClose, language }) {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!item) return;
    setLoading(true);
    setError('');
    axios.get(`${API_URL}/movements/item/${item.id || item._id}`)
      .then(res => {
        // Filter to only project_use movements for this specific project
        const filtered = res.data.filter(
          m => m.type === 'project_use' && m.projectId === projectId
        );
        setMovements(filtered);
      })
      .catch(() => setError('Impossible de charger les mouvements'))
      .finally(() => setLoading(false));
  }, [item, projectId]);

  if (!item) return null;

  const designation = item.designation?.[language] || item.designation?.fr || '—';

  // Build running total (movements are sorted newest-first, reverse for running calc)
  const chronological = [...movements].reverse();
  const withRunning = chronological.map((m, i) => ({
    ...m,
    runningTotal: chronological.slice(0, i + 1).reduce((s, x) => s + x.quantity, 0)
  })).reverse(); // back to newest-first for display

  const grandTotal = movements.reduce((s, m) => s + m.quantity, 0);

  return (
    <div className="ubp-modal-overlay" onClick={onClose}>
      <div className="ubp-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="ubp-modal__header">
          <div className="ubp-modal__header-info">
            {item.image && <img src={item.image} alt="" className="ubp-modal__header-img" />}
            <div>
              <div className="ubp-modal__title">{designation}</div>
              <div className="ubp-modal__subtitle">
                <TrendingDown size={11} />
                Historique des consommations
              </div>
            </div>
          </div>
          <button className="ubp-modal__close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="ubp-modal__body">
          {loading && (
            <div className="ubp-modal__state">
              <div className="ubp-modal__spinner" />
              Chargement…
            </div>
          )}
          {error && !loading && (
            <div className="ubp-modal__state ubp-modal__state--error">{error}</div>
          )}
          {!loading && !error && movements.length === 0 && (
            <div className="ubp-modal__state">Aucun mouvement enregistré pour ce projet.</div>
          )}
          {!loading && !error && withRunning.length > 0 && (
            <table className="ubp-modal__table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Date / Heure</th>
                  <th style={{ textAlign: 'center' }}>Qté</th>
                  <th style={{ textAlign: 'center' }}>Cumulé</th>
                </tr>
              </thead>
              <tbody>
                {withRunning.map((m, i) => (
                  <tr key={m._id || i}>
                    <td className="ubp-modal__row-num">{withRunning.length - i}</td>
                    <td className="ubp-modal__date">{formatMovementDate(m.createdAt)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="ubp-modal__qty-chip">−{fmt(m.quantity)}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="ubp-modal__running">{fmt(m.runningTotal)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        {!loading && !error && movements.length > 0 && (
          <div className="ubp-modal__footer">
            <span className="ubp-modal__footer-label">
              {movements.length} entrée{movements.length > 1 ? 's' : ''}
            </span>
            <div className="ubp-modal__footer-total">
              Total consommé&nbsp;
              <strong>{fmt(grandTotal)}</strong>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function UsedBarsPanel({ project }) {
  const { addUsedBar, removeUsedBar } = useProjects();
  const { t, currentLanguage: language } = useLanguage();
  const { user } = useAuth();

  const userRole = user?.role;
  const adminThing = userRole === 'Admin';

  const ROLE_SUPER_CAT_ACCESS = {
    Laquage: ['poudre'],
    BARREMAN: ['aluminium'],
    Coordinateur: [],
    Magasinier: ['accessoires'],
    LOGISTIQUE: [],
  };

  const visibleSuperCats = adminThing
    ? SUPER_CATS
    : SUPER_CATS.filter(sc => (ROLE_SUPER_CAT_ACCESS[userRole] || []).includes(sc.key));

  const [activeSuperCat, setActiveSuperCat] = useState(() => visibleSuperCats[0]?.key || 'aluminium');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  // Movement modal state
  const [modalItem, setModalItem] = useState(null);

  const isPoudre = activeSuperCat === 'poudre';

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

  const handleSuperCatChange = (key) => {
    setActiveSuperCat(key);
    setSearchTerm('');
    setSearchResults([]);
    setError('');
  };

  const handleAdd = async (item) => {
    const qty = isPoudre ? parseFloat(quantities[item.id]) : parseInt(quantities[item.id], 10);
    if (!qty || isNaN(qty) || qty <= 0) return;
    if (qty > item.quantity) { setError(t('criticalStock') || 'Quantité insuffisante en stock'); return; }
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

  const getSuperCatLabel = (sc) => {
    const translated = t(sc.labelKey);
    if (!translated || translated === sc.labelKey) return sc.label;
    return translated;
  };

  const usedBySuper = (project.usedBars || []).reduce((acc, bar) => {
    const sc = bar.itemId?.superCategory || 'aluminium';
    if (!acc[sc]) acc[sc] = [];
    acc[sc].push(bar);
    return acc;
  }, {});

  // Close modal on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setModalItem(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="ubp">
      {/* ── Super-category tabs ── */}
      <div className="ubp__super-tabs">
        {visibleSuperCats.map(sc => {
          const count = (usedBySuper[sc.key] || []).length;
          return (
            <button
              key={sc.key}
              className={`ubp__super-tab ${activeSuperCat === sc.key ? 'active' : ''}`}
              onClick={() => handleSuperCatChange(sc.key)}
              style={{
                backgroundColor: activeSuperCat === sc.key ? sc.color : undefined,
                color: activeSuperCat === sc.key ? '#fff' : undefined
              }}
            >
              {sc.icon} {getSuperCatLabel(sc)}
              {count > 0 && <span className="ubp__super-count">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* ── Search ── */}
      <div className="ubp__search-wrap">
        <span className="ubp__search-icon">
          <svg width="15" height="15" viewBox="0 0 18 18" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
            <path d="M12.5 12.5L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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
            <span>{searchResults.length} résultats</span>
          </div>
          {searchResults.map(item => (
            <div key={item.id} className="ubp__result-row">
              <div className="ubp__result-info">
                {item.image && <img src={item.image} alt="" className="ubp__result-img" />}
                <div>
                  <div className="ubp__result-name">{item.designation[language] || item.designation.fr}</div>
                  <div className="ubp__result-stock">
                    {t('inStock')}: <strong className={item.quantity === 0 ? 'stock-zero' : ''}>{fmt(item.quantity)}</strong>
                    {item.categoryId && (
                      <span className="ubp__result-cat" style={{ background: item.categoryId.color }}>
                        {item.categoryId.name[language]}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="ubp__result-add">
                <input
                  type="number"
                  min={isPoudre ? '0.01' : '1'}
                  max={item.quantity}
                  step={isPoudre ? '0.01' : '1'}
                  placeholder={isPoudre ? '0.00' : 'Qté'}
                  value={quantities[item.id] || ''}
                  onChange={e => setQuantities(prev => ({ ...prev, [item.id]: e.target.value }))}
                  className="ubp__qty-input"
                />
                <button
                  className="ubp__add-btn"
                  onClick={() => handleAdd(item)}
                  disabled={item.quantity === 0}
                >
                  {t('add')}
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
                <th>{t('designation')}</th>
                <th style={{ textAlign: 'center' }}>{t('quantity')}</th>
                {adminThing && <th style={{ textAlign: 'center' }}>{t('barStockRemaining')}</th>}
                <th style={{ textAlign: 'center' }}>Mouvements</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(usedBySuper[activeSuperCat] || []).map(bar => {
                const item = bar.itemId;
                if (!item || typeof item !== 'object') return null;
                const isItemPoudre = (item.superCategory || activeSuperCat) === 'poudre';
                return (
                  <tr key={item.id || item._id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {item.image && (
                          <img src={item.image} alt="" style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4 }} />
                        )}
                        <span>{item.designation?.[language] || item.designation?.fr}</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="ubp__qty-badge">{fmt(bar.quantity)}</span>
                    </td>
                    {adminThing && (
                      <td style={{ textAlign: 'center' }}>
                        <span className={`ubp__stock-val ${item.quantity < (item.threshold || 0) ? 'low' : ''}`}>
                          {isItemPoudre ? fmt(item.quantity) : Math.floor(item.quantity)}
                        </span>
                      </td>
                    )}
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className="ubp__history-btn"
                        title="Voir les mouvements"
                        onClick={() => setModalItem(item)}
                      >
                        <Clock size={12} />
                        Détails
                      </button>
                    </td>
                    <td>
                      {adminThing && (
                        <button className="ubp__remove-btn" title={t('delete')} onClick={() => handleRemove(item.id || item._id)}>
                          <Trash2 size={15} />
                        </button>
                      )}
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
          {visibleSuperCats.map(sc => {
            const items = usedBySuper[sc.key] || [];
            if (!items.length) return null;
            const total = items.reduce((s, b) => s + b.quantity, 0);
            return (
              <div key={sc.key} className="ubp__summary-pill">
                {sc.icon} {getSuperCatLabel(sc)}: <strong>{fmt(total)}</strong>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Movement History Modal ── */}
      {modalItem && (
        <MovementModal
          item={modalItem}
          projectId={project.id}
          onClose={() => setModalItem(null)}
          language={language}
        />
      )}
    </div>
  );
}

export default UsedBarsPanel;