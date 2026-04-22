import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import {
  Layers, GlassWater, Wrench, FlaskConical, Settings, Paintbrush, MirrorRectangular,
  Search, AlertTriangle, Plus, Minus, Pencil, Trash2,
  FileDown, PackagePlus, Package, ChevronRight, Tag,
  CheckCircle2, XCircle, Clock, Lock, ShoppingCart, Sheet,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import './InventoryPage.css';

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

function getSuperCatLabel(sc, language) {
  if (!sc) return '';
  if (sc.label) return sc.label[language] || sc.label.fr || sc.key;
  const map = { fr: sc.labelFr, it: sc.labelIt, en: sc.labelEn };
  return map[language] || sc.labelFr || sc.key;
}

function InventoryPage() {
  const { currentLanguage: language, t } = useLanguage();
  const { can } = useAuth();

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

  const fetchItems = useCallback(async () => {
    if (!activeSuperCat) return;
    setLoading(true);
    try {
      let url;
      if (filter === 'low-stock') {
        url = `${API_URL}/inventory/filter/low-stock`;
      } else if (selectedCategory !== 'all') {
        url = `${API_URL}/inventory?categoryId=${selectedCategory}&superCategory=${activeSuperCat}`;
      } else {
        url = `${API_URL}/inventory?superCategory=${activeSuperCat}`;
      }
      const res = await axios.get(url);
      let data = res.data;
      if (filter === 'low-stock') {
        data = data.filter(i => (i.superCategory || 'aluminium') === activeSuperCat);
        if (selectedCategory !== 'all')
          data = data.filter(i => i.categoryId?.id === selectedCategory || i.categoryId?._id === selectedCategory);
      }
      setItems(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [activeSuperCat, selectedCategory, filter]);

  useEffect(() => { fetchSuperCats(); }, [fetchSuperCats]);
  useEffect(() => { fetchCategories(); }, [fetchCategories]);
  useEffect(() => { fetchItems(); }, [fetchItems]);

  const getStockStatus = (item) => {
    const total = item.quantity + (item.orderedQuantity || 0);
    if (total < item.threshold)
      return { color: '#dc2626', bg: '#fef2f2', text: t('criticalStock'), className: 'status-critical', icon: <XCircle size={11} /> };
    if (item.quantity < item.threshold && total >= item.threshold)
      return { color: '#d97706', bg: '#fffbeb', text: t('warningStock'), className: 'status-warning', icon: <AlertTriangle size={11} /> };
    return { color: '#16a34a', bg: '#f0fdf4', text: t('inStock'), className: 'status-ok', icon: <CheckCircle2 size={11} /> };
  };

  const updateQuantity = async (itemId, amount, note = '') => {
    try {
      const res = await axios.patch(`${API_URL}/inventory/${itemId}/quantity`, { amount, note });
      setItems(items.map(i => i.id === itemId ? res.data : i));
    } catch { alert(t('errorUpdating') || 'Erreur de mise à jour'); }
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
    if (!window.confirm(t('deleteConfirmMessage'))) return;
    try {
      await axios.delete(`${API_URL}/inventory/${itemId}`);
      setItems(items.filter(i => i.id !== itemId));
    } catch (e) { console.error(e); }
  };

  const deleteCategory = async (categoryId) => {
    if (!window.confirm(t('deleteCategoryConfirmMessage'))) return;
    try {
      await axios.delete(`${API_URL}/categories/${categoryId}`);
      fetchCategories();
    } catch (e) { console.error(e); }
  };

  const filteredItems = items.filter(item => {
    if (!searchTerm) return true;
    const d = item.designation[language] || item.designation.fr || '';
    return d.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const exportToExcel = () => {
    setExporting(true);
    try {
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
      XLSX.writeFile(wb, `inventaire_${activeSuperCat}_${new Date().toISOString().split('T')[0]}.xlsx`);
      alert(t('exportSuccess'));
    } catch { alert(t('exportError')); }
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
        <h2>{t('accessDenied') || 'Accès refusé'}</h2>
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
          <button className="super-cat-settings-btn" onClick={() => setShowSuperCatMgr(true)} title="Manage categories">
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
            <button className="btn-outline" onClick={() => setShowAddItem(true)}>
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
        <div className="controls__top">

        </div>
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
              getStockStatus={getStockStatus}
              t={t}
            />
          ))}
        </div>
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
          superCategory={activeSuperCat}
          isPoudre={isPoudre}
          t={t}
          onClose={() => { setShowAddItem(false); setEditingItem(null); }}
          onSave={() => { setShowAddItem(false); setEditingItem(null); fetchItems(); }}
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
          title={t('addInTitle') || 'Ajouter au stock'}
          item={addInModal.item}
          language={language}
          isPoudre={isPoudre}
          qty={addInQty}
          note={addInNote}
          onQtyChange={setAddInQty}
          onNoteChange={setAddInNote}
          onClose={() => setAddInModal(null)}
          onConfirm={handleAddInConfirm}
          confirmLabel={t('addInConfirm') || 'Confirmer'}
          confirmStyle="success"
          t={t}
          icon={<Plus size={14} />}
        />
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

/* ── Item Card ──────────────────────────────────────────────── */
function ItemCard({ item, language, isPoudre, onMinusClick, onPlusClick, onEdit, onDelete, onOrderRequest, getStockStatus, t }) {
  const status = getStockStatus(item);
  const formatQty = (val) => isPoudre ? fmt(val) : Math.floor(val);
  const { user } = useAuth();
  const userRole = user?.role;
  const adminThing = userRole === 'Admin';
  return (
    <div className={`item-card ${status.className}`}>
      <div className="item-image">
        {item.image
          ? <img src={item.image} alt={item.designation[language]} />
          : <div className="no-image"><Package size={32} strokeWidth={1} /></div>
        }
        {item.categoryId && (
          <div className="item-category-badge" style={{ backgroundColor: item.categoryId.color }}>
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

        <div className="status-pill" style={{ color: status.color, backgroundColor: status.bg }}>
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
            title={t('addInTitle') || 'Ajouter'}
          >
            <Plus size={14} strokeWidth={2.5} />
          </button>
          {onOrderRequest && (
            <button
              className="qty-btn qty-btn--order"
              onClick={() => onOrderRequest(item)}
              title="Demander une commande"
            >
              <ShoppingCart size={14} strokeWidth={2.5} />
            </button>
          )}
        </div>




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

/* ── Order Request Modal (admin only) ──────────────────────────────
   Sends a purchase request — does NOT touch inventory stock.
   ACHAT role sees it in Orders page and marks it as ordered.
   Admin gets a bell notification when ACHAT processes it.
────────────────────────────────────────────────────────────────── */
function OrderRequestModal({ item, language, t, onClose, onSent }) {
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const handleSend = async () => {
    const q = parseFloat(qty);
    if (!q || q <= 0) { setError('Veuillez entrer une quantité valide.'); return; }
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
      setError(e.response?.data?.error || "Erreur lors de l'envoi.");
    } finally { setSending(false); }
  };

  const designation = item.designation[language] || item.designation.fr;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-head__icon" style={{ background: '#f59e0b' }}>
            <ShoppingCart size={14} />
          </span>
          <h2>Demande de commande</h2>
        </div>

        <div className="modal-item-name">
          {item.image && (
            <img src={item.image} alt={designation}
              style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 6, border: '1px solid #e8e8e8', background: '#fff' }} />
          )}
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#111' }}>{designation}</div>
            <span className="modal-item-stock">
              Stock : {item.quantity}{item.threshold > 0 ? ` · Seuil : ${item.threshold}` : ''}
            </span>
          </div>
        </div>

        <div className="form-group">
          <label>Quantité à commander *</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="ex: 50"
            value={qty}
            onChange={e => setQty(e.target.value)}
            autoFocus
            className="qty-input"
            style={{ width: '100%' }}
          />
        </div>

        <div className="form-group">
          <label>Note / précision (optionnel)</label>
          <textarea
            rows={3}
            placeholder="Ex: Priorité urgente, RAL 9010, fournisseur Technal…"
            value={note}
            onChange={e => setNote(e.target.value)}
          />
        </div>

        {error && <div className="form-error">{error}</div>}

        <div style={{ fontSize: 11, color: '#92400e', marginBottom: 12, padding: '7px 10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
          Visible par le rôle <strong>ACHAT</strong> dans les commandes. Le stock ne sera pas modifié.
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-cancel" onClick={onClose}>{t('cancel') || 'Annuler'}</button>
          <button
            type="button"
            className="btn-confirm btn-confirm--primary"
            disabled={sending || !qty}
            onClick={handleSend}
            style={{ background: '#f59e0b', borderColor: '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: 7 }}
          >
            <ShoppingCart size={14} />
            {sending ? '…' : 'Envoyer la demande'}
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
    } catch { alert('Erreur lors de la sauvegarde'); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-head__icon"><Tag size={14} /></span>
          <h2>{isEdit ? t('editCategory') : t('addCategory')}</h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group"><label>Nom (Français)</label><input type="text" required value={formData.name.fr} onChange={e => setFormData({ ...formData, name: { ...formData.name, fr: e.target.value } })} /></div>
          <div className="form-group"><label>Nome (Italiano)</label><input type="text" required value={formData.name.it} onChange={e => setFormData({ ...formData, name: { ...formData.name, it: e.target.value } })} /></div>
          <div className="form-group"><label>Name (English)</label><input type="text" required value={formData.name.en} onChange={e => setFormData({ ...formData, name: { ...formData.name, en: e.target.value } })} /></div>
          <div className="form-group"><label>{t('superCategoryColor') || 'Couleur'}</label><input type="color" value={formData.color} onChange={e => setFormData({ ...formData, color: e.target.value })} /></div>
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
function ItemModal({ language, categories, item, superCategory, isPoudre, t, onClose, onSave }) {
  const [formData, setFormData] = useState(item ? {
    image: item.image || '',
    designation: { ...item.designation },
    quantity: item.quantity,
    orderedQuantity: item.orderedQuantity || 0,
    threshold: item.threshold,
    categoryId: item.categoryId?.id || item.categoryId?._id || '',
    superCategory: item.superCategory || superCategory,
  } : {
    image: '', designation: { it: '', fr: '', en: '' },
    quantity: 0, orderedQuantity: 0, threshold: 0, categoryId: '', superCategory,
  });

  const parseQty = (val) => isPoudre ? parseFloat(val) || 0 : parseInt(val, 10) || 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (item) await axios.put(`${API_URL}/inventory/${item.id}`, formData);
      else await axios.post(`${API_URL}/inventory`, formData);
      onSave();
    } catch { alert('Erreur lors de la sauvegarde'); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--large" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{item ? t('editItem') : t('addNewItem')}</h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group"><label>{t('imageUrl')}</label><input type="url" value={formData.image} onChange={e => setFormData({ ...formData, image: e.target.value })} /></div>
          <div className="form-group"><label>Désignation (Français)</label><input type="text" required value={formData.designation.fr} onChange={e => setFormData({ ...formData, designation: { ...formData.designation, fr: e.target.value } })} /></div>
          <div className="form-group"><label>Designazione (Italiano)</label><input type="text" required value={formData.designation.it} onChange={e => setFormData({ ...formData, designation: { ...formData.designation, it: e.target.value } })} /></div>
          <div className="form-group"><label>Designation (English)</label><input type="text" required value={formData.designation.en} onChange={e => setFormData({ ...formData, designation: { ...formData.designation, en: e.target.value } })} /></div>
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
              <input type="number" required min="0" step={isPoudre ? '0.01' : '1'} placeholder={isPoudre ? '50.00' : '0'} value={formData.orderedQuantity} onChange={e => setFormData({ ...formData, orderedQuantity: parseQty(e.target.value) })} />
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
function SuperCategoryManager({ superCats, language, t, onClose }) {
  const [list, setList] = useState(superCats);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ key: '', labelFr: '', labelIt: '', labelEn: '', color: '#6366f1' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.key || !form.labelFr) { setError('Identifiant et nom (FR) requis'); return; }
    if (!/^[a-z0-9_]+$/.test(form.key)) { setError("L'identifiant: lettres minuscules, chiffres et _ uniquement"); return; }
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
    } catch (err) { setError(err.response?.data?.error || 'Erreur'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (key) => {
    if (!window.confirm(t('deleteSuperCatConfirm'))) return;
    try {
      await axios.delete(`${API_URL}/super-categories/${key}`);
      setList(prev => prev.filter(s => s.key !== key));
    } catch (err) { alert(err.response?.data?.error || 'Erreur'); }
  };

  const SYSTEM_KEYS = ['aluminium', 'verre', 'accessoires'];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--large" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-head__icon"><Settings size={14} /></span>
          <h2>{t('manageSuperCats')}</h2>
        </div>

        <div className="supercat-list">
          {list.map(sc => (
            <div key={sc.key} className="supercat-row">
              <span className="supercat-icon">{getSCIcon(sc.key)}</span>
              <span className="supercat-color-dot" style={{ background: sc.color }} />
              <span className="supercat-label">{getSuperCatLabel(sc, language)}</span>
              <code className="supercat-key">{sc.key}</code>
              <button
                className="supercat-delete-btn"
                onClick={() => handleDelete(sc.key)}
                disabled={SYSTEM_KEYS.includes(sc.key)}
                title={SYSTEM_KEYS.includes(sc.key) ? 'Catégorie système' : t('delete')}
              >
                <Trash2 size={13} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>

        {!adding ? (
          <button className="btn-outline" style={{ marginTop: 16 }} onClick={() => setAdding(true)}>
            <Plus size={14} />
            {t('addSuperCategory')}
          </button>
        ) : (
          <form onSubmit={handleAdd} className="supercat-add-form">
            <div className="form-grid-2">
              <div className="form-group">
                <label>{t('superCategoryKey')} *</label>
                <input type="text" placeholder="ex: composite" value={form.key} onChange={e => setForm(f => ({ ...f, key: e.target.value.toLowerCase().replace(/\s/g, '_') }))} required />
              </div>
              <div className="form-group">
                <label>{t('superCategoryColor')}</label>
                <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Nom (Français) *</label>
                <input type="text" placeholder="Composite" value={form.labelFr} onChange={e => setForm(f => ({ ...f, labelFr: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label>Nome (Italiano)</label>
                <input type="text" placeholder="Composito" value={form.labelIt} onChange={e => setForm(f => ({ ...f, labelIt: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Name (English)</label>
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

        <div className="modal-actions" style={{ marginTop: 20, borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
          <button className="btn-cancel" onClick={onClose}>{t('close')}</button>
        </div>
      </div>
    </div>
  );
}

export default InventoryPage;