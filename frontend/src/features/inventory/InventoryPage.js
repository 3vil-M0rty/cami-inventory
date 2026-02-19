import React, { useState, useEffect } from 'react';
import axios from "axios";
import * as XLSX from 'xlsx';
import { useLanguage } from '../../context/LanguageContext';
import './InventoryPage.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

function InventoryPage() {
  const { currentLanguage: language } = useLanguage();

  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [exporting, setExporting] = useState(false);
  const [takeOutModal, setTakeOutModal] = useState(null); // { item }
  const [takeOutQty, setTakeOutQty] = useState(1);
  const [takeOutNote, setTakeOutNote] = useState('');

  useEffect(() => { fetchCategories(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fetchItems(); }, [selectedCategory, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchCategories = async () => {
    try {
      const response = await axios.get(`${API_URL}/categories`);
      setCategories(response.data);
    } catch (error) { console.error('Error fetching categories:', error); }
  };

  const fetchItems = async () => {
    setLoading(true);
    try {
      let url = `${API_URL}/inventory`;
      if (filter === 'low-stock') {
        url = `${API_URL}/inventory/filter/low-stock`;
      } else if (selectedCategory !== 'all') {
        url = `${API_URL}/inventory?categoryId=${selectedCategory}`;
      }
      const response = await axios.get(url);
      let filteredItems = response.data;
      if (filter === 'low-stock' && selectedCategory !== 'all') {
        filteredItems = filteredItems.filter(item =>
          item.categoryId?._id === selectedCategory || item.categoryId?.id === selectedCategory
        );
      }
      setItems(filteredItems);
    } catch (error) { console.error('Error fetching items:', error); }
    finally { setLoading(false); }
  };

  // Local translations
  const localT = {
    fr: {
      title: 'Inventaire Aluminium', allItems: 'Tout afficher', lowStock: 'Stock faible uniquement',
      addCategory: 'Ajouter catégorie', addItem: 'Ajouter article',
      quantity: 'Quantité', orderedQuantity: 'Qté Commandée', threshold: 'Seuil',
      actions: 'Actions', noItems: 'Aucun article trouvé', loading: 'Chargement...',
      designation: 'Désignation', modifier: 'Modifier', supprimer: 'Supprimer',
      searchPlaceholder: 'Rechercher par désignation...',
      exportExcel: 'Exporter Excel', exporting: 'Exportation...',
      exportSuccess: 'Excel exporté avec succès', exportError: "Erreur lors de l'exportation",
      noCategory: 'Sans Catégorie', criticalStock: 'Stock Critique',
      warningStock: 'Alerte Stock', inStock: 'En Stock',
      deleteConfirmMessage: 'Êtes-vous sûr de vouloir supprimer cet article?',
      deleteCategoryConfirmMessage: 'Êtes-vous sûr de vouloir supprimer cette catégorie?',
      errorUpdating: 'Erreur lors de la mise à jour', status: 'Statut',
      takeOutTitle: 'Retirer du stock', takeOutAvailable: 'disponible', takeOutQtyLabel: 'Quantité à retirer', takeOutNoteLabel: 'Raison / Note', takeOutPlaceholder: 'ex: Utilisé pour la maintenance de la machine #3', takeOutConfirm: 'Confirmer le retrait', takeOutCancel: 'Annuler'
    },
    it: {
      title: 'Inventario Alluminio', allItems: 'Mostra tutto', lowStock: 'Solo scorte basse',
      addCategory: 'Aggiungi categoria', addItem: 'Aggiungi articolo',
      quantity: 'Quantità', orderedQuantity: 'Qta Ordinata', threshold: 'Soglia',
      actions: 'Azioni', noItems: 'Nessun articolo trovato', loading: 'Caricamento...',
      designation: 'Designazione', modifier: 'Modifica', supprimer: 'Elimina',
      searchPlaceholder: 'Cerca per designazione...',
      exportExcel: 'Esporta Excel', exporting: 'Esportazione...',
      exportSuccess: 'Excel esportato con successo', exportError: "Errore durante l'esportazione",
      noCategory: 'Senza Categoria', criticalStock: 'Stock Critico',
      warningStock: 'Avviso Stock', inStock: 'Disponibile',
      deleteConfirmMessage: 'Sei sicuro di voler eliminare questo articolo?',
      deleteCategoryConfirmMessage: 'Sei sicuro di voler eliminare questa categoria?',
      errorUpdating: "Errore durante l'aggiornamento", status: 'Stato',
      takeOutTitle: 'Preleva dal magazzino', takeOutAvailable: 'disponibile', takeOutQtyLabel: 'Quantità da prelevare', takeOutNoteLabel: 'Motivo / Nota', takeOutPlaceholder: 'es: Usato per manutenzione macchina #3', takeOutConfirm: 'Conferma prelievo', takeOutCancel: 'Annulla'
    },
    en: {
      title: 'Aluminum Inventory', allItems: 'Show all', lowStock: 'Low stock only',
      addCategory: 'Add category', addItem: 'Add item',
      quantity: 'Quantity', orderedQuantity: 'Ordered Qty', threshold: 'Threshold',
      actions: 'Actions', noItems: 'No items found', loading: 'Loading...',
      designation: 'Designation', modifier: 'Edit', supprimer: 'Delete',
      searchPlaceholder: 'Search by designation...',
      exportExcel: 'Export Excel', exporting: 'Exporting...',
      exportSuccess: 'Excel exported successfully', exportError: 'Error during export',
      noCategory: 'No Category', criticalStock: 'Critical Stock',
      warningStock: 'Warning Stock', inStock: 'In Stock',
      deleteConfirmMessage: 'Are you sure you want to delete this item?',
      deleteCategoryConfirmMessage: 'Are you sure you want to delete this category?',
      errorUpdating: 'Error updating', status: 'Status',
      takeOutTitle: 'Take out stock', takeOutAvailable: 'available', takeOutQtyLabel: 'Quantity to remove', takeOutNoteLabel: 'Reason / Note', takeOutPlaceholder: 'e.g. Used for maintenance on machine #3', takeOutConfirm: 'Confirm take-out', takeOutCancel: 'Cancel'
    }
  };

  const t = localT[language] || localT.fr;

  const getStockStatus = (item) => {
    const currentStock = item.quantity;
    const orderedQty   = item.orderedQuantity || 0;
    const totalStock   = currentStock + orderedQty;
    const threshold    = item.threshold;
    if (totalStock < threshold)                              return { color: '#dc2626', text: t.criticalStock, className: 'status-critical' };
    if (currentStock < threshold && totalStock >= threshold) return { color: '#f59e0b', text: t.warningStock,  className: 'status-warning' };
    return { color: '#16a34a', text: t.inStock, className: 'status-ok' };
  };

  const updateQuantity = async (itemId, amount, note = '') => {
    try {
      const response = await axios.patch(`${API_URL}/inventory/${itemId}/quantity`, { amount, note });
      setItems(items.map(item => item.id === itemId ? response.data : item));
    } catch (error) {
      console.error('Error updating quantity:', error);
      alert(t.errorUpdating || 'Erreur lors de la mise à jour');
    }
  };

  const handleMinusClick = (item) => {
    setTakeOutModal({ item });
    setTakeOutQty(1);
    setTakeOutNote('');
  };

  const handleTakeOutConfirm = async () => {
    if (!takeOutModal) return;
    const qty = parseInt(takeOutQty, 10);
    if (!qty || qty <= 0) return;
    await updateQuantity(takeOutModal.item.id, -qty, takeOutNote);
    setTakeOutModal(null);
    setTakeOutQty(1);
    setTakeOutNote('');
  };

  const handleTakeOutCancel = () => {
    setTakeOutModal(null);
    setTakeOutQty(1);
    setTakeOutNote('');
  };

  const deleteItem = async (itemId) => {
    if (!window.confirm(t.deleteConfirmMessage)) return;
    try {
      await axios.delete(`${API_URL}/inventory/${itemId}`);
      setItems(items.filter(item => item.id !== itemId));
    } catch (error) { console.error('Error deleting item:', error); }
  };

  const deleteCategory = async (categoryId) => {
    if (!window.confirm(t.deleteCategoryConfirmMessage)) return;
    try {
      await axios.delete(`${API_URL}/categories/${categoryId}`);
      setCategories(categories.filter(cat => cat.id !== categoryId));
      if (selectedCategory === categoryId) setSelectedCategory('all');
    } catch (error) { console.error('Error deleting category:', error); }
  };

  const filteredItems = items.filter(item => {
    if (!searchTerm) return true;
    const designation = item.designation[language] || '';
    return designation.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const exportToExcel = () => {
    setExporting(true);
    try {
      const workbook = XLSX.utils.book_new();
      const categoriesMap = new Map();
      categoriesMap.set('no-category', { name: t.noCategory, items: [] });
      categories.forEach(cat => {
        categoriesMap.set(cat.id, { name: cat.name[language], items: [] });
      });
      items.forEach(item => {
        const categoryId = item.categoryId?.id || item.categoryId?._id || 'no-category';
        if (categoriesMap.has(categoryId)) {
          categoriesMap.get(categoryId).items.push(item);
        } else {
          categoriesMap.get('no-category').items.push(item);
        }
      });
      categoriesMap.forEach((categoryData) => {
        if (categoryData.items.length === 0) return;
        const sheetData = categoryData.items.map(item => ({
          [t.designation]: item.designation[language],
          [t.quantity]: item.quantity,
          [t.orderedQuantity]: item.orderedQuantity || 0,
          [t.threshold]: item.threshold,
          [t.status]: getStockStatus(item).text
        }));
        const worksheet = XLSX.utils.json_to_sheet(sheetData);
        worksheet['!cols'] = [{ wch: 40 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(workbook, worksheet, categoryData.name.substring(0, 31));
      });
      const fileName = `inventaire_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      alert(t.exportSuccess);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert(t.exportError);
    } finally { setExporting(false); }
  };

  return (
    <div className="inventory-app">
      <header className="inv-header">
        <h1>{t.title}</h1>
        <div className="inv-header__search">
          <input
            type="text"
            placeholder={t.searchPlaceholder}
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
          >
            {t.allItems}
          </button>
          <button
            className={`filter-btn ${filter === 'low-stock' ? 'active low-stock' : ''}`}
            onClick={() => setFilter(filter === 'low-stock' ? 'all' : 'low-stock')}
          >
            {t.lowStock}
          </button>
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
              <button className="delete-category-btn" onClick={() => deleteCategory(category.id)} title={t.supprimer}>×</button>
            </div>
          ))}
          <button className="filter-btn add-category-btn" onClick={() => setShowAddCategory(true)}>
            + {t.addCategory}
          </button>
        </div>
        <div className="action-buttons">
          <button className="excel-btn" onClick={exportToExcel} disabled={exporting || items.length === 0}>
            {exporting ? t.exporting : t.exportExcel}
          </button>
          <button className="add-item-btn" onClick={() => setShowAddItem(true)}>
            + {t.addItem}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">{t.loading}</div>
      ) : filteredItems.length === 0 ? (
        <div className="no-items">{t.noItems}</div>
      ) : (
        <div className="items-grid">
          {filteredItems.map(item => (
            <ItemCard
              key={item.id}
              item={item}
              language={language}
              onUpdateQuantity={updateQuantity}
                  onMinusClick={handleMinusClick}
              onEdit={(item) => setEditingItem(item)}
              onDelete={deleteItem}
              getStockStatus={getStockStatus}
              t={t}
            />
          ))}
        </div>
      )}

      {showAddCategory && (
        <CategoryModal
          language={language}
          onClose={() => { setShowAddCategory(false); fetchCategories(); }}
          onSave={() => { setShowAddCategory(false); fetchCategories(); }}
        />
      )}

      {(showAddItem || editingItem) && (
        <ItemModal
          language={language}
          categories={categories}
          item={editingItem}
          onClose={() => { setShowAddItem(false); setEditingItem(null); }}
          onSave={() => { setShowAddItem(false); setEditingItem(null); fetchItems(); }}
        />
      )}

      {/* Take-Out Modal */}
      {takeOutModal && (
        <div className="modal-overlay" onClick={handleTakeOutCancel}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth: 420, padding: 24, display: 'flex', flexDirection: 'column', gap: 16}}>
            <h2 style={{margin: 0, fontSize: '1.1rem'}}>{t.takeOutTitle}</h2>
            <p style={{margin: 0}}>
              <strong>{takeOutModal.item.designation[language]}</strong>
              <span style={{marginLeft: 8, color: '#888', fontSize: '0.88rem'}}>({t.takeOutAvailable}: {takeOutModal.item.quantity})</span>
            </p>
            <div className="form-group">
              <label>{t.takeOutQtyLabel}</label>
              <input
                type="number"
                min={1}
                max={takeOutModal.item.quantity}
                value={takeOutQty}
                onChange={e => setTakeOutQty(e.target.value)}
                autoFocus
                style={{width: 100}}
              />
            </div>
            <div className="form-group">
              <label>{t.takeOutNoteLabel}</label>
              <textarea
                placeholder={t.takeOutPlaceholder}
                value={takeOutNote}
                onChange={e => setTakeOutNote(e.target.value)}
                rows={3}
                style={{width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d0d5dd', fontFamily: 'inherit', fontSize: '0.9rem', resize: 'vertical', boxSizing: 'border-box'}}
              />
            </div>
            <div className="modal-actions">
              <button type="button" onClick={handleTakeOutCancel}>{t.takeOutCancel}</button>
              <button
                type="button"
                className="primary"
                onClick={handleTakeOutConfirm}
                disabled={!takeOutQty || parseInt(takeOutQty) <= 0 || parseInt(takeOutQty) > takeOutModal.item.quantity}
                style={{background: '#ef4444'}}
              >
                {t.takeOutConfirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ItemCard({ item, language, onUpdateQuantity, onMinusClick, onEdit, onDelete, getStockStatus, t }) {
  const status = getStockStatus(item);
  return (
    <div className={`item-card ${status.className}`}>
      <div className="item-image">
        {item.image ? (
          <img src={item.image} alt={item.designation[language]} />
        ) : (
          <div className="no-image">📦</div>
        )}
        {item.categoryId && (
          <div className="item-category" style={{ backgroundColor: item.categoryId.color }}>
            {item.categoryId.name[language]}
          </div>
        )}
      </div>
      <div className="item-content">
        <h3>{item.designation[language]}</h3>
        <div className="quantity-section">
          <div className="quantity-display">
            <span className="quantity-label">{t.quantity}</span>
            <span className={`quantity-value ${item.quantity < item.threshold ? 'low' : ''}`}>{item.quantity}</span>
          </div>
          <div className="quantity-display">
            <span className="quantity-label">{t.orderedQuantity}</span>
            <span className="quantity-value">{item.orderedQuantity || 0}</span>
          </div>
          <div className="threshold-display">
            <span className="threshold-label">{t.threshold}</span>
            <span className="threshold-value">{item.threshold}</span>
          </div>
        </div>
        <div className="status-badge" style={{ backgroundColor: status.color, color: '#fff' }}>
          {status.text}
        </div>
        <div className="quantity-controls">
          <button className="qty-btn minus" onClick={() => onMinusClick(item)} disabled={item.quantity === 0}>−</button>
          <button className="qty-btn plus" onClick={() => onUpdateQuantity(item.id, 1)}>+</button>
        </div>
        <div className="item-actions">
          <button className="edit-btn" onClick={() => onEdit(item)}>{t.modifier}</button>
          <button className="delete-btn" onClick={() => onDelete(item.id)}>{t.supprimer}</button>
        </div>
      </div>
    </div>
  );
}

function CategoryModal({ language, onClose, onSave }) {
  const [formData, setFormData] = useState({ name: { it: '', fr: '', en: '' }, color: '#3b82f6' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/categories`, formData);
      onSave();
    } catch (error) { console.error('Error creating category:', error); alert('Erreur lors de la création'); }
  };

  const labels = {
    fr: { title: 'Ajouter une catégorie', nameFr: 'Nom (Français)', nameIt: 'Nome (Italiano)', nameEn: 'Name (English)', color: 'Couleur', cancel: 'Annuler', create: 'Créer' },
    it: { title: 'Aggiungi categoria', nameFr: 'Nom (Français)', nameIt: 'Nome (Italiano)', nameEn: 'Name (English)', color: 'Colore', cancel: 'Annulla', create: 'Crea' },
    en: { title: 'Add category', nameFr: 'Nom (Français)', nameIt: 'Nome (Italiano)', nameEn: 'Name (English)', color: 'Color', cancel: 'Cancel', create: 'Create' },
  };
  const t = labels[language] || labels.fr;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t.title}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group"><label>{t.nameFr}</label>
            <input type="text" required value={formData.name.fr} onChange={(e) => setFormData({ ...formData, name: { ...formData.name, fr: e.target.value } })} />
          </div>
          <div className="form-group"><label>{t.nameIt}</label>
            <input type="text" required value={formData.name.it} onChange={(e) => setFormData({ ...formData, name: { ...formData.name, it: e.target.value } })} />
          </div>
          <div className="form-group"><label>{t.nameEn}</label>
            <input type="text" required value={formData.name.en} onChange={(e) => setFormData({ ...formData, name: { ...formData.name, en: e.target.value } })} />
          </div>
          <div className="form-group"><label>{t.color}</label>
            <input type="color" value={formData.color} onChange={(e) => setFormData({ ...formData, color: e.target.value })} />
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose}>{t.cancel}</button>
            <button type="submit" className="primary">{t.create}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ItemModal({ language, categories, item, onClose, onSave }) {
  const [formData, setFormData] = useState(item ? {
    image: item.image || '',
    designation: item.designation,
    quantity: item.quantity,
    orderedQuantity: item.orderedQuantity || 0,
    threshold: item.threshold,
    categoryId: item.categoryId?.id || item.categoryId?._id || ''
  } : {
    image: '', designation: { it: '', fr: '', en: '' },
    quantity: 0, orderedQuantity: 0, threshold: 0, categoryId: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (item) {
        await axios.put(`${API_URL}/inventory/${item.id}`, formData);
      } else {
        await axios.post(`${API_URL}/inventory`, formData);
      }
      onSave();
    } catch (error) { console.error('Error saving item:', error); alert('Erreur lors de la sauvegarde'); }
  };

  const labels = {
    fr: { titleAdd: 'Ajouter un article', titleEdit: "Modifier l'article", imageUrl: 'URL Image', designationFr: 'Désignation (Français)', designationIt: 'Designazione (Italiano)', designationEn: 'Designation (English)', category: 'Catégorie', noCategory: 'Aucune catégorie', quantity: 'Quantité', orderedQuantity: 'Quantité Commandée', threshold: 'Seuil', cancel: 'Annuler', create: 'Créer', update: 'Mettre à jour' },
    it: { titleAdd: 'Aggiungi articolo', titleEdit: 'Modifica articolo', imageUrl: 'URL Immagine', designationFr: 'Désignation (Français)', designationIt: 'Designazione (Italiano)', designationEn: 'Designation (English)', category: 'Categoria', noCategory: 'Nessuna categoria', quantity: 'Quantità', orderedQuantity: 'Quantità Ordinata', threshold: 'Soglia', cancel: 'Annulla', create: 'Crea', update: 'Aggiorna' },
    en: { titleAdd: 'Add item', titleEdit: 'Edit item', imageUrl: 'Image URL', designationFr: 'Désignation (Français)', designationIt: 'Designazione (Italiano)', designationEn: 'Designation (English)', category: 'Category', noCategory: 'No category', quantity: 'Quantity', orderedQuantity: 'Ordered Quantity', threshold: 'Threshold', cancel: 'Cancel', create: 'Create', update: 'Update' },
  };
  const t = labels[language] || labels.fr;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal large" onClick={(e) => e.stopPropagation()}>
        <h2>{item ? t.titleEdit : t.titleAdd}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group"><label>{t.imageUrl}</label>
            <input type="url" value={formData.image} onChange={(e) => setFormData({ ...formData, image: e.target.value })} />
          </div>
          <div className="form-group"><label>{t.designationFr}</label>
            <input type="text" required value={formData.designation.fr} onChange={(e) => setFormData({ ...formData, designation: { ...formData.designation, fr: e.target.value } })} />
          </div>
          <div className="form-group"><label>{t.designationIt}</label>
            <input type="text" required value={formData.designation.it} onChange={(e) => setFormData({ ...formData, designation: { ...formData.designation, it: e.target.value } })} />
          </div>
          <div className="form-group"><label>{t.designationEn}</label>
            <input type="text" required value={formData.designation.en} onChange={(e) => setFormData({ ...formData, designation: { ...formData.designation, en: e.target.value } })} />
          </div>
          <div className="form-group"><label>{t.category}</label>
            <select value={formData.categoryId} onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}>
              <option value="">{t.noCategory}</option>
              {categories.map(cat => (<option key={cat.id} value={cat.id}>{cat.name[language]}</option>))}
            </select>
          </div>
          <div className="form-row">
            <div className="form-group"><label>{t.quantity}</label>
              <input type="number" required min="0" step="1" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="form-group"><label>{t.orderedQuantity}</label>
              <input type="number" required min="0" step="1" value={formData.orderedQuantity} onChange={(e) => setFormData({ ...formData, orderedQuantity: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="form-group"><label>{t.threshold}</label>
              <input type="number" required min="0" step="1" value={formData.threshold} onChange={(e) => setFormData({ ...formData, threshold: parseInt(e.target.value) || 0 })} />
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose}>{t.cancel}</button>
            <button type="submit" className="primary">{item ? t.update : t.create}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default InventoryPage;