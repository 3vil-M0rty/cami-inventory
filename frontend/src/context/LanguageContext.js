import { createContext, useContext, useState, useCallback } from 'react';

/**
 * Language Context
 * 
 * Complete internationalization with full translation coverage
 * Supported languages: Italian (default), French, English
 */

const LanguageContext = createContext(null);

export const LANGUAGES = {
  IT: 'it',
  FR: 'fr',
  EN: 'en'
};

export const LANGUAGE_LABELS = {
  [LANGUAGES.IT]: 'Italiano',
  [LANGUAGES.FR]: 'Français',
  [LANGUAGES.EN]: 'English'
};

// Complete UI translations for the application
const translations = {
  [LANGUAGES.IT]: {
    // Navigation & Layout
    appTitle: 'CAMI ALUMINIUM',
    appSubtitle: 'Sistema di Gestione Inventario',
    
    // Inventory Table Headers
    image: 'Immagine',
    designation: 'Designazione',
    quantity: 'Quantità',
    orderedQuantity: 'Quantità Ordinata',
    threshold: 'Soglia',
    status: 'Stato',
    actions: 'Azioni',
    category: 'Categoria',
    
    // Status
    inStock: 'Disponibile',
    lowStock: 'Scorte Basse',
    criticalStock: 'Stock Critico',
    warningStock: 'Avviso Stock',
    
    // Actions
    edit: 'Modifica',
    delete: 'Elimina',
    add: 'Aggiungi',
    cancel: 'Annulla',
    save: 'Salva',
    confirm: 'Conferma',
    search: 'Cerca',
    exportExcel: 'Esporta Excel',
    
    // Forms
    addNewItem: 'Aggiungi Nuova Barra',
    editItem: 'Modifica Barra',
    imageUrl: 'URL Immagine',
    designationIt: 'Designazione (IT)',
    designationFr: 'Designazione (FR)',
    designationEn: 'Designazione (EN)',
    quantityLabel: 'Quantità',
    orderedQuantityLabel: 'Quantità Ordinata',
    thresholdLabel: 'Soglia Minima',
    categoryLabel: 'Categoria',
    noCategory: 'Nessuna Categoria',
    
    // Filters
    allItems: 'Mostra Tutto',
    showAll: 'Mostra Tutto',
    showLowStock: 'Solo Scorte Basse',
    searchPlaceholder: 'Cerca per designazione...',
    
    // Categories
    addCategory: 'Aggiungi Categoria',
    editCategory: 'Modifica Categoria',
    deleteCategory: 'Elimina Categoria',
    categoryName: 'Nome Categoria',
    categoryColor: 'Colore',
    
    // Notifications
    lowStockAlert: 'Avviso Scorte Basse',
    itemsBelowThreshold: 'articoli sotto la soglia minima',
    noLowStock: 'Tutte le scorte sono sopra la soglia',
    
    // Delete Confirmation
    deleteConfirmTitle: 'Conferma Eliminazione',
    deleteConfirmMessage: 'Sei sicuro di voler eliminare questo articolo? Questa azione non può essere annullata.',
    deleteCategoryConfirmMessage: 'Sei sicuro di voler eliminare questa categoria? Gli articoli non saranno eliminati.',
    
    // Empty States
    noItems: 'Nessun articolo trovato',
    noItemsDescription: 'Inizia aggiungendo il tuo primo articolo all\'inventario',
    loading: 'Caricamento...',
    
    // Validation
    requiredField: 'Campo obbligatorio',
    invalidNumber: 'Inserisci un numero valido',
    
    // Success Messages
    itemAdded: 'Articolo aggiunto con successo',
    itemUpdated: 'Articolo aggiornato con successo',
    itemDeleted: 'Articolo eliminato con successo',
    
    // Modal Actions
    create: 'Crea',
    update: 'Aggiorna',
    close: 'Chiudi',
    
    // Excel Export
    exporting: 'Esportazione...',
    exportSuccess: 'Excel esportato con successo',
    exportError: 'Errore durante l\'esportazione',
    
    // Stock Status Messages
    stockCritical: 'Stock critico - ordina immediatamente',
    stockWarning: 'Stock in avviso - verifica ordini',
    stockOk: 'Stock sufficiente'
  },
  
  [LANGUAGES.FR]: {
    // Navigation & Layout
    appTitle: 'CAMI ALUMINIUM',
    appSubtitle: 'Système de Gestion d\'Inventaire',
    
    // Inventory Table Headers
    image: 'Image',
    designation: 'Désignation',
    quantity: 'Quantité',
    orderedQuantity: 'Quantité Commandée',
    threshold: 'Seuil',
    status: 'Statut',
    actions: 'Actions',
    category: 'Catégorie',
    
    // Status
    inStock: 'En Stock',
    lowStock: 'Stock Faible',
    criticalStock: 'Stock Critique',
    warningStock: 'Alerte Stock',
    
    // Actions
    edit: 'Modifier',
    delete: 'Supprimer',
    add: 'Ajouter',
    cancel: 'Annuler',
    save: 'Enregistrer',
    confirm: 'Confirmer',
    search: 'Rechercher',
    exportExcel: 'Exporter Excel',
    
    // Forms
    addNewItem: 'Ajouter Nouvelle Barre',
    editItem: 'Modifier Barre',
    imageUrl: 'URL Image',
    designationIt: 'Désignation (IT)',
    designationFr: 'Désignation (FR)',
    designationEn: 'Désignation (EN)',
    quantityLabel: 'Quantité',
    orderedQuantityLabel: 'Quantité Commandée',
    thresholdLabel: 'Seuil Minimum',
    categoryLabel: 'Catégorie',
    noCategory: 'Aucune Catégorie',
    
    // Filters
    allItems: 'Tout Afficher',
    showAll: 'Tout Afficher',
    showLowStock: 'Stock Faible Uniquement',
    searchPlaceholder: 'Rechercher par désignation...',
    
    // Categories
    addCategory: 'Ajouter Catégorie',
    editCategory: 'Modifier Catégorie',
    deleteCategory: 'Supprimer Catégorie',
    categoryName: 'Nom de la Catégorie',
    categoryColor: 'Couleur',
    
    // Notifications
    lowStockAlert: 'Alerte Stock Faible',
    itemsBelowThreshold: 'articles en dessous du seuil',
    noLowStock: 'Tous les stocks sont au-dessus du seuil',
    
    // Delete Confirmation
    deleteConfirmTitle: 'Confirmer Suppression',
    deleteConfirmMessage: 'Êtes-vous sûr de vouloir supprimer cet article? Cette action est irréversible.',
    deleteCategoryConfirmMessage: 'Êtes-vous sûr de vouloir supprimer cette catégorie? Les articles ne seront pas supprimés.',
    
    // Empty States
    noItems: 'Aucun article trouvé',
    noItemsDescription: 'Commencez par ajouter votre premier article à l\'inventaire',
    loading: 'Chargement...',
    
    // Validation
    requiredField: 'Champ obligatoire',
    invalidNumber: 'Entrez un nombre valide',
    
    // Success Messages
    itemAdded: 'Article ajouté avec succès',
    itemUpdated: 'Article mis à jour avec succès',
    itemDeleted: 'Article supprimé avec succès',
    
    // Modal Actions
    create: 'Créer',
    update: 'Mettre à jour',
    close: 'Fermer',
    
    // Excel Export
    exporting: 'Exportation...',
    exportSuccess: 'Excel exporté avec succès',
    exportError: 'Erreur lors de l\'exportation',
    
    // Stock Status Messages
    stockCritical: 'Stock critique - commander immédiatement',
    stockWarning: 'Stock en alerte - vérifier les commandes',
    stockOk: 'Stock suffisant'
  },
  
  [LANGUAGES.EN]: {
    // Navigation & Layout
    appTitle: 'CAMI ALUMINIUM',
    appSubtitle: 'Inventory Management System',
    
    // Inventory Table Headers
    image: 'Image',
    designation: 'Designation',
    quantity: 'Quantity',
    orderedQuantity: 'Ordered Quantity',
    threshold: 'Threshold',
    status: 'Status',
    actions: 'Actions',
    category: 'Category',
    
    // Status
    inStock: 'In Stock',
    lowStock: 'Low Stock',
    criticalStock: 'Critical Stock',
    warningStock: 'Warning Stock',
    
    // Actions
    edit: 'Edit',
    delete: 'Delete',
    add: 'Add',
    cancel: 'Cancel',
    save: 'Save',
    confirm: 'Confirm',
    search: 'Search',
    exportExcel: 'Export Excel',
    
    // Forms
    addNewItem: 'Add New Bar',
    editItem: 'Edit Bar',
    imageUrl: 'Image URL',
    designationIt: 'Designation (IT)',
    designationFr: 'Designation (FR)',
    designationEn: 'Designation (EN)',
    quantityLabel: 'Quantity',
    orderedQuantityLabel: 'Ordered Quantity',
    thresholdLabel: 'Minimum Threshold',
    categoryLabel: 'Category',
    noCategory: 'No Category',
    
    // Filters
    allItems: 'Show All',
    showAll: 'Show All',
    showLowStock: 'Low Stock Only',
    searchPlaceholder: 'Search by designation...',
    
    // Categories
    addCategory: 'Add Category',
    editCategory: 'Edit Category',
    deleteCategory: 'Delete Category',
    categoryName: 'Category Name',
    categoryColor: 'Color',
    
    // Notifications
    lowStockAlert: 'Low Stock Alert',
    itemsBelowThreshold: 'items below threshold',
    noLowStock: 'All stock levels are above threshold',
    
    // Delete Confirmation
    deleteConfirmTitle: 'Confirm Deletion',
    deleteConfirmMessage: 'Are you sure you want to delete this item? This action cannot be undone.',
    deleteCategoryConfirmMessage: 'Are you sure you want to delete this category? Items will not be deleted.',
    
    // Empty States
    noItems: 'No items found',
    noItemsDescription: 'Start by adding your first item to the inventory',
    loading: 'Loading...',
    
    // Validation
    requiredField: 'Required field',
    invalidNumber: 'Enter a valid number',
    
    // Success Messages
    itemAdded: 'Item added successfully',
    itemUpdated: 'Item updated successfully',
    itemDeleted: 'Item deleted successfully',
    
    // Modal Actions
    create: 'Create',
    update: 'Update',
    close: 'Close',
    
    // Excel Export
    exporting: 'Exporting...',
    exportSuccess: 'Excel exported successfully',
    exportError: 'Error during export',
    
    // Stock Status Messages
    stockCritical: 'Critical stock - order immediately',
    stockWarning: 'Warning stock - check orders',
    stockOk: 'Sufficient stock'
  }
};

export const LanguageProvider = ({ children }) => {
  const [currentLanguage, setCurrentLanguage] = useState(LANGUAGES.FR);

  const changeLanguage = useCallback((lang) => {
    if (Object.values(LANGUAGES).includes(lang)) {
      setCurrentLanguage(lang);
    }
  }, []);

  const t = useCallback((key) => {
    return translations[currentLanguage]?.[key] || key;
  }, [currentLanguage]);

  const value = {
    currentLanguage,
    changeLanguage,
    t,
    languages: LANGUAGES,
    languageLabels: LANGUAGE_LABELS
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  
  return context;
};

export default LanguageContext;