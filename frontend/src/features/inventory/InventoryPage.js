import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';

import axios from 'axios';
import * as XLSX from 'xlsx';
import {
  Layers, GlassWater, Wrench, FlaskConical, Settings, Paintbrush, MirrorRectangular,
  Search, AlertTriangle, AlertCircle, Plus, Minus, Pencil, Trash2,
  FileDown, PackagePlus, Package, ChevronRight, ChevronUp, ChevronDown, Tag,
  CheckCircle2, XCircle, Clock, Lock, ShoppingCart, Sheet, ZoomIn, ClipboardList,
} from 'lucide-react';
import ItemOrdersModal from './components/ItemOrdersModal';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { dialog } from '../../components/common/dialog';
import './InventoryPage.css';
import './InventoryPaging.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

axios.interceptors.request.use((config) => {
  const t = localStorage.getItem('auth_token');
  if (t) config.headers['Authorization'] = `Bearer ${t}`;
  return config;
});

function fmt(val) {
  if (val === null || val === undefined) return '0';
  const n = parseFloat(val);
  if (isNaN(n)) return '0';
  return parseFloat(n.toFixed(2)).toString();
}

/* Icon map for built-in super-categories */
const SC_ICON_MAP = {
  aluminium: <Layers size={13} strokeWidth={2.5} />,
  verre: <MirrorRectangular size={13} strokeWidth={2.5} />,
  accessoires: <Wrench size={13} strokeWidth={2.5} />,
  poudre: <Paintbrush size={13} strokeWidth={2.5} />,
};

function getSCIcon(key) {
  return SC_ICON_MAP[key] || <Package size={13} strokeWidth={2.5} />;
}

const DEFAULT_SUPER_CATS = [
  { key: 'aluminium', labelFr: 'Aluminium', labelIt: 'Alluminio', labelEn: 'Aluminium', color: '#3b82f6' },
  { key: 'verre', labelFr: 'Verre', labelIt: 'Vetro', labelEn: 'Glass', color: '#06b6d4' },
  { key: 'accessoires', labelFr: 'Accessoires', labelIt: 'Accessori', labelEn: 'Accessories', color: '#f59e0b' },
  { key: 'poudre', labelFr: 'Poudre', labelIt: 'Polvere', labelEn: 'Powder', color: '#ef4444' },
];

// Inventory is loaded page by page (the server filters / searches); last result per view kept in memory
const PAGE_SIZE = 40;
const FILTER_TO_STOCK = { 'low-stock': 'critical', 'alert-stock': 'warning', ordered: 'ordered' };
const inventoryViewCache = new Map(); // viewKey -> { items, total, page, hasMore }

function getSuperCatLabel(sc, language) {
  if (!sc) return '';
  if (sc.label) return sc.label[language] || sc.label.fr || sc.key;
  const map = { fr: sc.labelFr, it: sc.labelIt, en: sc.labelEn };
  return map[language] || sc.labelFr || sc.key;
}

