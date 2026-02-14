import { createContext, useContext, useState, useCallback } from 'react';

/**
 * Language Context
 * 
 * Provides lightweight internationalization without heavy dependencies.
 * Manages current language state and provides translation utilities.
 * 
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

// UI translations for the application
const translations = {
  [LANGUAGES.IT]: {
    // Navigation & Layout
    appTitle: 'CAMI ALUMINIUM',
    appSubtitle: 'Sistema di Gestione Inventario',
    
    // Inventory Table
    image: 'Immagine',
    designation: 'Designazione',
    quantity: 'Quantità',
    threshold: 'Soglia',
    status: 'Stato',
    actions: 'Azioni',
    
    // Status
    inStock: 'Disponibile',
    lowStock: 'Scorte Basse',
    
    // Actions
    edit: 'Modifica',
    delete: 'Elimina',
    add: 'Aggiungi',
    cancel: 'Annulla',
    save: 'Salva',
    confirm: 'Conferma',
    
    // Forms
    addNewItem: 'Aggiungi Nuova Barra',
    editItem: 'Modifica Barra',
    imageUrl: 'URL Immagine',
    designationIt: 'Designazione (IT)',
    designationFr: 'Designazione (FR)',
    designationEn: 'Designazione (EN)',
    quantityLabel: 'Quantità',
    thresholdLabel: 'Soglia Minima',
    
    // Filters
    showAll: 'Mostra Tutto',
    showLowStock: 'Solo Scorte Basse',
    searchPlaceholder: 'Cerca per designazione...',
    
    // Notifications
    lowStockAlert: 'Avviso Scorte Basse',
    itemsBelowThreshold: 'articoli sotto la soglia minima',
    noLowStock: 'Tutte le scorte sono sopra la soglia',
    
    // Delete Confirmation
    deleteConfirmTitle: 'Conferma Eliminazione',
    deleteConfirmMessage: 'Sei sicuro di voler eliminare questo articolo? Questa azione non può essere annullata.',
    
    // Empty States
    noItems: 'Nessun articolo trovato',
    noItemsDescription: 'Inizia aggiungendo il tuo primo articolo all\'inventario',
    
    // Validation
    requiredField: 'Campo obbligatorio',
    invalidNumber: 'Inserisci un numero valido',
    
    // Success Messages
    itemAdded: 'Articolo aggiunto con successo',
    itemUpdated: 'Articolo aggiornato con successo',
    itemDeleted: 'Articolo eliminato con successo'
  },
  
  [LANGUAGES.FR]: {
    // Navigation & Layout
    appTitle: 'CAMI ALUMINIUM',
    appSubtitle: 'Système de Gestion d\'Inventaire',
    
    // Inventory Table
    image: 'Image',
    designation: 'Désignation',
    quantity: 'Quantité',
    threshold: 'Seuil',
    status: 'Statut',
    actions: 'Actions',
    
    // Status
    inStock: 'En Stock',
    lowStock: 'Stock Faible',
    
    // Actions
    edit: 'Modifier',
    delete: 'Supprimer',
    add: 'Ajouter',
    cancel: 'Annuler',
    save: 'Enregistrer',
    confirm: 'Confirmer',
    
    // Forms
    addNewItem: 'Ajouter Nouvelle Barre',
    editItem: 'Modifier Barre',
    imageUrl: 'URL Image',
    designationIt: 'Désignation (IT)',
    designationFr: 'Désignation (FR)',
    designationEn: 'Désignation (EN)',
    quantityLabel: 'Quantité',
    thresholdLabel: 'Seuil Minimum',
    
    // Filters
    showAll: 'Tout Afficher',
    showLowStock: 'Stock Faible Uniquement',
    searchPlaceholder: 'Rechercher par désignation...',
    
    // Notifications
    lowStockAlert: 'Alerte Stock Faible',
    itemsBelowThreshold: 'articles en dessous du seuil',
    noLowStock: 'Tous les stocks sont au-dessus du seuil',
    
    // Delete Confirmation
    deleteConfirmTitle: 'Confirmer Suppression',
    deleteConfirmMessage: 'Êtes-vous sûr de vouloir supprimer cet article? Cette action est irréversible.',
    
    // Empty States
    noItems: 'Aucun article trouvé',
    noItemsDescription: 'Commencez par ajouter votre premier article à l\'inventaire',
    
    // Validation
    requiredField: 'Champ obligatoire',
    invalidNumber: 'Entrez un nombre valide',
    
    // Success Messages
    itemAdded: 'Article ajouté avec succès',
    itemUpdated: 'Article mis à jour avec succès',
    itemDeleted: 'Article supprimé avec succès'
  },
  
  [LANGUAGES.EN]: {
    // Navigation & Layout
    appTitle: 'CAMI ALUMINIUM',
    appSubtitle: 'Inventory Management System',
    
    // Inventory Table
    image: 'Image',
    designation: 'Designation',
    quantity: 'Quantity',
    threshold: 'Threshold',
    status: 'Status',
    actions: 'Actions',
    
    // Status
    inStock: 'In Stock',
    lowStock: 'Low Stock',
    
    // Actions
    edit: 'Edit',
    delete: 'Delete',
    add: 'Add',
    cancel: 'Cancel',
    save: 'Save',
    confirm: 'Confirm',
    
    // Forms
    addNewItem: 'Add New Bar',
    editItem: 'Edit Bar',
    imageUrl: 'Image URL',
    designationIt: 'Designation (IT)',
    designationFr: 'Designation (FR)',
    designationEn: 'Designation (EN)',
    quantityLabel: 'Quantity',
    thresholdLabel: 'Minimum Threshold',
    
    // Filters
    showAll: 'Show All',
    showLowStock: 'Low Stock Only',
    searchPlaceholder: 'Search by designation...',
    
    // Notifications
    lowStockAlert: 'Low Stock Alert',
    itemsBelowThreshold: 'items below threshold',
    noLowStock: 'All stock levels are above threshold',
    
    // Delete Confirmation
    deleteConfirmTitle: 'Confirm Deletion',
    deleteConfirmMessage: 'Are you sure you want to delete this item? This action cannot be undone.',
    
    // Empty States
    noItems: 'No items found',
    noItemsDescription: 'Start by adding your first item to the inventory',
    
    // Validation
    requiredField: 'Required field',
    invalidNumber: 'Enter a valid number',
    
    // Success Messages
    itemAdded: 'Item added successfully',
    itemUpdated: 'Item updated successfully',
    itemDeleted: 'Item deleted successfully'
  }
};

export const LanguageProvider = ({ children }) => {
  const [currentLanguage, setCurrentLanguage] = useState(LANGUAGES.IT);

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
