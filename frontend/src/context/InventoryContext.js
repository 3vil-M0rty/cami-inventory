import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import inventoryService from '../services/inventoryService';

/**
 * Inventory Context
 * 
 * Centralized state management for inventory data.
 * Handles data fetching, CRUD operations, and derived state.
 * WITH QUANTITY UPDATE FEATURE
 */

const InventoryContext = createContext(null);

export const InventoryProvider = ({ children }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /**
   * Fetch all inventory items on mount
   */
  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await inventoryService.getAllItems();
      setItems(data);
    } catch (err) {
      setError(err.message);
      console.error('Failed to load inventory:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Add new item to inventory
   */
  const addItem = async (itemData) => {
    try {
      const newItem = await inventoryService.createItem(itemData);
      setItems(prevItems => [...prevItems, newItem]);
      return { success: true, item: newItem };
    } catch (err) {
      console.error('Failed to add item:', err);
      return { success: false, error: err.message };
    }
  };

  /**
   * Update existing item
   */
  const updateItem = async (id, itemData) => {
    try {
      const updatedItem = await inventoryService.updateItem(id, itemData);
      setItems(prevItems =>
        prevItems.map(item => item.id === id ? updatedItem : item)
      );
      return { success: true, item: updatedItem };
    } catch (err) {
      console.error('Failed to update item:', err);
      return { success: false, error: err.message };
    }
  };

  /**
   * Update quantity only (NEW FEATURE!)
   * Faster than full update - only changes quantity field
   */
  const updateQuantity = async (id, amount) => {
    try {
      const updatedItem = await inventoryService.updateQuantity(id, amount);
      setItems(prevItems =>
        prevItems.map(item => item.id === id ? updatedItem : item)
      );
      return { success: true, item: updatedItem };
    } catch (err) {
      console.error('Failed to update quantity:', err);
      return { success: false, error: err.message };
    }
  };

  /**
   * Delete item from inventory
   */
  const deleteItem = async (id) => {
    try {
      await inventoryService.deleteItem(id);
      setItems(prevItems => prevItems.filter(item => item.id !== id));
      return { success: true };
    } catch (err) {
      console.error('Failed to delete item:', err);
      return { success: false, error: err.message };
    }
  };

  /**
   * Get items that are below threshold (low stock)
   */
  const getLowStockItems = useCallback(() => {
    return items.filter(item => item.quantity < item.threshold);
  }, [items]);

  /**
   * Get total count of items
   */
  const getTotalCount = useCallback(() => {
    return items.length;
  }, [items]);

  /**
   * Get low stock count
   */
  const getLowStockCount = useCallback(() => {
    return getLowStockItems().length;
  }, [getLowStockItems]);

  const value = {
    // State
    items,
    loading,
    error,
    
    // Actions
    loadItems,
    addItem,
    updateItem,
    updateQuantity,  // NEW ACTION
    deleteItem,
    
    // Computed
    getLowStockItems,
    getTotalCount,
    getLowStockCount
  };

  return (
    <InventoryContext.Provider value={value}>
      {children}
    </InventoryContext.Provider>
  );
};

export const useInventory = () => {
  const context = useContext(InventoryContext);
  
  if (!context) {
    throw new Error('useInventory must be used within InventoryProvider');
  }
  
  return context;
};

export default InventoryContext;
