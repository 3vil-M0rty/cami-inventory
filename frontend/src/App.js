import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './InventoryApp.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

function InventoryApp() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [filter, setFilter] = useState('all'); // 'all' or 'low-stock'
  const [language, setLanguage] = useState('fr');
  const [loading, setLoading] = useState(true);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Fetch categories
  useEffect(() => {
    fetchCategories();
  }, []);

  // Fetch items based on filters
  useEffect(() => {
    fetchItems();
  }, [selectedCategory, filter]);

  const fetchCategories = async () => {
    try {
      const response = await axios.get(`${API_URL}/categories`);
      setCategories(response.data);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
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
      
      // Apply additional filtering if needed
      let filteredItems = response.data;
      
      if (filter === 'low-stock' && selectedCategory !== 'all') {
        filteredItems = filteredItems.filter(item => 
          item.categoryId?._id === selectedCategory || item.categoryId?.id === selectedCategory
        );
      }
      
      setItems(filteredItems);
    } catch (error) {
      console.error('Error fetching items:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateQuantity = async (itemId, amount) => {
    try {
      const response = await axios.patch(`${API_URL}/inventory/${itemId}/quantity`, {
        amount
      });
      
      // Update the item in the list
      setItems(items.map(item => 
        item.id === itemId ? response.data : item
      ));
    } catch (error) {
      console.error('Error updating quantity:', error);
      alert('Erreur lors de la mise à jour de la quantité');
    }
  };

  const deleteItem = async (itemId) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cet article?')) {
      return;
    }
    
    try {
      await axios.delete(`${API_URL}/inventory/${itemId}`);
      setItems(items.filter(item => item.id !== itemId));
    } catch (error) {
      console.error('Error deleting item:', error);
      alert('Erreur lors de la suppression');
    }
  };

  const deleteCategory = async (categoryId) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cette catégorie? Les articles ne seront pas supprimés.')) {
      return;
    }
    
    try {
      await axios.delete(`${API_URL}/categories/${categoryId}`);
      setCategories(categories.filter(cat => cat.id !== categoryId));
      if (selectedCategory === categoryId) {
        setSelectedCategory('all');
      }
    } catch (error) {
      console.error('Error deleting category:', error);
      alert('Erreur lors de la suppression de la catégorie');
    }
  };

  const translations = {
    fr: {
      title: 'Inventaire Aluminium',
      allItems: 'Tout afficher',
      lowStock: 'Stock faible uniquement',
      addCategory: 'Ajouter catégorie',
      addItem: 'Ajouter article',
      quantity: 'Quantité',
      threshold: 'Seuil',
      actions: 'Actions',
      noItems: 'Aucun article trouvé',
      loading: 'Chargement...',
      category: 'Catégorie'
    },
    it: {
      title: 'Inventario Alluminio',
      allItems: 'Mostra tutto',
      lowStock: 'Solo scorte basse',
      addCategory: 'Aggiungi categoria',
      addItem: 'Aggiungi articolo',
      quantity: 'Quantità',
      threshold: 'Soglia',
      actions: 'Azioni',
      noItems: 'Nessun articolo trovato',
      loading: 'Caricamento...',
      category: 'Categoria'
    },
    en: {
      title: 'Aluminum Inventory',
      allItems: 'Show all',
      lowStock: 'Low stock only',
      addCategory: 'Add category',
      addItem: 'Add item',
      quantity: 'Quantity',
      threshold: 'Threshold',
      actions: 'Actions',
      noItems: 'No items found',
      loading: 'Loading...',
      category: 'Category'
    }
  };

  const t = translations[language];

  return (
    <div className="inventory-app">
      <header className="header">
        <h1>{t.title}</h1>
        <div className="language-selector">
          <button 
            className={language === 'fr' ? 'active' : ''} 
            onClick={() => setLanguage('fr')}
          >
            FR
          </button>
          <button 
            className={language === 'it' ? 'active' : ''} 
            onClick={() => setLanguage('it')}
          >
            IT
          </button>
          <button 
            className={language === 'en' ? 'active' : ''} 
            onClick={() => setLanguage('en')}
          >
            EN
          </button>
        </div>
      </header>

      <div className="controls">
        <div className="filter-buttons">
          {/* Main filters */}
          <button
            className={`filter-btn ${filter === 'all' && selectedCategory === 'all' ? 'active' : ''}`}
            onClick={() => {
              setFilter('all');
              setSelectedCategory('all');
            }}
          >
            {t.allItems}
          </button>
          <button
            className={`filter-btn ${filter === 'low-stock' ? 'active low-stock' : ''}`}
            onClick={() => setFilter(filter === 'low-stock' ? 'all' : 'low-stock')}
          >
            {t.lowStock}
          </button>

          {/* Category filters */}
          {categories.map(category => (
            <div key={category.id} className="category-btn-wrapper">
              <button
                className={`filter-btn category-btn ${selectedCategory === category.id ? 'active' : ''}`}
                style={{
                  '--category-color': category.color,
                  borderColor: selectedCategory === category.id ? category.color : '#ddd'
                }}
                onClick={() => {
                  setSelectedCategory(selectedCategory === category.id ? 'all' : category.id);
                  if (filter !== 'all' && selectedCategory !== category.id) {
                    // Keep the filter active when switching categories
                  }
                }}
              >
                <span className="category-dot" style={{ backgroundColor: category.color }}></span>
                {category.name[language]}
              </button>
              <button
                className="delete-category-btn"
                onClick={() => deleteCategory(category.id)}
                title="Supprimer la catégorie"
              >
                ×
              </button>
            </div>
          ))}

          <button
            className="filter-btn add-category-btn"
            onClick={() => setShowAddCategory(true)}
          >
            + {t.addCategory}
          </button>
        </div>

        <button className="add-item-btn" onClick={() => setShowAddItem(true)}>
          + {t.addItem}
        </button>
      </div>

      {loading ? (
        <div className="loading">{t.loading}</div>
      ) : items.length === 0 ? (
        <div className="no-items">{t.noItems}</div>
      ) : (
        <div className="items-grid">
          {items.map(item => (
            <ItemCard
              key={item.id}
              item={item}
              language={language}
              onUpdateQuantity={updateQuantity}
              onDelete={deleteItem}
              onEdit={setEditingItem}
            />
          ))}
        </div>
      )}

      {showAddCategory && (
        <CategoryModal
          language={language}
          onClose={() => setShowAddCategory(false)}
          onSave={() => {
            fetchCategories();
            setShowAddCategory(false);
          }}
        />
      )}

      {showAddItem && (
        <ItemModal
          language={language}
          categories={categories}
          onClose={() => setShowAddItem(false)}
          onSave={() => {
            fetchItems();
            setShowAddItem(false);
          }}
        />
      )}

      {editingItem && (
        <ItemModal
          language={language}
          categories={categories}
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSave={() => {
            fetchItems();
            setEditingItem(null);
          }}
        />
      )}
    </div>
  );
}

