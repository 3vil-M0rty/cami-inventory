/**
 * Inventory Service - BACKEND VERSION
 * 
 * Connected to Express + MongoDB backend API
 * Shared database across all users
 * WITH QUANTITY UPDATE FEATURE
 */

// API Base URL from environment variable
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

/**
 * GET all inventory items
 */
export const getAllItems = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/inventory`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch inventory');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching inventory:', error);
    throw new Error('Failed to fetch inventory data');
  }
};

/**
 * GET single inventory item by ID
 */
export const getItemById = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/inventory/${id}`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `Item with id ${id} not found`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching item:', error);
    throw error;
  }
};

/**
 * POST create new inventory item
 */
export const createItem = async (itemData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/inventory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(itemData)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create item');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error creating item:', error);
    throw new Error('Failed to create inventory item');
  }
};

/**
 * PUT update existing inventory item
 */
export const updateItem = async (id, itemData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/inventory/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(itemData)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `Failed to update item ${id}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error updating item:', error);
    throw error;
  }
};

/**
 * PATCH update quantity only (NEW FEATURE!)
 * @param {string} id - Item ID
 * @param {number} amount - Amount to add (positive) or subtract (negative)
 */
export const updateQuantity = async (id, amount) => {
  try {
    const response = await fetch(`${API_BASE_URL}/inventory/${id}/quantity`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ amount })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to update quantity');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error updating quantity:', error);
    throw error;
  }
};

/**
 * DELETE inventory item
 */
export const deleteItem = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/inventory/${id}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `Failed to delete item ${id}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error deleting item:', error);
    throw error;
  }
};

/**
 * GET items below threshold
 */
export const getLowStockItems = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/inventory/filter/low-stock`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch low stock items');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching low stock items:', error);
    throw error;
  }
};

/**
 * SEARCH items by designation
 */
export const searchItems = async (searchTerm) => {
  try {
    const url = searchTerm 
      ? `${API_BASE_URL}/inventory/search?q=${encodeURIComponent(searchTerm)}`
      : `${API_BASE_URL}/inventory`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to search items');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error searching items:', error);
    throw error;
  }
};

const inventoryService = {
  getAllItems,
  getItemById,
  createItem,
  updateItem,
  updateQuantity,  // NEW METHOD
  deleteItem,
  getLowStockItems,
  searchItems
};

export default inventoryService;
