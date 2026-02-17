import { useState, useEffect } from 'react';
import axios from 'axios';
import { useProjects } from '../../../context/ProjectContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const translations = {
  fr: {
    searchBars: 'Rechercher une barre dans l\'inventaire...',
    addBar: 'Ajouter',
    removeBar: 'Retirer',
    quantity: 'Quantité',
    available: 'Dispo.',
    usedBars: 'Barres utilisées dans ce projet',
    noUsedBars: 'Aucune barre ajoutée',
    searchResults: 'Résultats',
    noResults: 'Aucun résultat',
    totalUsed: 'Total utilisé',
    insufficientStock: 'Stock insuffisant',
    qtyLabel: 'Qté',
  },
  it: {
    searchBars: 'Cerca barra nell\'inventario...',
    addBar: 'Aggiungi',
    removeBar: 'Rimuovi',
    quantity: 'Quantità',
    available: 'Disp.',
    usedBars: 'Barre utilizzate in questo progetto',
    noUsedBars: 'Nessuna barra aggiunta',
    searchResults: 'Risultati',
    noResults: 'Nessun risultato',
    totalUsed: 'Totale utilizzato',
    insufficientStock: 'Stock insufficiente',
    qtyLabel: 'Qtà',
  },
  en: {
    searchBars: 'Search a bar in inventory...',
    addBar: 'Add',
    removeBar: 'Remove',
    quantity: 'Quantity',
    available: 'Avail.',
    usedBars: 'Bars used in this project',
    noUsedBars: 'No bars added yet',
    searchResults: 'Results',
    noResults: 'No results',
    totalUsed: 'Total used',
    insufficientStock: 'Insufficient stock',
    qtyLabel: 'Qty',
  }
};

function UsedBarsPanel({ project, language }) {
  const { addUsedBar, removeUsedBar } = useProjects();
  const t = translations[language];

  const [searchTerm, setSearchTerm]   = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [quantities, setQuantities]   = useState({});   // itemId → qty input
  const [searching, setSearching]     = useState(false);
  const [error, setError]             = useState('');

  // Debounced search
  useEffect(() => {
    if (!searchTerm.trim()) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await axios.get(`${API_URL}/inventory/search?q=${encodeURIComponent(searchTerm)}`);
        setSearchResults(res.data);
      } catch (e) {
        console.error(e);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const handleAdd = async (item) => {
    const qty = Number(quantities[item.id]) || 1;
    if (qty < 1) return;
    setError('');
    const result = await addUsedBar(project.id, item.id, qty);
    if (!result.success) {
      setError(result.error || t.insufficientStock);
    } else {
      setQuantities(prev => ({ ...prev, [item.id]: '' }));
      setSearchTerm('');
      setSearchResults([]);
    }
  };

  const handleRemove = async (itemId) => {
    await removeUsedBar(project.id, itemId);
  };

  // Items already in project keyed by itemId
  const usedMap = {};
  project.usedBars?.forEach(b => {
    usedMap[b.itemId?.id || b.itemId] = b;
  });

  return (
    <div className="used-bars-panel">

      {/* Search */}
      <div className="used-bars-panel__search-section">
        <input
          type="text"
          className="search-input"
          placeholder={t.searchBars}
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
        {error && <p className="used-bars-panel__error">{error}</p>}

        {/* Search results */}
        {searchResults.length > 0 && (
          <div className="used-bars-panel__results">
            <p className="used-bars-panel__results-title">{t.searchResults}</p>
            {searchResults.map(item => (
              <div key={item.id} className="used-bars-panel__result-row">
                <div className="used-bars-panel__result-info">
                  <span className="used-bars-panel__result-name">
                    {item.designation[language]}
                  </span>
                  <span className="used-bars-panel__result-stock">
                    {t.available}: <strong>{item.quantity}</strong>
                  </span>
                </div>
                <div className="used-bars-panel__result-add">
                  <input
                    type="number"
                    min="1"
                    max={item.quantity}
                    placeholder={t.qtyLabel}
                    value={quantities[item.id] || ''}
                    onChange={e => setQuantities(prev => ({ ...prev, [item.id]: e.target.value }))}
                    className="used-bars-panel__qty-input"
                  />
                  <button
                    className="add-item-btn"
                    onClick={() => handleAdd(item)}
                    disabled={item.quantity === 0}
                  >
                    {t.addBar}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {searchTerm && !searching && searchResults.length === 0 && (
          <p className="used-bars-panel__no-results">{t.noResults}</p>
        )}
      </div>

      {/* Used bars table */}
      <div className="used-bars-panel__used-section">
        <h3 className="used-bars-panel__used-title">{t.usedBars}</h3>

        {!project.usedBars?.length ? (
          <div className="no-items">{t.noUsedBars}</div>
        ) : (
          <table className="chassis-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>{t.quantity === 'Quantité' ? 'Désignation' : 'Designation'}</th>
                <th>{t.quantity}</th>
                <th>{t.available}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {project.usedBars.map(bar => {
                const item = bar.itemId;
                if (!item || typeof item !== 'object') return null;
                return (
                  <tr key={item.id || item._id}>
                    <td>{item.designation?.[language]}</td>
                    <td style={{ textAlign: 'center' }}><strong>{bar.quantity}</strong></td>
                    <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                    <td>
                      <button className="delete-btn" onClick={() => handleRemove(item.id || item._id)}>
                        {t.removeBar}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default UsedBarsPanel;