function ItemCard({ item, language, onUpdateQuantity, onDelete, onEdit }) {
  const isLowStock = item.quantity < item.threshold;
  const categoryColor = item.categoryId?.color || '#gray';

  return (
    <div className={`item-card ${isLowStock ? 'low-stock' : ''}`}>
      {item.image && (
        <div className="item-image">
          <img src={item.image} alt={item.designation[language]} />
        </div>
      )}
      
      {item.categoryId && (
        <div className="item-category" style={{ backgroundColor: categoryColor }}>
          {item.categoryId.name[language]}
        </div>
      )}

      <div className="item-content">
        <h3>{item.designation[language]}</h3>
        
        <div className="quantity-section">
          <div className="quantity-display">
            <span className="quantity-label">Quantité:</span>
            <span className={`quantity-value ${isLowStock ? 'low' : ''}`}>
              {item.quantity}
            </span>
          </div>
          <div className="threshold-display">
            <span className="threshold-label">Seuil:</span>
            <span className="threshold-value">{item.threshold}</span>
          </div>
        </div>

        {isLowStock && (
          <div className="low-stock-warning">
            ⚠️ Stock faible
          </div>
        )}

        <div className="quantity-controls">
          <button
            className="qty-btn minus"
            onClick={() => onUpdateQuantity(item.id, -1)}
          >
            −
          </button>
          <button
            className="qty-btn plus"
            onClick={() => onUpdateQuantity(item.id, 1)}
          >
            +
          </button>
        </div>

        <div className="item-actions">
          <button className="edit-btn" onClick={() => onEdit(item)}>
            ✏️ Modifier
          </button>
          <button className="delete-btn" onClick={() => onDelete(item.id)}>
            🗑️ Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}

function CategoryModal({ language, onClose, onSave }) {
  const [formData, setFormData] = useState({
    name: { it: '', fr: '', en: '' },
    color: '#3b82f6'
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/categories`, formData);
      onSave();
    } catch (error) {
      console.error('Error creating category:', error);
      alert('Erreur lors de la création de la catégorie');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Ajouter une catégorie</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nom (Français)</label>
            <input
              type="text"
              required
              value={formData.name.fr}
              onChange={(e) => setFormData({
                ...formData,
                name: { ...formData.name, fr: e.target.value }
              })}
            />
          </div>
          <div className="form-group">
            <label>Nome (Italiano)</label>
            <input
              type="text"
              required
              value={formData.name.it}
              onChange={(e) => setFormData({
                ...formData,
                name: { ...formData.name, it: e.target.value }
              })}
            />
          </div>
          <div className="form-group">
            <label>Name (English)</label>
            <input
              type="text"
              required
              value={formData.name.en}
              onChange={(e) => setFormData({
                ...formData,
                name: { ...formData.name, en: e.target.value }
              })}
            />
          </div>
          <div className="form-group">
            <label>Couleur</label>
            <input
              type="color"
              value={formData.color}
              onChange={(e) => setFormData({ ...formData, color: e.target.value })}
            />
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose}>Annuler</button>
            <button type="submit" className="primary">Créer</button>
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
    threshold: item.threshold,
    categoryId: item.categoryId?.id || item.categoryId?._id || ''
  } : {
    image: '',
    designation: { it: '', fr: '', en: '' },
    quantity: 0,
    threshold: 0,
    categoryId: ''
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
    } catch (error) {
      console.error('Error saving item:', error);
      alert('Erreur lors de la sauvegarde');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal large" onClick={(e) => e.stopPropagation()}>
        <h2>{item ? 'Modifier l\'article' : 'Ajouter un article'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Image URL</label>
            <input
              type="url"
              value={formData.image}
              onChange={(e) => setFormData({ ...formData, image: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Désignation (Français)</label>
            <input
              type="text"
              required
              value={formData.designation.fr}
              onChange={(e) => setFormData({
                ...formData,
                designation: { ...formData.designation, fr: e.target.value }
              })}
            />
          </div>
          <div className="form-group">
            <label>Designazione (Italiano)</label>
            <input
              type="text"
              required
              value={formData.designation.it}
              onChange={(e) => setFormData({
                ...formData,
                designation: { ...formData.designation, it: e.target.value }
              })}
            />
          </div>
          <div className="form-group">
            <label>Designation (English)</label>
            <input
              type="text"
              required
              value={formData.designation.en}
              onChange={(e) => setFormData({
                ...formData,
                designation: { ...formData.designation, en: e.target.value }
              })}
            />
          </div>
          <div className="form-group">
            <label>Catégorie</label>
            <select
              value={formData.categoryId}
              onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
            >
              <option value="">Aucune catégorie</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.name[language]}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Quantité</label>
              <input
                type="number"
                required
                min="0"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) })}
              />
            </div>
            <div className="form-group">
              <label>Seuil</label>
              <input
                type="number"
                required
                min="0"
                value={formData.threshold}
                onChange={(e) => setFormData({ ...formData, threshold: parseInt(e.target.value) })}
              />
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose}>Annuler</button>
            <button type="submit" className="primary">
              {item ? 'Mettre à jour' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default InventoryApp;