function InventoryPage() {
  const { currentLanguage: language, t } = useLanguage();
  const { can, user: authUser } = useAuth();
  // Who may see the purchase orders of an article (same rule as the Commandes page)
  const canSeeItemOrders = can('admin.view') || can('orders.view')
    || ['Magasinier', 'Laquage', 'Coordinateur-vitrage'].includes(authUser?.role);

  const [superCats, setSuperCats] = useState([]);
  const [activeSuperCat, setActiveSuperCat] = useState(null);
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [showAddItem, setShowAddItem] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [exporting, setExporting] = useState(false);
  const [takeOutModal, setTakeOutModal] = useState(null);
  const [takeOutQty, setTakeOutQty] = useState(1);
  const [takeOutNote, setTakeOutNote] = useState('');
  const [addInModal, setAddInModal] = useState(null);
  const [addInQty, setAddInQty] = useState(1);
  const [addInNote, setAddInNote] = useState('');
  const [showSuperCatMgr, setShowSuperCatMgr] = useState(false);
  const [orderRequestModal, setOrderRequestModal] = useState(null);
  const [ordersItem, setOrdersItem] = useState(null); // article whose purchase orders are shown

  const [suppliers, setSuppliers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const requestId = useRef(0);
  const sentinelRef = useRef(null);

  // Suppliers are only needed by the article form → loaded when it opens
  const suppliersLoaded = useRef(false);
  useEffect(() => {
    if (!(showAddItem || editingItem) || suppliersLoaded.current) return;
    suppliersLoaded.current = true;
    axios.get(`${API_URL}/fournisseurs`)
      .then(r => setSuppliers(r.data || []))
      .catch(() => { setSuppliers([]); suppliersLoaded.current = false; });
  }, [showAddItem, editingItem]);

  // Search runs on the server, 300 ms after the last key stroke
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(id);
  }, [searchTerm]);

  const isPoudre = activeSuperCat === 'poudre';

  const fetchSuperCats = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/super-categories`);
      const all = res.data && res.data.length ? res.data : DEFAULT_SUPER_CATS;
      const hasGlobalView = can('inventory.view') || can('admin.view');
      const hasAnySCView = all.some(sc => can(`inventory.${sc.key}.view`));
      let visible;
      if (can('admin.view')) visible = all;
      else if (hasAnySCView) visible = all.filter(sc => can(`inventory.${sc.key}.view`));
      else if (hasGlobalView) visible = all;
      else visible = [];
      setSuperCats(visible);
      if (visible.length > 0) {
        const keys = visible.map(sc => sc.key);
        setActiveSuperCat(prev => (prev && keys.includes(prev)) ? prev : keys[0]);
      } else { setActiveSuperCat(null); }
    } catch {
      setSuperCats(DEFAULT_SUPER_CATS);
      setActiveSuperCat(prev => prev || 'aluminium');
    }
  }, [can]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchCategories = useCallback(async () => {
    if (!activeSuperCat) return;
    try {
      const res = await axios.get(`${API_URL}/categories?superCategory=${activeSuperCat}`);
      setCategories(res.data);
      setSelectedCategory('all');
    } catch (e) { console.error(e); }
  }, [activeSuperCat]);

  const viewKey = `${activeSuperCat}|${selectedCategory}|${filter}|${debouncedSearch}`;

  // Load page 1 (reset) or the next page of the current view
  const fetchItems = useCallback(async ({ more = false } = {}) => {
    if (!activeSuperCat) return;
    const nextPage = more ? page + 1 : 1;
    const myRequest = ++requestId.current;

    if (more) setLoadingMore(true);
    else {
      const cached = inventoryViewCache.get(viewKey);
      if (cached) {
        // Show the last result for this view immediately, refresh it in the background
        setItems(cached.items); setTotal(cached.total); setPage(cached.page); setHasMore(cached.hasMore);
        setLoading(false);
      } else setLoading(true);
    }

    try {
      const params = { page: nextPage, limit: PAGE_SIZE, superCategory: activeSuperCat };
      if (selectedCategory !== 'all') params.categoryId = selectedCategory;
      if (FILTER_TO_STOCK[filter]) params.stock = FILTER_TO_STOCK[filter];
      if (debouncedSearch) params.q = debouncedSearch;
      const res = await axios.get(`${API_URL}/inventory`, { params });
      if (myRequest !== requestId.current) return; // a newer request (other filter / search) won

      const data = res.data || {};
      const newItems = more ? [...items, ...(data.items || [])] : (data.items || []);
      setItems(newItems);
      setTotal(data.total || 0);
      setPage(nextPage);
      setHasMore(!!data.hasMore);
      if (!more) inventoryViewCache.set(viewKey, { items: newItems, total: data.total || 0, page: 1, hasMore: !!data.hasMore });
    } catch (e) { console.error(e); }
    finally {
      if (myRequest === requestId.current) { setLoading(false); setLoadingMore(false); }
    }
  }, [activeSuperCat, selectedCategory, filter, debouncedSearch, page, items, viewKey]);

  // Reload page 1 whenever the view changes (super-category, category, filter, search)
  const fetchFirstPage = useRef(fetchItems);
  fetchFirstPage.current = fetchItems;
  useEffect(() => { fetchFirstPage.current(); }, [viewKey]);

  // Infinite scroll: next page when the bottom of the grid becomes visible
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loadingMore) fetchFirstPage.current({ more: true });
    }, { rootMargin: '600px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loading, loadingMore, items.length]);

  // After an edit, the cached views may be outdated
  const refreshItems = () => { inventoryViewCache.clear(); fetchItems(); };

  useEffect(() => { fetchSuperCats(); }, [fetchSuperCats]);
  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  const getStockStatus = (item) => {
    const total = item.quantity + (item.orderedQuantity || 0);
    if (total < item.threshold)
      return { color: '#fca5a5', bg: 'rgba(248,113,113,.12)', text: t('criticalStock'), className: 'status-critical', icon: <XCircle size={11} /> };
    if (item.quantity < item.threshold && total >= item.threshold)
      return { color: '#fcd34d', bg: 'rgba(251,191,36,.12)', text: t('warningStock'), className: 'status-warning', icon: <AlertTriangle size={11} /> };
    return { color: '#86efac', bg: 'rgba(74,222,128,.1)', text: t('inStock'), className: 'status-ok', icon: <CheckCircle2 size={11} /> };
  };

  const updateQuantity = async (itemId, amount, note = '') => {
    try {
      const res = await axios.patch(`${API_URL}/inventory/${itemId}/quantity`, { amount, note });
      setItems(items.map(i => i.id === itemId ? res.data : i));
      inventoryViewCache.clear();
    } catch { await dialog.alert(t('errorUpdating')); }
  };

  const handleMinusClick = (item) => { setTakeOutModal({ item }); setTakeOutQty(isPoudre ? '' : 1); setTakeOutNote(''); };
  const handlePlusClick = (item) => { setAddInModal({ item }); setAddInQty(isPoudre ? '' : 1); setAddInNote(''); };

  const handleTakeOutConfirm = async () => {
    if (!takeOutModal) return;
    const qty = parseFloat(takeOutQty);
    if (!qty || qty <= 0) return;
    await updateQuantity(takeOutModal.item.id, -qty, takeOutNote);
    setTakeOutModal(null);
  };

  const handleAddInConfirm = async () => {
    if (!addInModal) return;
    const qty = parseFloat(addInQty);
    if (!qty || qty <= 0) return;
    await updateQuantity(addInModal.item.id, qty, addInNote);
    setAddInModal(null);
  };

  const deleteItem = async (itemId) => {
    if (!(await dialog.confirm({ title: t('ivDeleteItemTitle'), message: t('deleteConfirmMessage'), danger: true, confirmLabel: t('deleteAction') }))) return;
    try {
      await axios.delete(`${API_URL}/inventory/${itemId}`);
      setItems(items.filter(i => i.id !== itemId));
      setTotal(n => Math.max(0, n - 1));
      inventoryViewCache.clear();
    } catch (e) { console.error(e); }
  };

  const deleteCategory = async (categoryId) => {
    if (!(await dialog.confirm({ title: t('ivDeleteCategoryTitle'), message: t('deleteCategoryConfirmMessage'), danger: true, confirmLabel: t('deleteAction') }))) return;
    try {
      await axios.delete(`${API_URL}/categories/${categoryId}`);
      fetchCategories();
    } catch (e) { console.error(e); }
  };

  // Search / filters are applied by the server (see fetchItems)
  const filteredItems = items;

  const exportToExcel = async () => {
    setExporting(true);
    try {
      // The page only holds what is on screen → fetch the full list for the export
      const res = await axios.get(`${API_URL}/inventory`, {
        params: { superCategory: activeSuperCat, ...(selectedCategory !== 'all' ? { categoryId: selectedCategory } : {}) },
      });
      const items = res.data || [];
      const wb = XLSX.utils.book_new();
      const cMap = new Map();
      cMap.set('no-category', { name: t('noCategory'), items: [] });
      categories.forEach(c => cMap.set(c.id, { name: c.name[language], items: [] }));
      items.forEach(item => {
        const cid = item.categoryId?.id || item.categoryId?._id || 'no-category';
        (cMap.get(cid) || cMap.get('no-category')).items.push(item);
      });
      cMap.forEach(cd => {
        if (!cd.items.length) return;
        const rows = cd.items.map(item => ({
          [t('designation')]: item.designation[language] || item.designation.fr,
          [t('quantity')]: item.quantity,
          [t('orderedQuantity')]: item.orderedQuantity || 0,
          [t('threshold')]: item.threshold,
          [t('status')]: getStockStatus(item).text,
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [{ wch: 40 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, ws, cd.name.substring(0, 31));
      });
      XLSX.writeFile(wb, `${t('ivExportFilePrefix')}_${activeSuperCat}_${new Date().toISOString().split('T')[0]}.xlsx`);
      dialog.toast(t('exportSuccess'));
    } catch { await dialog.alert(t('exportError')); }
    finally { setExporting(false); }
  };

  const currentSuperCat = superCats.find(s => s.key === activeSuperCat);
  const hasAnySCEdit = superCats.some(sc => can(`inventory.${sc.key}.edit`));
  const hasAnySCDelete = superCats.some(sc => can(`inventory.${sc.key}.delete`));
  const canEdit = activeSuperCat && (can(`inventory.${activeSuperCat}.edit`) || (!hasAnySCEdit && can('inventory.edit')));
  const canDelete = activeSuperCat && (can(`inventory.${activeSuperCat}.delete`) || (!hasAnySCDelete && can('inventory.delete')));
  const canView = activeSuperCat && superCats.some(sc => sc.key === activeSuperCat);
  const { user } = useAuth();
  const userRole = user?.role;
  const adminThing = userRole === 'Admin';
  const magThing = userRole === 'Admin' || userRole === 'Magasinier';

  if (!activeSuperCat) {
    return (
      <div className="inv-loading-screen">
        <div className="inv-loading-spinner" />
        <span>{t('loading')}</span>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="inv-access-denied">
        <Lock size={40} strokeWidth={1.5} />
        <h2>{t('accessDenied')}</h2>
      </div>
    );
  }

  return (
    <div className="inventory-app">

      {/* ── Super-category tabs ── */}
      <div className="super-cat-tabs">
        <div className="super-cat-tabs__inner">
          {superCats.map(sc => (
            <button
              key={sc.key}
              className={`super-cat-tab ${activeSuperCat === sc.key ? 'active' : ''}`}
              style={{ '--sc-color': sc.color }}
              onClick={() => { setActiveSuperCat(sc.key); setFilter('all'); setSearchTerm(''); }}
            >
              <span className="super-cat-tab__icon">{getSCIcon(sc.key)}</span>
              {getSuperCatLabel(sc, language)}
            </button>
          ))}
        </div>
        {can('admin.view') && (
          <button className="super-cat-settings-btn" onClick={() => setShowSuperCatMgr(true)} title={t('ivManageCategories')}>
            <Settings size={16} strokeWidth={2} />
          </button>
        )}
      </div>

      {/* ── Header ── */}
      <header className="inv-header">
        <div className="action-buttons">
          {magThing && (
            <button className="btn-outline" onClick={exportToExcel} disabled={exporting || items.length === 0}>
              <Sheet size={15} strokeWidth={2} />
              {exporting ? t('exporting') : t('exportExcel')}
            </button>
          )}
          {canEdit && (
            <button className="btn-outline btn-outline--primary" onClick={() => setShowAddItem(true)}>
              <PackagePlus size={14} strokeWidth={2} />
              {t('addNewItem')}
            </button>
          )}
        </div>
        <div className="inv-header__search">
          <Search size={14} className="inv-search-icon" />
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="inv-search-input"
          />
          {searchTerm && (
            <button className="inv-search-clear" onClick={() => setSearchTerm('')}>
              <XCircle size={14} />
            </button>
          )}
        </div>
      </header>

      {/* ── Controls ── */}
      <div className="controls">
        <div className="controls__top"></div>
        <div className="filter-buttons">
          <button
            className={`filter-btn ${filter === 'all' && selectedCategory === 'all' ? 'active' : ''}`}
            onClick={() => { setFilter('all'); setSelectedCategory('all'); }}
          >
            {t('showAll')}
          </button>
          <button
            className={`filter-btn filter-btn--alert ${filter === 'low-stock' ? 'active' : ''}`}
            onClick={() => setFilter(filter === 'low-stock' ? 'all' : 'low-stock')}
          >
            <AlertTriangle size={12} strokeWidth={2.5} />
            {t('lowStock')}
          </button>
          <button
            className={`filter-btn filter-btn--warning ${filter === 'alert-stock' ? 'active' : ''}`}
            onClick={() => setFilter(filter === 'alert-stock' ? 'all' : 'alert-stock')}
          >
            <AlertCircle size={12} strokeWidth={2.5} />
            {t('alertStock')}
          </button>
          <button
            className={`filter-btn filter-btn--ordered ${filter === 'ordered' ? 'active' : ''}`}
            onClick={() => setFilter(filter === 'ordered' ? 'all' : 'ordered')}
          >
            <ShoppingCart size={12} strokeWidth={2.5} />
            {t('ivOrdered')}
          </button>

          <div className="filter-divider" />

          {categories.map(cat => (
            <div key={cat.id} className="category-btn-wrapper">
              <button
                className={`filter-btn category-btn ${selectedCategory === cat.id ? 'active' : ''}`}
                onClick={() => setSelectedCategory(selectedCategory === cat.id ? 'all' : cat.id)}
              >
                <span className="category-dot" style={{ backgroundColor: cat.color }} />
                {cat.name[language]}
              </button>
              {(canEdit || canDelete) && (
                <div className="cat-inline-actions">
                  {canEdit && (
                    <button className="cat-inline-btn cat-inline-btn--edit" onClick={() => setEditingCategory(cat)} title={t('edit')}>
                      <Pencil size={12} strokeWidth={2.5} />
                    </button>
                  )}
                  {canDelete && (
                    <button className="cat-inline-btn cat-inline-btn--delete" onClick={() => deleteCategory(cat.id)} title={t('delete')}>
                      <Trash2 size={13} strokeWidth={2.5} />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {canEdit && (
            <button className="filter-btn filter-btn--add" onClick={() => setShowAddCategory(true)}>
              <Plus size={12} strokeWidth={2.5} />
              {t('addCategory')}
            </button>
          )}
        </div>
      </div>

      {/* ── Grid ── */}
      {loading ? (
        <div className="inv-loading">
          <div className="inv-loading-spinner" />
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="inv-empty">
          <Package size={40} strokeWidth={1} />
          <p>{t('noItems')}</p>
        </div>
      ) : (
        <>
        <div className="inv-count">{t(total > 1 ? 'ivArticleCountMany' : 'ivArticleCountOne', { shown: filteredItems.length, total })}</div>
        <div className="items-grid">
          {filteredItems.map(item => (
            <ItemCard
              key={item.id}
              item={item}
              language={language}
              isPoudre={isPoudre}
              onMinusClick={handleMinusClick}
              onPlusClick={handlePlusClick}
              onEdit={canEdit ? (i) => setEditingItem(i) : null}
              onDelete={canDelete ? deleteItem : null}
              onOrderRequest={can('admin.view') ? (i) => setOrderRequestModal({ item: i }) : null}
              onShowOrders={canSeeItemOrders ? (i) => setOrdersItem(i) : null}
              getStockStatus={getStockStatus}
              t={t}
            />
          ))}
        </div>
        {hasMore && (
          <div ref={sentinelRef} className="inv-load-more">
            <button className="btn-outline" onClick={() => fetchItems({ more: true })} disabled={loadingMore}>
              {loadingMore ? t('loadingShort') : t('ivShowMore', { n: total - filteredItems.length })}
            </button>
          </div>
        )}
        </>
      )}

      {/* ── Modals ── */}
      {(showAddCategory || editingCategory) && (
        <CategoryModal
          language={language}
          superCategory={activeSuperCat}
          category={editingCategory}
          t={t}
          onClose={() => { setShowAddCategory(false); setEditingCategory(null); fetchCategories(); }}
          onSave={() => { setShowAddCategory(false); setEditingCategory(null); fetchCategories(); }}
        />
      )}

      {(showAddItem || editingItem) && (
        <ItemModal
          language={language}
          categories={categories}
          item={editingItem}
          suppliers={suppliers}
          superCategory={activeSuperCat}
          isPoudre={isPoudre}
          t={t}
          onClose={() => { setShowAddItem(false); setEditingItem(null); }}
          onSave={() => { setShowAddItem(false); setEditingItem(null); refreshItems(); }}
        />
      )}

      {takeOutModal && (
        <QuantityModal
          title={t('takeOutTitle')}
          item={takeOutModal.item}
          language={language}
          isPoudre={isPoudre}
          qty={takeOutQty}
          note={takeOutNote}
          onQtyChange={setTakeOutQty}
          onNoteChange={setTakeOutNote}
          onClose={() => setTakeOutModal(null)}
          onConfirm={handleTakeOutConfirm}
          maxQty={takeOutModal.item.quantity}
          confirmLabel={t('takeOutConfirm')}
          confirmStyle="danger"
          t={t}
          icon={<Minus size={14} />}
        />
      )}

      {addInModal && (
        <QuantityModal
          title={t('addInTitle')}
          item={addInModal.item}
          language={language}
          isPoudre={isPoudre}
          qty={addInQty}
          note={addInNote}
          onQtyChange={setAddInQty}
          onNoteChange={setAddInNote}
          onClose={() => setAddInModal(null)}
          onConfirm={handleAddInConfirm}
          confirmLabel={t('addInConfirm')}
          confirmStyle="success"
          t={t}
          icon={<Plus size={14} />}
        />
      )}

      {ordersItem && (
        <ItemOrdersModal item={ordersItem} language={language} onClose={() => setOrdersItem(null)} />
      )}

      {orderRequestModal && (
        <OrderRequestModal
          item={orderRequestModal.item}
          language={language}
          t={t}
          onClose={() => setOrderRequestModal(null)}
          onSent={() => setOrderRequestModal(null)}
        />
      )}

      {showSuperCatMgr && (
        <SuperCategoryManager
          superCats={superCats}
          language={language}
          t={t}
          onClose={() => { setShowSuperCatMgr(false); fetchSuperCats(); }}
        />
      )}
    </div>
  );
}

/* ── Image Preview Modal ────────────────────────────────────── */
/* ── Image Preview Modal ────────────────────────────────────── */
function ImagePreviewModal({ src, alt, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return ReactDOM.createPortal(
    <div className="modal-overlay image-preview-overlay" onClick={onClose}>
      <div className="image-preview-modal" onClick={e => e.stopPropagation()}>
        <button className="image-preview-close" onClick={onClose}>
          <XCircle size={22} strokeWidth={2} />
        </button>
        <img src={src} alt={alt} className="image-preview-img" />
      </div>
    </div>,
    document.body
  );
}

/* ── Item Card ──────────────────────────────────────────────── */
function ItemCard({ item, language, isPoudre, onMinusClick, onPlusClick, onEdit, onDelete, onOrderRequest, onShowOrders, getStockStatus, t }) {
  const status = getStockStatus(item);
  const formatQty = (val) => isPoudre ? fmt(val) : Math.floor(val);
  const { user } = useAuth();
  const [previewImage, setPreviewImage] = useState(null);

  return (
    <div className={`item-card ${status.className}`}>
      <div
        className={`item-image${item.image ? ' item-image--zoomable' : ''}`}
        onClick={() => item.image && setPreviewImage(item.image)}
      >
        {item.image
          ? <img src={item.image} alt={item.designation[language]} loading="lazy" decoding="async" />
          : <div className="no-image"><Package size={32} strokeWidth={1} /></div>
        }
        {item.image && (
          <div className="image-zoom-overlay">
            <ZoomIn size={18} strokeWidth={2} />
          </div>
        )}
        {item.categoryId && (
          <div className="item-category-badge" style={{ '--cat-color': item.categoryId.color }}>
            {item.categoryId.name[language]}
          </div>
        )}
      </div>

      <div className="item-content">
        <h3>{item.designation[language] || item.designation.fr}</h3>

        <div className="quantity-section">
          <div className="qty-col">
            <span className="qty-label">{t('quantity')}</span>
            <span className={`qty-value ${item.quantity < item.threshold ? 'qty-value--low' : ''}`}>
              {formatQty(item.quantity)}
            </span>
          </div>
          <div className="qty-col">
            <span className="qty-label">{t('orderedQuantity')}</span>
            <span className="qty-value">{formatQty(item.orderedQuantity || 0)}</span>
          </div>
          <div className="qty-col">
            <span className="qty-label">{t('threshold')}</span>
            <span className="qty-value qty-value--muted">{formatQty(item.threshold)}</span>
          </div>
        </div>

        <div className={`status-pill status-pill--${status.className}`}>
          {status.icon}
          {status.text}
        </div>

        <div className="quantity-controls">
          <button
            className="qty-btn qty-btn--minus"
            onClick={() => onMinusClick(item)}
            disabled={item.quantity === 0}
            title={t('takeOutTitle')}
          >
            <Minus size={14} strokeWidth={2.5} />
          </button>
          <button
            className="qty-btn qty-btn--plus"
            onClick={() => onPlusClick(item)}
            title={t('addInTitle')}
          >
            <Plus size={14} strokeWidth={2.5} />
          </button>
          {onOrderRequest && (
            <button
              className="qty-btn qty-btn--order"
              onClick={() => onOrderRequest(item)}
              title={t('ivRequestOrder')}
            >
              <ShoppingCart size={14} strokeWidth={2.5} />
            </button>
          )}
        </div>

        {onShowOrders && (
          <button className="item-orders-btn" onClick={() => onShowOrders(item)} title={t('ivSeeItemOrders')}>
            <ClipboardList size={13} strokeWidth={2.5} />
            {t('ivPurchaseOrders')}
          </button>
        )}

        {(onEdit || onDelete) && (
          <div className="item-actions">
            {onEdit && (
              <button className="item-action-btn item-action-btn--edit" onClick={() => onEdit(item)}>
                <Pencil size={12} strokeWidth={2.5} />
                {t('edit')}
              </button>
            )}
            {onDelete && (
              <button className="item-action-btn item-action-btn--delete" onClick={() => onDelete(item.id)}>
                <Trash2 size={12} strokeWidth={2.5} />
                {t('delete')}
              </button>
            )}
          </div>
        )}
      </div>

      {previewImage && (
        <ImagePreviewModal
          src={previewImage}
          alt={item.designation[language] || item.designation.fr}
          onClose={() => setPreviewImage(null)}
        />
      )}
    </div>
  );
}

/* ── Shared Quantity Modal (take-out & add-in) ─────────────── */
function QuantityModal({ title, item, language, isPoudre, qty, note, onQtyChange, onNoteChange,
  onClose, onConfirm, maxQty, confirmLabel, confirmStyle, t, icon }) {

  const isDisabled = !qty || parseFloat(qty) <= 0 || (maxQty !== undefined && parseFloat(qty) > maxQty);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-head__icon">{icon}</span>
          <h2>{title}</h2>
        </div>
        <div className="modal-item-name">
          <strong>{item.designation[language]}</strong>
          <span className="modal-item-stock">{t('takeOutAvailable')}: {fmt(item.quantity)}</span>
        </div>
        <div className="form-group">
          <label>{t('takeOutQtyLabel')}</label>
          <input
            type="number"
            min={isPoudre ? 0.01 : 1}
            max={maxQty}
            step={isPoudre ? 0.01 : 1}
            value={qty}
            onChange={e => onQtyChange(e.target.value)}
            autoFocus
            className="qty-input"
          />
        </div>
        <div className="form-group">
          <label>{t('takeOutNoteLabel')}</label>
          <textarea
            placeholder={t('takeOutPlaceholder')}
            value={note}
            onChange={e => onNoteChange(e.target.value)}
            rows={3}
          />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-cancel" onClick={onClose}>{t('takeOutCancel')}</button>
          <button
            type="button"
            className={`btn-confirm btn-confirm--${confirmStyle}`}
            onClick={onConfirm}
            disabled={isDisabled}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Order Request Modal ──────────────────────────────────── */
function OrderRequestModal({ item, language, t, onClose, onSent }) {
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const handleSend = async () => {
    const q = parseFloat(qty);
    if (!q || q <= 0) { setError(t('ivEnterValidQty')); return; }
    setSending(true); setError('');
    try {
      await axios.post(`${API_URL}/purchase-requests`, {
        itemId: item.id,
        itemName: item.designation[language] || item.designation.fr,
        itemImage: item.image || '',
        quantity: q,
        note: note.trim(),
      });
      onSent();
    } catch (e) {
      setError(e.response?.data?.error || t('ivSendError'));
    } finally { setSending(false); }
  };

  const designation = item.designation[language] || item.designation.fr;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-head__icon modal-head__icon--warning">
            <ShoppingCart size={14} />
          </span>
          <h2>{t('ivOrderRequestTitle')}</h2>
        </div>

        <div className="modal-item-name">
          {item.image && (
            <img src={item.image} alt={designation} className="inv-modal-thumb" />
          )}
          <div>
            <div className="inv-modal-item-title">{designation}</div>
            <span className="modal-item-stock">
              {t('ivStockValue', { n: item.quantity })}{item.threshold > 0 ? t('ivThresholdSuffix', { n: item.threshold }) : ''}
            </span>
          </div>
        </div>

        <div className="form-group">
          <label>{t('ivQtyToOrder')}</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            placeholder={t('ivQtyToOrderPlaceholder')}
            value={qty}
            onChange={e => setQty(e.target.value)}
            autoFocus
            style={{ width: '100%' }}
          />
        </div>

        <div className="form-group">
          <label>{t('ivNoteOptional')}</label>
          <textarea
            rows={3}
            placeholder={t('ivNotePlaceholder')}
            value={note}
            onChange={e => setNote(e.target.value)}
          />
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="inv-role-note">
          {t('ivVisibleByRoleBefore')}<strong>ACHAT</strong>{t('ivVisibleByRoleAfter')}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-cancel" onClick={onClose}>{t('cancel')}</button>
          <button
            type="button"
            className="btn-confirm btn-confirm--order"
            disabled={sending || !qty}
            onClick={handleSend}
          >
            <ShoppingCart size={14} />
            {sending ? '…' : t('ivSendRequest')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Category Modal ────────────────────────────────────────── */
function CategoryModal({ language, superCategory, category, t, onClose, onSave }) {
  const isEdit = !!category;
  const [formData, setFormData] = useState(isEdit
    ? { name: { ...category.name }, color: category.color }
    : { name: { it: '', fr: '', en: '' }, color: '#3b82f6' }
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (isEdit) await axios.put(`${API_URL}/categories/${category.id}`, { ...formData, superCategory });
      else await axios.post(`${API_URL}/categories`, { ...formData, superCategory });
      onSave();
    } catch { await dialog.alert(t('ivSaveError')); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-head__icon"><Tag size={14} /></span>
          <h2>{isEdit ? t('editCategory') : t('addCategory')}</h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group"><label>{t('ivNameFr')}</label><input type="text" required value={formData.name.fr} onChange={e => setFormData({ ...formData, name: { ...formData.name, fr: e.target.value } })} /></div>
          <div className="form-group"><label>{t('ivNameIt')}</label><input type="text" required value={formData.name.it} onChange={e => setFormData({ ...formData, name: { ...formData.name, it: e.target.value } })} /></div>
          <div className="form-group"><label>{t('ivNameEn')}</label><input type="text" required value={formData.name.en} onChange={e => setFormData({ ...formData, name: { ...formData.name, en: e.target.value } })} /></div>
          <div className="form-group"><label>{t('superCategoryColor')}</label><input type="color" value={formData.color} onChange={e => setFormData({ ...formData, color: e.target.value })} /></div>
          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>{t('cancel')}</button>
            <button type="submit" className="btn-confirm btn-confirm--primary">{isEdit ? t('update') : t('create')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Item Modal ────────────────────────────────────────────── */
/* ── Supplier Codes Editor (one code per supplier) ─────────── */
function SupplierCodesEditor({ suppliers, value, onChange, t }) {
  const rows = value || [];
  const used = new Set(rows.map(r => r.supplierId));
  const add = () => onChange([...rows, { supplierId: '', code: '' }]);
  const upd = (i, k, v) => onChange(rows.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  const del = (i) => onChange(rows.filter((_, idx) => idx !== i));

  return (
    <div className="form-group">
      <label>{t('ivSupplierCodes')}</label>
      {suppliers.length === 0 && (
        <p className="inv-form-hint inv-form-hint--warning">
          {t('ivNoSupplierAvailable')}
        </p>
      )}
      {rows.length === 0 && (
        <p className="inv-form-hint">
          {t('ivNoSupplierCodes')}
        </p>
      )}
      {rows.map((r, i) => (
        <div key={i} className="inv-supplier-row">
          <select value={r.supplierId} onChange={e => upd(i, 'supplierId', e.target.value)} required>
            <option value="">{t('ivSupplierOption')}</option>
            {suppliers.map(s => (
              <option key={s.id} value={s.id} disabled={used.has(s.id) && r.supplierId !== s.id}>{s.name}</option>
            ))}
          </select>
          <input
            placeholder={t('ivSupplierCodePlaceholder')}
            value={r.code}
            onChange={e => upd(i, 'code', e.target.value)}
          />
          <button type="button" className="btn-remove-line" onClick={() => del(i)}>×</button>
        </div>
      ))}
      <button type="button" className="btn-add-line" onClick={add}>
        {t('ivAddSupplierCode')}
      </button>
    </div>
  );
}

/* ── Item Modal ────────────────────────────────────────────── */
function ItemModal({ language, categories, suppliers = [], item, superCategory, isPoudre, t, onClose, onSave }) {
  const [formData, setFormData] = useState(item ? {
    image: item.image || '',
    designation: { ...item.designation },
    codeInterne: item.codeInterne || '',
    supplierCodes: (item.supplierCodes || []).map(sc => ({
      supplierId: sc.supplierId?._id || sc.supplierId?.id || sc.supplierId || '',
      code: sc.code || '',
    })),
    quantity: item.quantity,
    orderedQuantity: item.orderedQuantity || 0,
    threshold: item.threshold,
    categoryId: item.categoryId?.id || item.categoryId?._id || '',
    superCategory: item.superCategory || superCategory,
  } : {
    image: '', designation: { it: '', fr: '', en: '' },
    codeInterne: '', supplierCodes: [],
    quantity: 0, orderedQuantity: 0, threshold: 0, categoryId: '', superCategory,
  });

  const parseQty = (val) => isPoudre ? parseFloat(val) || 0 : parseInt(val, 10) || 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...formData,
      supplierCodes: (formData.supplierCodes || []).filter(s => s.supplierId),
    };
    try {
      if (item) await axios.put(`${API_URL}/inventory/${item.id}`, payload);
      else await axios.post(`${API_URL}/inventory`, payload);
      onSave();
    } catch { await dialog.alert(t('ivSaveError')); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--large" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-head__icon">{item ? <Pencil size={14} /> : <PackagePlus size={14} />}</span>
          <h2>{item ? t('editItem') : t('addNewItem')}</h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group"><label>{t('imageUrl')}</label><input type="url" value={formData.image} onChange={e => setFormData({ ...formData, image: e.target.value })} /></div>
          <div className="form-group"><label>{t('ivDesignationFr')}</label><input type="text" required value={formData.designation.fr} onChange={e => setFormData({ ...formData, designation: { ...formData.designation, fr: e.target.value } })} /></div>
          <div className="form-group"><label>{t('ivDesignationIt')}</label><input type="text" required value={formData.designation.it} onChange={e => setFormData({ ...formData, designation: { ...formData.designation, it: e.target.value } })} /></div>
          <div className="form-group"><label>{t('ivDesignationEn')}</label><input type="text" required value={formData.designation.en} onChange={e => setFormData({ ...formData, designation: { ...formData.designation, en: e.target.value } })} /></div>

          <div className="form-group">
            <label>{t('ivInternalCode')}</label>
            <input type="text" placeholder={t('ivInternalCodePlaceholder')} value={formData.codeInterne} onChange={e => setFormData({ ...formData, codeInterne: e.target.value })} />
          </div>

          <SupplierCodesEditor
            suppliers={suppliers}
            value={formData.supplierCodes}
            onChange={(v) => setFormData({ ...formData, supplierCodes: v })}
            t={t}
          />

          <div className="form-group">
            <label>{t('categoryLabel')}</label>
            <select value={formData.categoryId} onChange={e => setFormData({ ...formData, categoryId: e.target.value })}>
              <option value="">{t('noCategory')}</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name[language]}</option>)}
            </select>
          </div>
          <div className="form-row-3">
            <div className="form-group">
              <label>{t('quantityLabel')}</label>
              <input type="number" required min="0" step={isPoudre ? '0.01' : '1'} placeholder={isPoudre ? '145.23' : '100'} value={formData.quantity} onChange={e => setFormData({ ...formData, quantity: parseQty(e.target.value) })} />
            </div>
            <div className="form-group">
              <label>{t('orderedQuantityLabel')}</label>
              {/* Read-only: computed by the server from the sent purchase orders (not editable by hand) */}
              <input type="number" value={formData.orderedQuantity} readOnly disabled
                title={t('ivOrderedAutoTitle')} />
              <small className="inv-form-hint">{t('ivOrderedAutoHint')}</small>
            </div>
            <div className="form-group">
              <label>{t('thresholdLabel')}</label>
              <input type="number" required min="0" step={isPoudre ? '0.01' : '1'} placeholder={isPoudre ? '10.50' : '20'} value={formData.threshold} onChange={e => setFormData({ ...formData, threshold: parseQty(e.target.value) })} />
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>{t('cancel')}</button>
            <button type="submit" className="btn-confirm btn-confirm--primary">{item ? t('update') : t('create')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Super-Category Manager ────────────────────────────────── */
/* ── Super-Category Manager ────────────────────────────────── */
function SuperCategoryManager({ superCats, language, t, onClose }) {
  const [list, setList] = useState(superCats);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ key: '', labelFr: '', labelIt: '', labelEn: '', color: '#6366f1' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [reordering, setReordering] = useState(false);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.key || !form.labelFr) { setError(t('ivKeyAndNameRequired')); return; }
    if (!/^[a-z0-9_]+$/.test(form.key)) { setError(t('ivKeyFormat')); return; }
    setSaving(true);
    try {
      const res = await axios.post(`${API_URL}/super-categories`, {
        key: form.key,
        label: { fr: form.labelFr, it: form.labelIt || form.labelFr, en: form.labelEn || form.labelFr },
        color: form.color,
      });
      setList(prev => [...prev, res.data]);
      setAdding(false);
      setForm({ key: '', labelFr: '', labelIt: '', labelEn: '', color: '#6366f1' });
      setError('');
    } catch (err) { setError(err.response?.data?.error || t('ivError')); }
    finally { setSaving(false); }
  };

  const handleDelete = async (key) => {
    if (!(await dialog.confirm({ title: t('ivDeleteSuperCatTitle'), message: t('deleteSuperCatConfirm'), danger: true, confirmLabel: t('deleteAction') }))) return;
    try {
      await axios.delete(`${API_URL}/super-categories/${key}`);
      setList(prev => prev.filter(s => s.key !== key));
    } catch (err) { await dialog.alert(err.response?.data?.error || t('ivError')); }
  };

  const move = async (idx, dir) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= list.length) return;
    const previous = list;
    const reordered = [...list];
    [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];
    setList(reordered); // optimistic update
    setReordering(true);
    try {
      await axios.put(`${API_URL}/super-categories-reorder`, {
        orderedKeys: reordered.map(sc => sc.key),
      });
    } catch (err) {
      await dialog.alert(err.response?.data?.error || t('ivReorderError'));
      setList(previous); // revert on failure
    } finally {
      setReordering(false);
    }
  };

  const SYSTEM_KEYS = ['aluminium', 'verre', 'accessoires', 'poudre'];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--large" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-head__icon"><Settings size={14} /></span>
          <h2>{t('manageSuperCats')}</h2>
        </div>

        <div className="supercat-list">
          {list.map((sc, idx) => (
            <div key={sc.key} className="supercat-row">
              <div className="supercat-move">
                <button
                  type="button"
                  className="supercat-move__btn"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0 || reordering}
                  title={t('ivMoveUp')}
                ><ChevronUp size={14} strokeWidth={2.5} /></button>
                <button
                  type="button"
                  className="supercat-move__btn"
                  onClick={() => move(idx, 1)}
                  disabled={idx === list.length - 1 || reordering}
                  title={t('ivMoveDown')}
                ><ChevronDown size={14} strokeWidth={2.5} /></button>
              </div>
              <span className="supercat-icon">{getSCIcon(sc.key)}</span>
              <span className="supercat-color-dot" style={{ background: sc.color }} />
              <span className="supercat-label">{getSuperCatLabel(sc, language)}</span>
              <code className="supercat-key">{sc.key}</code>
              <button
                className="supercat-delete-btn"
                onClick={() => handleDelete(sc.key)}
                disabled={SYSTEM_KEYS.includes(sc.key)}
                title={SYSTEM_KEYS.includes(sc.key) ? t('ivSystemCategory') : t('delete')}
              >
                <Trash2 size={13} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>

        {!adding ? (
          <button className="btn-outline supercat-add-btn" onClick={() => setAdding(true)}>
            <Plus size={14} />
            {t('addSuperCategory')}
          </button>
        ) : (
          <form onSubmit={handleAdd} className="supercat-add-form">
            <div className="form-grid-2">
              <div className="form-group">
                <label>{t('superCategoryKey')} *</label>
                <input type="text" placeholder={t('ivKeyPlaceholder')} value={form.key} onChange={e => setForm(f => ({ ...f, key: e.target.value.toLowerCase().replace(/\s/g, '_') }))} required />
              </div>
              <div className="form-group">
                <label>{t('superCategoryColor')}</label>
                <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>{t('ivNameFrRequired')}</label>
                <input type="text" placeholder="Composite" value={form.labelFr} onChange={e => setForm(f => ({ ...f, labelFr: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label>{t('ivNameIt')}</label>
                <input type="text" placeholder="Composito" value={form.labelIt} onChange={e => setForm(f => ({ ...f, labelIt: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>{t('ivNameEn')}</label>
                <input type="text" placeholder="Composite" value={form.labelEn} onChange={e => setForm(f => ({ ...f, labelEn: e.target.value }))} />
              </div>
            </div>
            {error && <div className="form-error">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="btn-cancel" onClick={() => { setAdding(false); setError(''); }}>{t('cancel')}</button>
              <button type="submit" className="btn-confirm btn-confirm--primary" disabled={saving}>{saving ? '…' : t('create')}</button>
            </div>
          </form>
        )}

        <div className="modal-actions supercat-footer">
          <button className="btn-cancel" onClick={onClose}>{t('close')}</button>
        </div>
      </div>
    </div>
  );
}

export default InventoryPage;