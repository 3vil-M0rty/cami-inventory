// components/RalPicker.jsx
import { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

export default function RalPicker({ language, value, colorValue, onChange, t }) {
  const [poudres, setPoudres] = useState([]);
  const [loading, setLoading] = useState(true);
  const [manualMode, setManualMode] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    axios.get(`${API_URL}/inventory/poudres`)
      .then(r => { setPoudres(r.data); if (r.data.length === 0) setManualMode(true); })
      .catch(() => setManualMode(true))
      .finally(() => setLoading(false));
  }, []);

  const filtered = poudres.filter(p => {
    const name = p.designation[language] || p.designation.fr || '';
    return !search || name.toLowerCase().includes(search.toLowerCase());
  });

  const selectedPoudre = poudres.find(p => {
    const name = p.designation[language] || p.designation.fr || '';
    return name === value;
  });

  if (loading) return <div className="ral-picker__loading">Chargement des poudres...</div>;

  if (manualMode || poudres.length === 0) {
    return (
      <div className="ral-picker ral-picker--manual">
        <div className="form-row" style={{ gap: 8 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <input
              type="text"
              required
              placeholder="RAL 9010"
              value={value}
              onChange={e => onChange({ ralCode: e.target.value, ralColor: colorValue })}
            />
          </div>
          <div className="form-group" style={{ flex: 'none' }}>
            <input
              type="color"
              value={colorValue}
              onChange={e => onChange({ ralCode: value, ralColor: e.target.value })}
              style={{ width: 48, height: 38, padding: 2 }}
            />
          </div>
        </div>
        {poudres.length > 0 && (
          <button type="button" className="ral-picker__switch-btn" onClick={() => setManualMode(false)}>
            ← {t('ralPickerSwitch') || 'Choisir depuis les poudres'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="ral-picker">
      {selectedPoudre ? (
        <div className="ral-picker__selected">
          <span className="ral-picker__swatch" style={{ background: colorValue }} />
          <span className="ral-picker__selected-name">
            {selectedPoudre.designation[language] || selectedPoudre.designation.fr}
          </span>
          <button type="button" className="ral-picker__clear-btn"
            onClick={() => onChange({ ralCode: '', ralColor: '#ffffff' })}>✕</button>
        </div>
      ) : (
        <div className="ral-picker__placeholder">
          <span style={{ color: '#9ca3af', fontSize: 13 }}>
            {t('ralPickerPlaceholder') || '— Sélectionner une poudre —'}
          </span>
        </div>
      )}

      <div className="ral-picker__search-wrap">
        <input
          type="text"
          className="ral-picker__search"
          placeholder={t('searchPlaceholder') || 'Rechercher...'}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="ral-picker__list">
        {filtered.length === 0 ? (
          <div className="ral-picker__empty">{t('noItems') || 'Aucun résultat'}</div>
        ) : filtered.map(p => {
          const name = p.designation[language] || p.designation.fr;
          const isActive = value === name;
          const swatchColor = p.categoryId?.color || '#e5e7eb';
          return (
            <button
              key={p.id}
              type="button"
              className={`ral-picker__option ${isActive ? 'active' : ''}`}
              onClick={() => { onChange({ ralCode: name, ralColor: swatchColor }); setSearch(''); }}
            >
              {p.image
                ? <img src={p.image} alt="" className="ral-picker__option-img" />
                : <span className="ral-picker__option-swatch" style={{ background: swatchColor }} />
              }
              <span className="ral-picker__option-name">{name}</span>
              <span className="ral-picker__option-stock">
                {t('inStock') || 'En stock'}: {p.quantity}
              </span>
              {isActive && <span className="ral-picker__checkmark">✓</span>}
            </button>
          );
        })}
      </div>

      <button type="button" className="ral-picker__switch-btn" onClick={() => setManualMode(true)}>
        {t('ralPickerManual') || 'Saisir manuellement'}
      </button>
    </div>
  );
}