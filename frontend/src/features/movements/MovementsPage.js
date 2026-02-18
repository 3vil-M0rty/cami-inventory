import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useLanguage } from '../../context/LanguageContext';
import './MovementsPage.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const TYPE_META = {
  entree:         { color: '#16a34a', bg: '#f0fdf4', icon: '↑' },
  sortie:         { color: '#ef4444', bg: '#fef2f2', icon: '↓' },
  project_use:    { color: '#3b82f6', bg: '#eff6ff', icon: '↗' },
  project_return: { color: '#f59e0b', bg: '#fffbeb', icon: '↙' },
};

function fmtDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleDateString('fr-FR') + ' ' + date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export default function MovementsPage() {
  const { t, currentLanguage: lang } = useLanguage();

  const [movements, setMovements] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState('all');
  const [fromDate,   setFromDate]   = useState('');
  const [toDate,     setToDate]     = useState('');
  const [search,     setSearch]     = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (fromDate) params.set('from', fromDate);
      if (toDate)   params.set('to',   toDate);
      params.set('limit', '500');
      const res = await axios.get(`${API}/movements?${params}`);
      setMovements(res.data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [typeFilter, fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  const filtered = movements.filter(m => {
    if (!search.trim()) return true;
    const des = m.itemId?.designation?.[lang] || m.itemId?.designation?.fr || '';
    return des.toLowerCase().includes(search.toLowerCase())
      || (m.projectName || '').toLowerCase().includes(search.toLowerCase())
      || (m.note || '').toLowerCase().includes(search.toLowerCase());
  });

  // Summary totals
  const totals = filtered.reduce((acc, m) => {
    acc[m.type] = (acc[m.type] || 0) + m.quantity;
    return acc;
  }, {});

  const typeOptions = [
    { value: 'all',            label: t('mvAll') },
    { value: 'entree',         label: t('mvEntrees') },
    { value: 'sortie',         label: t('mvSorties') },
    { value: 'project_use',    label: t('mvProjectUse') },
    { value: 'project_return', label: t('mvProjectReturn') },
  ];

  return (
    <div className="mv-page">
      <div className="mv-header">
        <h2 className="mv-header__title">{t('navMovements')}</h2>
        <button className="mv-refresh-btn" onClick={load}>↻ {t('refresh')}</button>
      </div>

      {/* Summary chips */}
      <div className="mv-summary">
        {Object.entries(TYPE_META).map(([type, meta]) => (
          <div key={type} className="mv-chip" style={{ borderColor: meta.color, background: meta.bg }}>
            <span className="mv-chip__icon" style={{ color: meta.color }}>{meta.icon}</span>
            <span className="mv-chip__label" style={{ color: meta.color }}>{t(`mv_${type}`) || type}</span>
            <span className="mv-chip__val" style={{ color: meta.color }}>{totals[type] || 0}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="mv-filters">
        <input
          className="mv-search"
          type="text"
          placeholder={t('mvSearch')}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="mv-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          {typeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="mv-dates">
          <input type="date" className="mv-date-input" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          <span className="mv-date-sep">→</span>
          <input type="date" className="mv-date-input" value={toDate}   onChange={e => setToDate(e.target.value)} />
        </div>
        {(fromDate || toDate || typeFilter !== 'all' || search) && (
          <button className="mv-clear-btn" onClick={() => { setFromDate(''); setToDate(''); setTypeFilter('all'); setSearch(''); }}>
            ✕ {t('mvClear')}
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="mv-state">{t('loading')}</div>
      ) : error ? (
        <div className="mv-state mv-state--error">Erreur: {error}</div>
      ) : filtered.length === 0 ? (
        <div className="mv-state">{t('noData')}</div>
      ) : (
        <div className="mv-table-wrap">
          <table className="mv-table">
            <thead>
              <tr>
                <th>{t('mvColDate')}</th>
                <th>{t('mvColType')}</th>
                <th>{t('mvColItem')}</th>
                <th className="td-right">{t('mvColQty')}</th>
                <th className="td-right">{t('mvColBalance')}</th>
                <th>{t('mvColProject')}</th>
                <th>{t('mvColNote')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m, i) => {
                const meta = TYPE_META[m.type] || { color: '#888', bg: '#f9f9f9', icon: '•' };
                const designation = m.itemId?.designation?.[lang] || m.itemId?.designation?.fr || '—';
                return (
                  <tr key={m._id || i}>
                    <td className="mv-col-date">{fmtDate(m.createdAt)}</td>
                    <td>
                      <span className="mv-type-badge" style={{ color: meta.color, background: meta.bg }}>
                        {meta.icon} {t(`mv_${m.type}`) || m.type}
                      </span>
                    </td>
                    <td className="mv-col-item">{designation}</td>
                    <td className="td-right">
                      <span className="mv-qty" style={{ color: meta.color }}>
                        {m.type === 'entree' || m.type === 'project_return' ? '+' : '−'}{m.quantity}
                      </span>
                    </td>
                    <td className="td-right mv-balance">{m.balanceAfter}</td>
                    <td className="mv-col-project">{m.projectName || '—'}</td>
                    <td className="mv-col-note">{m.note || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mv-count">{filtered.length} {t('mvRows')}</div>
        </div>
      )}
    </div>
  );
}
