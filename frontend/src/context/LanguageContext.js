import { createContext, useContext, useState, useCallback } from 'react';

/**
 * Language Context — extended with project navigation keys
 */

const LanguageContext = createContext(null);

export const LANGUAGES = { IT: 'it', FR: 'fr', EN: 'en' };
export const LANGUAGE_LABELS = {
  [LANGUAGES.IT]: 'Italiano',
  [LANGUAGES.FR]: 'Français',
  [LANGUAGES.EN]: 'English'
};

const translations = {
  [LANGUAGES.FR]: {
    appTitle: 'CAMI ALUMINIUM',
    appSubtitle: 'Système de Gestion d\'Inventaire',
    // ← NEW: navigation
    navInventory: 'Inventaire',
    navProjects:  'Projets',
    // inventory (unchanged)
    image: 'Image', designation: 'Désignation', quantity: 'Quantité',
    orderedQuantity: 'Qté Commandée', threshold: 'Seuil', status: 'Statut',
    actions: 'Actions', inStock: 'En Stock', lowStock: 'Stock Faible',
    criticalStock: 'Stock Critique', warningStock: 'Alerte Stock',
    edit: 'Modifier', delete: 'Supprimer', add: 'Ajouter',
    cancel: 'Annuler', save: 'Enregistrer', confirm: 'Confirmer',
    addNewItem: 'Ajouter Barre', editItem: 'Modifier Barre',
    imageUrl: 'URL Image', designationIt: 'Désignation (IT)',
    designationFr: 'Désignation (FR)', designationEn: 'Désignation (EN)',
    quantityLabel: 'Quantité', orderedQuantityLabel: 'Qté Commandée',
    thresholdLabel: 'Seuil Minimum', categoryLabel: 'Catégorie',
    noCategory: 'Aucune Catégorie', showAll: 'Tout Afficher',
    showLowStock: 'Stock Faible Uniquement',
    searchPlaceholder: 'Rechercher par désignation...',
    addCategory: 'Ajouter Catégorie', deleteConfirmTitle: 'Confirmer Suppression',
    deleteConfirmMessage: 'Êtes-vous sûr de vouloir supprimer cet article?',
    deleteCategoryConfirmMessage: 'Êtes-vous sûr de vouloir supprimer cette catégorie?',
    noItems: 'Aucun article trouvé',
    noItemsDescription: 'Commencez par ajouter votre premier article',
    requiredField: 'Champ obligatoire', invalidNumber: 'Entrez un nombre valide',
    itemAdded: 'Article ajouté', itemUpdated: 'Article mis à jour',
    itemDeleted: 'Article supprimé', create: 'Créer', update: 'Mettre à jour',
    close: 'Fermer', exporting: 'Exportation...', exportExcel: 'Exporter Excel',
    exportSuccess: 'Excel exporté', exportError: 'Erreur exportation',
  },
  [LANGUAGES.IT]: {
    appTitle: 'CAMI ALUMINIUM',
    appSubtitle: 'Sistema di Gestione Inventario',
    navInventory: 'Inventario',
    navProjects:  'Progetti',
    image: 'Immagine', designation: 'Designazione', quantity: 'Quantità',
    orderedQuantity: 'Qta Ordinata', threshold: 'Soglia', status: 'Stato',
    actions: 'Azioni', inStock: 'Disponibile', lowStock: 'Scorte Basse',
    criticalStock: 'Stock Critico', warningStock: 'Avviso Stock',
    edit: 'Modifica', delete: 'Elimina', add: 'Aggiungi',
    cancel: 'Annulla', save: 'Salva', confirm: 'Conferma',
    addNewItem: 'Aggiungi Barra', editItem: 'Modifica Barra',
    imageUrl: 'URL Immagine', designationIt: 'Designazione (IT)',
    designationFr: 'Designazione (FR)', designationEn: 'Designazione (EN)',
    quantityLabel: 'Quantità', orderedQuantityLabel: 'Qta Ordinata',
    thresholdLabel: 'Soglia Minima', categoryLabel: 'Categoria',
    noCategory: 'Nessuna Categoria', showAll: 'Mostra Tutto',
    showLowStock: 'Solo Scorte Basse',
    searchPlaceholder: 'Cerca per designazione...',
    addCategory: 'Aggiungi Categoria', deleteConfirmTitle: 'Conferma Eliminazione',
    deleteConfirmMessage: 'Sei sicuro di voler eliminare questo articolo?',
    deleteCategoryConfirmMessage: 'Sei sicuro di voler eliminare questa categoria?',
    noItems: 'Nessun articolo trovato',
    noItemsDescription: 'Inizia aggiungendo il tuo primo articolo',
    requiredField: 'Campo obbligatorio', invalidNumber: 'Inserisci un numero valido',
    itemAdded: 'Articolo aggiunto', itemUpdated: 'Articolo aggiornato',
    itemDeleted: 'Articolo eliminato', create: 'Crea', update: 'Aggiorna',
    close: 'Chiudi', exporting: 'Esportazione...', exportExcel: 'Esporta Excel',
    exportSuccess: 'Excel esportato', exportError: 'Errore esportazione',
  },
  [LANGUAGES.EN]: {
    appTitle: 'CAMI ALUMINIUM',
    appSubtitle: 'Inventory Management System',
    navInventory: 'Inventory',
    navProjects:  'Projects',
    image: 'Image', designation: 'Designation', quantity: 'Quantity',
    orderedQuantity: 'Ordered Qty', threshold: 'Threshold', status: 'Status',
    actions: 'Actions', inStock: 'In Stock', lowStock: 'Low Stock',
    criticalStock: 'Critical Stock', warningStock: 'Warning Stock',
    edit: 'Edit', delete: 'Delete', add: 'Add',
    cancel: 'Cancel', save: 'Save', confirm: 'Confirm',
    addNewItem: 'Add Bar', editItem: 'Edit Bar',
    imageUrl: 'Image URL', designationIt: 'Designation (IT)',
    designationFr: 'Designation (FR)', designationEn: 'Designation (EN)',
    quantityLabel: 'Quantity', orderedQuantityLabel: 'Ordered Qty',
    thresholdLabel: 'Minimum Threshold', categoryLabel: 'Category',
    noCategory: 'No Category', showAll: 'Show All',
    showLowStock: 'Low Stock Only',
    searchPlaceholder: 'Search by designation...',
    addCategory: 'Add Category', deleteConfirmTitle: 'Confirm Deletion',
    deleteConfirmMessage: 'Are you sure you want to delete this item?',
    deleteCategoryConfirmMessage: 'Are you sure you want to delete this category?',
    noItems: 'No items found',
    noItemsDescription: 'Start by adding your first item to the inventory',
    requiredField: 'Required field', invalidNumber: 'Enter a valid number',
    itemAdded: 'Item added', itemUpdated: 'Item updated',
    itemDeleted: 'Item deleted', create: 'Create', update: 'Update',
    close: 'Close', exporting: 'Exporting...', exportExcel: 'Export Excel',
    exportSuccess: 'Excel exported', exportError: 'Export error',
  }
};

export const LanguageProvider = ({ children }) => {
  const [currentLanguage, setCurrentLanguage] = useState(LANGUAGES.FR);

  const changeLanguage = useCallback((lang) => {
    if (Object.values(LANGUAGES).includes(lang)) setCurrentLanguage(lang);
  }, []);

  const t = useCallback((key) => translations[currentLanguage]?.[key] || key, [currentLanguage]);

  return (
    <LanguageContext.Provider value={{ currentLanguage, changeLanguage, t, languages: LANGUAGES, languageLabels: LANGUAGE_LABELS }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within LanguageProvider');
  return context;
};

export default LanguageContext;
