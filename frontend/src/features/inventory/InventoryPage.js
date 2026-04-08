import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import './InventoryPage.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

// Default built-in super-categories (always present as fallback)
const DEFAULT_SUPER_CATS = [
  { key: 'aluminium',   labelFr: '🔩 Aluminium', labelIt: '🔩 Alluminio',  labelEn: '🔩 Aluminium', color: '#3b82f6' },
  { key: 'verre',       labelFr: '💎 Verre',      labelIt: '💎 Vetro',       labelEn: '💎 Glass',     color: '#06b6d4' },
  { key: 'accessoires', labelFr: '🔧 Accessoires',labelIt: '🔧 Accessori',   labelEn: '🔧 Accessories',color: '#f59e0b' },
];

function getSuperCatLabel(sc, language) {
  if (sc.label) return sc.label[language] || sc.label.fr || sc.key;
  const map = { fr: sc.labelFr, it: sc.labelIt, en: sc.labelEn };
  return map[language] || sc.labelFr || sc.key;
}

function InventoryPage() {
  const { currentLanguage: language, t } = useLanguage();
  const { can } = useAuth();

  const [superCats,        setSuperCats]        = useState(DEFAULT_SUPER_CATS);
  const [activeSuperCat,   setActiveSuperCat]   = useState('aluminium');
  const [items,            setItems]            = useState([]);
  const [categories,       setCategories]       = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [filter,           setFilter]           = useState('all');
  const [loading,          setLoading]          = useState(true);
  const [showAddCategory,  setShowAddCategory]  = useState(false);
  const [editingCategory,  setEditingCategory]  = useState(null);
  const [showAddItem,      setShowAddItem]      = useState(false);
  const [editingItem,      setEditingItem]      = useState(null);
  const [searchTerm,       setSearchTerm]       = useState('');
  const [exporting,        setExporting]        = useState(false);
  const [takeOutModal,     setTakeOutModal]     = useState(null);
  const [takeOutQty,       setTakeOutQty]       = useState(1);
  const [takeOutNote,      setTakeOutNote]      = useState('');
  const [showSuperCatMgr,  setShowSuperCatMgr]  = useState(false);

  // Load super-categories from backend if endpoint exists, else fall back to defaults
  const fetchSuperCats = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/super-categories`);
      if (res.data && res.data.length) setSuperCats(res.data);
    } catch {
      setSuperCats(DEFAULT_SUPER_CATS);
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/categories?superCategory=${activeSuperCat}`);
      setCategories(response.data);
      setSelectedCategory('all');
    } catch (error) { console.error(error); }
  }, [activeSuperCat]);

  const fetchItems = useCallback(async () => {
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
      const response = await axios.get(url);
      let filteredItems = response.data;
      if (filter === 'low-stock') {
        filteredItems = filteredItems.filter(item =>
          (item.superCategory || 'aluminium') === activeSuperCat
        );
        if (selectedCategory !== 'all') {
          filteredItems = filteredItems.filter(item =>
            item.categoryId?.id === selectedCategory || item.categoryId?._id === selectedCategory
          );
        }
      }
      setItems(filteredItems);
    } catch (error) { console.error(error); }
    finally { setLoading(false); }
  }, [activeSuperCat, selectedCategory, filter]);

  useEffect(() => { fetchSuperCats(); }, [fetchSuperCats]);
  useEffect(() => { fetchCategories(); }, [fetchCategories]);
  useEffect(() => { fetchItems(); }, [fetchItems]);

  const getStockStatus = (item) => {
    const total = item.quantity + (item.orderedQuantity || 0);
    if (total < item.threshold)                              return { color: '#dc2626', text: t('criticalStock'), className: 'status-critical' };
    if (item.quantity < item.threshold && total >= item.threshold) return { color: '#f59e0b', text: t('warningStock'),  className: 'status-warning' };
    return { color: '#16a34a', text: t('inStock'), className: 'status-ok' };
  };

  const updateQuantity = async (itemId, amount, note = '') => {
    try {
      const response = await axios.patch(`${API_URL}/inventory/${itemId}/quantity`, { amount, note });
      setItems(items.map(item => item.id === itemId ? response.data : item));
    } catch { alert(t('errorUpdating') || 'Erreur de mise à jour'); }
  };

  const handleMinusClick  = (item) => { setTakeOutModal({ item }); setTakeOutQty(1); setTakeOutNote(''); };
  const handleTakeOutConfirm = async () => {
    if (!takeOutModal) return;
    const qty = parseInt(takeOutQty, 10);
    if (!qty || qty <= 0) return;
    await updateQuantity(takeOutModal.item.id, -qty, takeOutNote);
    setTakeOutModal(null);
  };

  const deleteItem = async (itemId) => {
    if (!window.confirm(t('deleteConfirmMessage'))) return;
    try {
      await axios.delete(`${API_URL}/inventory/${itemId}`);
      setItems(items.filter(item => item.id !== itemId));
    } catch (error) { console.error(error); }
  };

  const deleteCategory = async (categoryId) => {
    if (!window.confirm(t('deleteCategoryConfirmMessage'))) return;
    try {
      await axios.delete(`${API_URL}/categories/${categoryId}`);
      fetchCategories();
    } catch (error) { console.error(error); }
  };

  const filteredItems = items.filter(item => {
    if (!searchTerm) return true;
    const designation = item.designation[language] || item.designation.fr || '';
    return designation.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const exportToExcel = () => {
    setExporting(true);
    try {
      const workbook = XLSX.utils.book_new();
      const categoriesMap = new Map();
      categoriesMap.set('no-category', { name: t('noCategory'), items: [] });
      categories.forEach(cat => categoriesMap.set(cat.id, { name: cat.name[language], items: [] }));
      items.forEach(item => {
        const categoryId = item.categoryId?.id || item.categoryId?._id || 'no-category';
        if (categoriesMap.has(categoryId)) categoriesMap.get(categoryId).items.push(item);
        else categoriesMap.get('no-category').items.push(item);
      });
      categoriesMap.forEach((categoryData) => {
        if (categoryData.items.length === 0) return;
        const sheetData = categoryData.items.map(item => ({
          [t('designation')]: item.designation[language] || item.designation.fr,
          [t('quantity')]: item.quantity,
          [t('orderedQuantity')]: item.orderedQuantity || 0,
          [t('threshold')]: item.threshold,
          [t('status')]: getStockStatus(item).text
        }));
        const worksheet = XLSX.utils.json_to_sheet(sheetData);
        worksheet['!cols'] = [{ wch: 40 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(workbook, worksheet, categoryData.name.substring(0, 31));
      });
      XLSX.writeFile(workbook, `inventaire_${activeSuperCat}_${new Date().toISOString().split('T')[0]}.xlsx`);
      alert(t('exportSuccess'));
    } catch { alert(t('exportError')); }
    finally { setExporting(false); }
  };

  const currentSuperCat = superCats.find(s => s.key === activeSuperCat);

  // Permission check for current supercategory
  const canEdit   = can(`inventory.${activeSuperCat}.edit`)   || can('inventory.edit');
  const canDelete = can(`inventory.${activeSuperCat}.delete`) || can('inventory.delete');
  const canView   = can(`inventory.${activeSuperCat}.view`)   || can('inventory.view');

  if (!canView) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <div style={{ fontSize: '3rem', marginBottom: 12 }}>🔒</div>
        <h2 style={{ color: '#374151' }}>{t('accessDenied') || 'Accès refusé'}</h2>
      </div>
    );
  }

  return (
    <div className="inventory-app">
      {/* Super-category tabs */}
      <div className="super-cat-tabs">
        {superCats.map(sc => (
          <button
            key={sc.key}
            className={`super-cat-tab ${activeSuperCat === sc.key ? 'active' : ''}`}
            style={{ '--sc-color': sc.color }}
            onClick={() => { setActiveSuperCat(sc.key); setFilter('all'); setSearchTerm(''); }}
          >
            {getSuperCatLabel(sc, language)}
          </button>
        ))}
        {can('admin.view') && (
          <button className="super-cat-tab super-cat-tab--manage" onClick={() => setShowSuperCatMgr(true)}>
            ⚙️
          </button>
        )}
      </div>

      <header className="inv-header">
        <h1 style={{ color: currentSuperCat?.color }}>
          {getSuperCatLabel(currentSuperCat || superCats[0], language)}
        </h1>
        <div className="inv-header__search">
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="inv-search-input"
          />
        </div>
      </header>

      <div className="controls">
        <div className="filter-buttons">
          <button
            className={`filter-btn ${filter === 'all' && selectedCategory === 'all' ? 'active' : ''}`}
            onClick={() => { setFilter('all'); setSelectedCategory('all'); }}
          >{t('showAll')}</button>
          <button
            className={`filter-btn ${filter === 'low-stock' ? 'active low-stock' : ''}`}
            onClick={() => setFilter(filter === 'low-stock' ? 'all' : 'low-stock')}
          >{t('lowStock')}</button>
          {categories.map(category => (
            <div key={category.id} className="category-btn-wrapper">
              <button
                className={`filter-btn category-btn ${selectedCategory === category.id ? 'active' : ''}`}
                style={{ '--category-color': category.color, borderColor: selectedCategory === category.id ? category.color : '#333' }}
                onClick={() => setSelectedCategory(selectedCategory === category.id ? 'all' : category.id)}
              >
                <span className="category-dot" style={{ backgroundColor: category.color }}></span>
                {category.name[language]}
              </button>
              {canEdit && (
                <button className="edit-category-btn" onClick={() => setEditingCategory(category)} title={t('edit')}>✎</button>
              )}
              {canDelete && (
                <button className="delete-category-btn" onClick={() => deleteCategory(category.id)} title={t('delete')}>×</button>
              )}
            </div>
          ))}
          {canEdit && (
            <button className="filter-btn add-category-btn" onClick={() => setShowAddCategory(true)}>
              + {t('addCategory')}
            </button>
          )}
        </div>
        <div className="action-buttons">
          <button className="excel-btn" onClick={exportToExcel} disabled={exporting || items.length === 0}>
            {exporting ? t('exporting') : t('exportExcel')}
          </button>
          {canEdit && (
            <button className="add-item-btn" onClick={() => setShowAddItem(true)}>
              + {t('addNewItem')}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="loading">{t('loading')}</div>
      ) : filteredItems.length === 0 ? (
        <div className="no-items">{t('noItems')}</div>
      ) : (
        <div className="items-grid">
          {filteredItems.map(item => (
            <ItemCard
              key={item.id}
              item={item}
              language={language}
              onUpdateQuantity={updateQuantity}
              onMinusClick={handleMinusClick}
              onEdit={canEdit   ? (item) => setEditingItem(item) : null}
              onDelete={canDelete ? deleteItem : null}
              getStockStatus={getStockStatus}
              t={t}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {(showAddCategory || editingCategory) && (
        <CategoryModal
          language={language}
          superCategory={activeSuperCat}
          category={editingCategory}
          t={t}
          onClose={() => { setShowAddCategory(false); setEditingCategory(null); fetchCategories(); }}
          onSave={() =>  { setShowAddCategory(false); setEditingCategory(null); fetchCategories(); }}
        />
      )}
      {(showAddItem || editingItem) && (
        <ItemModal
          language={language}
          categories={categories}
          item={editingItem}
          superCategory={activeSuperCat}
          t={t}
          onClose={() => { setShowAddItem(false); setEditingItem(null); }}
          onSave={() =>  { setShowAddItem(false); setEditingItem(null); fetchItems(); }}
        />
      )}
      {takeOutModal && (
        <div className="modal-overlay" onClick={() => setTakeOutModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{t('takeOutTitle')}</h2>
            <p style={{ margin: 0 }}>
              <strong>{takeOutModal.item.designation[language]}</strong>
              <span style={{ marginLeft: 8, color: '#888', fontSize: '0.88rem' }}>({t('takeOutAvailable')}: {takeOutModal.item.quantity})</span>
            </p>
            <div className="form-group">
              <label>{t('takeOutQtyLabel')}</label>
              <input type="number" min={1} max={takeOutModal.item.quantity} value={takeOutQty} onChange={e => setTakeOutQty(e.target.value)} autoFocus style={{ width: 100 }} />
            </div>
            <div className="form-group">
              <label>{t('takeOutNoteLabel')}</label>
              <textarea placeholder={t('takeOutPlaceholder')} value={takeOutNote} onChange={e => setTakeOutNote(e.target.value)} rows={3} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d0d5dd', fontFamily: 'inherit', fontSize: '0.9rem', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
            <div className="modal-actions">
              <button type="button" onClick={() => setTakeOutModal(null)}>{t('takeOutCancel')}</button>
              <button type="button" className="primary" onClick={handleTakeOutConfirm}
                disabled={!takeOutQty || parseInt(takeOutQty) <= 0 || parseInt(takeOutQty) > takeOutModal.item.quantity}
                style={{ background: '#ef4444' }}>{t('takeOutConfirm')}</button>
            </div>
          </div>
        </div>
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

/* ── Item Card ──────────────────────────────────────────────────────── */
function ItemCard({ item, language, onUpdateQuantity, onMinusClick, onEdit, onDelete, getStockStatus, t }) {
  const status = getStockStatus(item);
  return (
    <div className={`item-card ${status.className}`}>
      <div className="item-image">
        {item.image ? <img src={item.image} alt={item.designation[language]} /> : <div className="no-image">📦</div>}
        {item.categoryId && <div className="item-category" style={{ backgroundColor: item.categoryId.color }}>{item.categoryId.name[language]}</div>}
      </div>
      <div className="item-content">
        <h3>{item.designation[language] || item.designation.fr}</h3>
        <div className="quantity-section">
          <div className="quantity-display">
            <span className="quantity-label">{t('quantity')}</span>
            <span className={`quantity-value ${item.quantity < item.threshold ? 'low' : ''}`}>{item.quantity}</span>
          </div>
          <div className="quantity-display">
            <span className="quantity-label">{t('orderedQuantity')}</span>
            <span className="quantity-value">{item.orderedQuantity || 0}</span>
          </div>
          <div className="threshold-display">
            <span className="threshold-label">{t('threshold')}</span>
            <span className="threshold-value">{item.threshold}</span>
          </div>
        </div>
        <div className="status-badge" style={{ backgroundColor: status.color, color: '#fff' }}>{status.text}</div>
        <div className="quantity-controls">
          <button className="qty-btn minus" onClick={() => onMinusClick(item)} disabled={item.quantity === 0}>−</button>
          <button className="qty-btn plus"  onClick={() => onUpdateQuantity(item.id, 1)}>+</button>
        </div>
        <div className="item-actions">
          {onEdit   && <button className="edit-btn"   onClick={() => onEdit(item)}>{t('edit')}</button>}
          {onDelete && <button className="delete-btn" onClick={() => onDelete(item.id)}>{t('delete')}</button>}
        </div>
      </div>
    </div>
  );
}

/* ── Category Modal (add + edit) ─────────────────────────────────── */
function CategoryModal({ language, superCategory, category, t, onClose, onSave }) {
  const isEdit = !!category;
  const [formData, setFormData] = useState(isEdit
    ? { name: { ...category.name }, color: category.color }
    : { name: { it: '', fr: '', en: '' }, color: '#3b82f6' }
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (isEdit) {
        await axios.put(`${API_URL}/categories/${category.id}`, { ...formData, superCategory });
      } else {
        await axios.post(`${API_URL}/categories`, { ...formData, superCategory });
      }
      onSave();
    } catch { alert('Erreur lors de la sauvegarde'); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{isEdit ? t('editCategory') : t('addCategory')}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group"><label>Nom (Français)</label><input type="text" required value={formData.name.fr} onChange={e => setFormData({ ...formData, name: { ...formData.name, fr: e.target.value } })} /></div>
          <div className="form-group"><label>Nome (Italiano)</label><input type="text" required value={formData.name.it} onChange={e => setFormData({ ...formData, name: { ...formData.name, it: e.target.value } })} /></div>
          <div className="form-group"><label>Name (English)</label><input  type="text" required value={formData.name.en} onChange={e => setFormData({ ...formData, name: { ...formData.name, en: e.target.value } })} /></div>
          <div className="form-group"><label>{t('superCategoryColor') || 'Couleur'}</label><input type="color" value={formData.color} onChange={e => setFormData({ ...formData, color: e.target.value })} /></div>
          <div className="modal-actions">
            <button type="button" onClick={onClose}>{t('cancel')}</button>
            <button type="submit" className="primary">{isEdit ? t('update') : t('create')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Item Modal ──────────────────────────────────────────────────── */
function ItemModal({ language, categories, item, superCategory, t, onClose, onSave }) {
  const [formData, setFormData] = useState(item ? {
    image: item.image || '', designation: { ...item.designation },
    quantity: item.quantity, orderedQuantity: item.orderedQuantity || 0,
    threshold: item.threshold, categoryId: item.categoryId?.id || item.categoryId?._id || '',
    superCategory: item.superCategory || superCategory
  } : {
    image: '', designation: { it: '', fr: '', en: '' },
    quantity: 0, orderedQuantity: 0, threshold: 0, categoryId: '',
    superCategory
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (item) { await axios.put(`${API_URL}/inventory/${item.id}`, formData); }
      else       { await axios.post(`${API_URL}/inventory`, formData); }
      onSave();
    } catch { alert('Erreur lors de la sauvegarde'); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal large" onClick={e => e.stopPropagation()}>
        <h2>{item ? t('editItem') : t('addNewItem')}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group"><label>{t('imageUrl')}</label><input type="url" value={formData.image} onChange={e => setFormData({ ...formData, image: e.target.value })} /></div>
          <div className="form-group"><label>Désignation (Français)</label><input type="text" required value={formData.designation.fr} onChange={e => setFormData({ ...formData, designation: { ...formData.designation, fr: e.target.value } })} /></div>
          <div className="form-group"><label>Designazione (Italiano)</label><input type="text" required value={formData.designation.it} onChange={e => setFormData({ ...formData, designation: { ...formData.designation, it: e.target.value } })} /></div>
          <div className="form-group"><label>Designation (English)</label><input  type="text" required value={formData.designation.en} onChange={e => setFormData({ ...formData, designation: { ...formData.designation, en: e.target.value } })} /></div>
          <div className="form-group">
            <label>{t('categoryLabel')}</label>
            <select value={formData.categoryId} onChange={e => setFormData({ ...formData, categoryId: e.target.value })}>
              <option value="">{t('noCategory')}</option>
              {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name[language]}</option>)}
            </select>
          </div>
          <div className="form-row">
            <div className="form-group"><label>{t('quantityLabel')}</label><input type="number" required min="0" value={formData.quantity} onChange={e => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })} /></div>
            <div className="form-group"><label>{t('orderedQuantityLabel')}</label><input type="number" required min="0" value={formData.orderedQuantity} onChange={e => setFormData({ ...formData, orderedQuantity: parseInt(e.target.value) || 0 })} /></div>
            <div className="form-group"><label>{t('thresholdLabel')}</label><input type="number" required min="0" value={formData.threshold} onChange={e => setFormData({ ...formData, threshold: parseInt(e.target.value) || 0 })} /></div>
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose}>{t('cancel')}</button>
            <button type="submit" className="primary">{item ? t('update') : t('create')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Super-Category Manager ──────────────────────────────────────── */
function SuperCategoryManager({ superCats, language, t, onClose }) {
  const [list,    setList]    = useState(superCats);
  const [adding,  setAdding]  = useState(false);
  const [form,    setForm]    = useState({ key: '', labelFr: '', labelIt: '', labelEn: '', color: '#6366f1' });
  const [error,   setError]   = useState('');
  const [saving,  setSaving]  = useState(false);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.key || !form.labelFr) { setError('Identifiant et nom (FR) requis'); return; }
    if (!/^[a-z0-9_]+$/.test(form.key)) { setError("L'identifiant ne peut contenir que des lettres minuscules, chiffres et _"); return; }
    setSaving(true);
    try {
      const res = await axios.post(`${API_URL}/super-categories`, {
        key: form.key,
        label: { fr: form.labelFr, it: form.labelIt || form.labelFr, en: form.labelEn || form.labelFr },
        color: form.color
      });
      setList(prev => [...prev, res.data]);
      setAdding(false);
      setForm({ key: '', labelFr: '', labelIt: '', labelEn: '', color: '#6366f1' });
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur');
    } finally { setSaving(false); }
  };

  const handleDelete = async (key) => {
    if (!window.confirm(t('deleteSuperCatConfirm'))) return;
    try {
      await axios.delete(`${API_URL}/super-categories/${key}`);
      setList(prev => prev.filter(s => s.key !== key));
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal large" onClick={e => e.stopPropagation()}>
        <h2>⚙ {t('manageSuperCats')}</h2>

        <div className="supercat-list">
          {list.map(sc => (
            <div key={sc.key} className="supercat-row">
              <span className="supercat-color-dot" style={{ background: sc.color }} />
              <span className="supercat-label">{getSuperCatLabel(sc, language)}</span>
              <code className="supercat-key">{sc.key}</code>
              <button
                className="btn-sm btn-sm-danger"
                onClick={() => handleDelete(sc.key)}
                disabled={['aluminium','verre','accessoires'].includes(sc.key)}
                title={['aluminium','verre','accessoires'].includes(sc.key) ? 'Catégorie système' : ''}
              >
                {t('delete')}
              </button>
            </div>
          ))}
        </div>

        {!adding ? (
          <button className="btn-primary" style={{ marginTop: 16 }} onClick={() => setAdding(true)}>
            + {t('addSuperCategory')}
          </button>
        ) : (
          <form onSubmit={handleAdd} style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12, background: '#f9fafb', padding: 16, borderRadius: 10, border: '1px solid #e5e7eb' }}>
            <div className="form-grid-2">
              <div className="form-group">
                <label>{t('superCategoryKey')} *</label>
                <input type="text" placeholder="ex: composite" value={form.key} onChange={e => setForm(f => ({ ...f, key: e.target.value.toLowerCase().replace(/\s/g,'_') }))} required />
              </div>
              <div className="form-group">
                <label>{t('superCategoryColor')}</label>
                <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Nom (Français) *</label>
                <input type="text" placeholder="🔩 Composite" value={form.labelFr} onChange={e => setForm(f => ({ ...f, labelFr: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label>Nome (Italiano)</label>
                <input type="text" placeholder="🔩 Composito" value={form.labelIt} onChange={e => setForm(f => ({ ...f, labelIt: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Name (English)</label>
                <input type="text" placeholder="🔩 Composite" value={form.labelEn} onChange={e => setForm(f => ({ ...f, labelEn: e.target.value }))} />
              </div>
            </div>
            {error && <div className="form-error">{error}</div>}
            <div className="modal-actions">
              <button type="button" onClick={() => { setAdding(false); setError(''); }}>{t('cancel')}</button>
              <button type="submit" className="primary" disabled={saving}>{saving ? '...' : t('create')}</button>
            </div>
          </form>
        )}

        <div className="modal-actions" style={{ marginTop: 20 }}>
          <button onClick={onClose}>{t('close')}</button>
        </div>
      </div>
    </div>
  );
}

export default InventoryPage;