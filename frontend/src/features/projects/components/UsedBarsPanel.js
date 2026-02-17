import { useState, useEffect } from 'react';
import axios from 'axios';
import { useProjects } from '../../../context/ProjectContext';
import './UsedBarsPanel.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const translations = {
  fr: {
    searchBars: 'Rechercher une barre dans l\'inventaire...',
    addBar: 'Ajouter', removeBar: 'Retirer',
    quantity: 'Quantité', available: 'Disponible',
    usedBars: 'Barres utilisées', noUsedBars: 'Aucune barre ajoutée à ce projet',
    searchResults: 'Résultats', noResults: 'Aucun résultat',
    insufficientStock: 'Stock insuffisant', qtyLabel: 'Qté',
    designation: 'Désignation', qtyUsed: 'Qté utilisée', stockLeft: 'Stock restant',
  },
  it: {
    searchBars: 'Cerca barra nell\'inventario...',
    addBar: 'Aggiungi', removeBar: 'Rimuovi',
    quantity: 'Quantità', available: 'Disponibile',
    usedBars: 'Barre utilizzate', noUsedBars: 'Nessuna barra aggiunta a questo progetto',
    searchResults: 'Risultati', noResults: 'Nessun risultato',
    insufficientStock: 'Stock insufficiente', qtyLabel: 'Qtà',
    designation: 'Designazione', qtyUsed: 'Qtà usata', stockLeft: 'Stock rimanente',
  },
  en: {
    searchBars: 'Search a bar in inventory...',
    addBar: 'Add', removeBar: 'Remove',
    quantity: 'Quantity', available: 'Available',
    usedBars: 'Used bars', noUsedBars: 'No bars added to this project yet',
    searchResults: 'Results', noResults: 'No results',
    insufficientStock: 'Insufficient stock', qtyLabel: 'Qty',
    designation: 'Designation', qtyUsed: 'Qty used', stockLeft: 'Remaining stock',
  }
};

function UsedBarsPanel({ project, language }) {
  const { addUsedBar, removeUsedBar } = useProjects();
  const t = translations[language] || translations.fr;

  const [searchTerm, setSearchTerm]       = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [quantities, setQuantities]       = useState({});
  const [searching, setSearching]         = useState(false);
  const [error, setError]                 = useState('');

  useEffect(() => {
    if (!searchTerm.trim()) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await axios.get(`${API_URL}/inventory/search?q=${encodeURIComponent(searchTerm)}`);
        setSearchResults(res.data);
      } catch (e) { console.error(e); }
      finally { setSearching(false); }
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

  return (
    <div className="used-bars-panel">

      {/* Search */}
      <div className="used-bars-panel__search-section">
        <div className="used-bars-panel__search-wrap">
          <span className="used-bars-panel__search-icon">
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M12.5 12.5L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </span>
          <input
            type="text"
            className="used-bars-panel__search-input"
            placeholder={t.searchBars}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        {error && <p className="used-bars-panel__error">{error}</p>}

        {searchResults.length > 0 && (
          <div className="used-bars-panel__results">
            <p className="used-bars-panel__results-title">
              {t.searchResults} ({searchResults.length})
            </p>
            {searchResults.map(item => (
              <div key={item.id} className="used-bars-panel__result-row">
                <div className="used-bars-panel__result-info">
                  <span className="used-bars-panel__result-name">
                    {item.designation[language] || item.designation.fr}
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
                    step="1"
                    placeholder={t.qtyLabel}
                    value={quantities[item.id] || ''}
                    onChange={e => setQuantities(prev => ({ ...prev, [item.id]: e.target.value }))}
                    className="used-bars-panel__qty-input"
                  />
                  <button
                    className="add-item-btn"
                    style={{ padding: '7px 14px', fontSize: 13 }}
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
        <div className="used-bars-panel__used-header">
          <h3 className="used-bars-panel__used-title">{t.usedBars}</h3>
          <span className="used-bars-panel__count">{project.usedBars?.length || 0}</span>
        </div>

        {!project.usedBars?.length ? (
          <div className="used-bars-panel__empty">{t.noUsedBars}</div>
        ) : (
          <table className="used-bars-table">
            <thead>
              <tr>
                <th>{t.designation}</th>
                <th className="td-center">{t.qtyUsed}</th>
                <th className="td-center">{t.stockLeft}</th>
                <th className="td-right"></th>
              </tr>
            </thead>
            <tbody>
              {project.usedBars.map(bar => {
                const item = bar.itemId;
                if (!item || typeof item !== 'object') return null;
                return (
                  <tr key={item.id || item._id}>
                    <td>{item.designation?.[language] || item.designation?.fr}</td>
                    <td className="td-center">
                      <span className="qty-badge">{bar.quantity}</span>
                    </td>
                    <td className="td-center">
                      <span className="stock-val">{item.quantity}</span>
                    </td>
                    <td className="td-right">
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
