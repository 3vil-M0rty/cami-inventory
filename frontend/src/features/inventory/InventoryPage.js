import { useState, useMemo } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { useLanguage } from '../../context/LanguageContext';
import useModal from '../../hooks/useModal';
import InventoryTable from './components/InventoryTable';
import InventoryForm from './components/InventoryForm';
import InventoryFilters, { FILTER_TYPES } from './components/InventoryFilters';
import StockNotifications from './components/StockNotifications';
import Modal from '../../components/common/Modal';
import Button from '../../components/common/Button';
import './InventoryPage.css';

/**
 * InventoryPage Component
 * 
 * Main container for inventory management
 * Orchestrates all inventory-related features
 * WITH QUANTITY UPDATE FEATURE
 */

const InventoryPage = () => {
  const { items, loading, addItem, updateItem, deleteItem, updateQuantity } = useInventory();
  const { t } = useLanguage();
  
  const addModal = useModal();
  const editModal = useModal();
  
  const [editingItem, setEditingItem] = useState(null);
  const [activeFilter, setActiveFilter] = useState(FILTER_TYPES.ALL);
  const [searchTerm, setSearchTerm] = useState('');

  /**
   * Filter and search logic
   */
  const filteredItems = useMemo(() => {
    let result = [...items];

    // Apply filter
    if (activeFilter === FILTER_TYPES.LOW_STOCK) {
      result = result.filter(item => item.quantity < item.threshold);
    }

    // Apply search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(item => {
        return Object.values(item.designation).some(designation =>
          designation.toLowerCase().includes(term)
        );
      });
    }

    return result;
  }, [items, activeFilter, searchTerm]);

  /**
   * Handle add item
   */
  const handleAddItem = async (formData) => {
    const result = await addItem(formData);
    if (result.success) {
      addModal.close();
    }
  };

  /**
   * Handle edit item
   */
  const handleEditClick = (item) => {
    setEditingItem(item);
    editModal.open();
  };

  const handleEditSubmit = async (formData) => {
    if (editingItem) {
      const result = await updateItem(editingItem.id, formData);
      if (result.success) {
        editModal.close();
        setEditingItem(null);
      }
    }
  };

  const handleEditCancel = () => {
    editModal.close();
    setEditingItem(null);
  };

  /**
   * Handle delete item
   */
  const handleDeleteItem = async (id) => {
    await deleteItem(id);
  };

  /**
   * Handle quantity update (NEW FEATURE!)
   */
  const handleQuantityUpdate = async (id, amount) => {
    await updateQuantity(id, amount);
  };

  if (loading) {
    return (
      <div className="inventory-page">
        <div className="inventory-page__loading">
          <div className="spinner"></div>
          <p>Loading inventory...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="inventory-page">
      <div className="inventory-page__container">
        {/* Stock Notifications */}
        <StockNotifications />

        {/* Page Header */}
        <div className="inventory-page__header">
          <div className="inventory-page__title-section">
            <h2 className="inventory-page__title">Inventory</h2>
            <div className="inventory-page__stats">
              <span className="stat-badge">
                {items.length} {items.length === 1 ? 'item' : 'items'}
              </span>
            </div>
          </div>
          <Button
            variant="primary"
            onClick={addModal.open}
          >
            + {t('add')}
          </Button>
        </div>

        {/* Filters */}
        <InventoryFilters
          onFilterChange={setActiveFilter}
          onSearchChange={setSearchTerm}
        />

        {/* Inventory Table with Quantity Buttons */}
        <InventoryTable
          items={filteredItems}
          onEdit={handleEditClick}
          onDelete={handleDeleteItem}
          onQuantityUpdate={handleQuantityUpdate}
        />

        {/* Add Item Modal */}
        <Modal
          isOpen={addModal.isOpen}
          onClose={addModal.close}
          title={t('addNewItem')}
          size="large"
        >
          <InventoryForm
            onSubmit={handleAddItem}
            onCancel={addModal.close}
          />
        </Modal>

        {/* Edit Item Modal */}
        <Modal
          isOpen={editModal.isOpen}
          onClose={handleEditCancel}
          title={t('editItem')}
          size="large"
        >
          <InventoryForm
            initialData={editingItem}
            onSubmit={handleEditSubmit}
            onCancel={handleEditCancel}
          />
        </Modal>
      </div>
    </div>
  );
};

export default InventoryPage;
