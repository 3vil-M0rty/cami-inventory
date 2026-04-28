import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useLanguage } from '../../context/LanguageContext';
import './MovementsPage.css';
import { PackageOpen, ChartNetwork } from 'lucide-react';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

/**
 * Format a quantity to at most 2 decimal places, stripping trailing zeros.
 * 102.8000000000001 → "102.8"   |   145.23 → "145.23"   |   100 → "100"
 */
function fmt(val) {
  if (val === null || val === undefined) return '0';
  const n = parseFloat(val);
  if (isNaN(n)) return '0';
  return parseFloat(n.toFixed(2)).toString();
}

const TYPE_META = {
  entree:           { color: '#16a34a', bg: '#f0fdf4', icon: '↑' },
  sortie:           { color: '#ef4444', bg: '#fef2f2', icon: '↓' },
  project_use:      { color: '#f59e0b', bg: '#eff6ff', icon: '↙' },
  project_return:   { color: '#3b82f6', bg: '#fffbeb', icon: '↗' },
  order_reception:  { color: '#d410c4', bg: '#f0fdf4', icon: '↑' },
};

const SUPER_CATS = [
  { key: 'all', labelFr: 'Toutes catégories' },
  { key: 'aluminium', labelFr: '🔩 Aluminium' },
  { key: 'verre', labelFr: '💎 Verre' },
  { key: 'accessoires', labelFr: '🔧 Accessoires' },
  { key: 'poudre', labelFr: '🎨 Poudre' },
];

const GROUP_OPTIONS = [
  { value: 'day', label: 'Jour' },
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
];

function fmtDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleDateString('fr-FR') + ' ' + date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function getPeriodKey(dateStr, groupBy) {
  const d = new Date(dateStr);
  if (groupBy === 'month') {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  if (groupBy === 'week') {
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
  }
  return d.toISOString().split('T')[0];
}

function buildChartData(movements, groupBy, activeTypes) {
  const periodMap = {};
  movements.forEach(m => {
    if (!activeTypes.includes(m.type)) return;
    const key = getPeriodKey(m.createdAt, groupBy);
    if (!periodMap[key]) periodMap[key] = { entree: 0, sortie: 0, project_use: 0, project_return: 0 };
    periodMap[key][m.type] = (periodMap[key][m.type] || 0) + m.quantity;
  });
  const labels = Object.keys(periodMap).sort();
  return {
    labels,
    datasets: Object.keys(TYPE_META)
      .filter(t => activeTypes.includes(t))
      .map(type => ({
        label: type,
        data: labels.map(l => periodMap[l]?.[type] || 0),
        backgroundColor: TYPE_META[type].color + 'cc',
        borderColor: TYPE_META[type].color,
        borderWidth: 1.5,
        tension: 0.3,
        fill: false,
        pointRadius: 3,
      })),
  };
}

function MovementsChart({ movements, groupBy, activeTypes, chartType }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!window.Chart || !canvasRef.current) return;
    const data = buildChartData(movements, groupBy, activeTypes);

    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    if (data.labels.length === 0) return;

    const isBar = chartType === 'bar';

    chartRef.current = new window.Chart(canvasRef.current, {
      type: isBar ? 'bar' : 'line',
      data: {
        labels: data.labels,
        datasets: data.datasets.map(ds => ({
          ...ds,
          ...(isBar ? { borderRadius: 3, borderSkipped: false } : {}),
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1f2937',
            titleColor: '#f9fafb',
            bodyColor: '#d1d5db',
            padding: 10,
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)}`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: 'rgba(156,163,175,0.15)' },
            ticks: { color: '#6b7280', font: { size: 11 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 12 },
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(156,163,175,0.15)' },
            ticks: { color: '#6b7280', font: { size: 11 } },
          },
        },
      },
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [movements, groupBy, activeTypes, chartType]);

  return (
    <div style={{ position: 'relative', width: '100%', height: 280 }}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Graphique des mouvements de stock par période"
      >
        Graphique des mouvements de stock.
      </canvas>
    </div>
  );
}

export default function MovementsPage() {
  const { t, currentLanguage: lang } = useLanguage();

  // Main tab: 'inventory' | 'tables'
  const [mainTab, setMainTab] = useState('inventory');

  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [chartJsReady, setChartJsReady] = useState(false);

  // Table consumptions state
  const [tableMovements, setTableMovements] = useState([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableError, setTableError] = useState(null);
  const [tableSearch, setTableSearch] = useState('');
  const [tableTypeFilter, setTableTypeFilter] = useState('all');

  // Filters
  const [superCat, setSuperCat] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');

  // Hidden movements (soft-delete, persisted in localStorage)
  const [hiddenIds, setHiddenIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('mv_hidden') || '[]')); }
    catch { return new Set(); }
  });

  // Detail modal
  const [selectedMovement, setSelectedMovement] = useState(null);

  const hideMovement = (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Masquer ce mouvement ? Il ne sera plus affiché dans le tableau.')) return;
    setHiddenIds(prev => {
      const next = new Set(prev);
      next.add(id);
      localStorage.setItem('mv_hidden', JSON.stringify([...next]));
      return next;
    });
  };

  const restoreAll = () => {
    setHiddenIds(new Set());
    localStorage.removeItem('mv_hidden');
  };

  // Graph controls
  const [showGraph, setShowGraph] = useState(false);
  const [groupBy, setGroupBy] = useState('day');
  const [chartType, setChartType] = useState('line');
  const [activeTypes, setActiveTypes] = useState(Object.keys(TYPE_META));

  // Load Chart.js once
  useEffect(() => {
    if (window.Chart) { setChartJsReady(true); return; }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
    script.onload = () => setChartJsReady(true);
    document.head.appendChild(script);
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      params.set('limit', '1000');
      const res = await axios.get(`${API}/movements?${params}`);
      setMovements(res.data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [typeFilter, fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  // Load table consumptions when on table tab
  const loadTableMovements = useCallback(async () => {
    setTableLoading(true); setTableError(null);
    try {
      const res = await axios.get(`${API}/table-consumption`);
      setTableMovements(res.data || []);
    } catch (e) { setTableError(e.message); }
    finally { setTableLoading(false); }
  }, []);

  useEffect(() => {
    if (mainTab === 'tables') loadTableMovements();
  }, [mainTab, loadTableMovements]);

  const toggleType = (type) => {
    setActiveTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  // Client-side filtering (supercategory + search + hidden)
  const filtered = movements.filter(m => {
    if (hiddenIds.has(m._id || m.id)) return false;
    if (superCat !== 'all') {
      const sc = m.itemId?.superCategory;
      if (!sc || sc !== superCat) return false;
    }
    if (!search.trim()) return true;
    const des = m.itemId?.designation?.[lang] || m.itemId?.designation?.fr || '';
    return (
      des.toLowerCase().includes(search.toLowerCase()) ||
      (m.projectName || '').toLowerCase().includes(search.toLowerCase()) ||
      (m.note || '').toLowerCase().includes(search.toLowerCase())
    );
  });

  // Summary totals
  const totals = filtered.reduce((acc, m) => {
    acc[m.type] = (acc[m.type] || 0) + m.quantity;
    return acc;
  }, {});

  const typeOptions = [
    { value: 'all', label: t('mvAll') || 'Tous' },
    { value: 'entree', label: t('mvEntrees') || 'Entrées' },
    { value: 'sortie', label: t('mvSorties') || 'Sorties' },
    { value: 'project_use', label: t('mvProjectUse') || 'Usage projet' },
    { value: 'project_return', label: t('mvProjectReturn') || 'Retour projet' },
    { value: 'order_reception', label: t('mvOrderReception') || 'Réception commande' },
  ];

  const TYPE_LABELS = {
    entree: t('mvEntrees') || 'Entrées',
    sortie: t('mvSorties') || 'Sorties',
    project_use: t('mvProjectUse') || 'Usage projet',
    project_return: t('mvProjectReturn') || 'Retour projet',
    order_reception: t('mvOrderReception') || 'Réception commande',
  };

  const TABLE_TYPE_LABELS = {
    chassis_assignment: 'Affectation châssis',
    manual_in: 'Appro. manuel',
    manual_out: 'Retrait manuel',
  };
  const TABLE_TYPE_META = {
    chassis_assignment: { color: '#f59e0b', bg: '#fffbeb', icon: '🔧' },
    manual_in:          { color: '#16a34a', bg: '#f0fdf4', icon: '↑' },
    manual_out:         { color: '#ef4444', bg: '#fef2f2', icon: '↓' },
  };

  const filteredTableMovements = tableMovements.filter(m => {
    if (tableTypeFilter !== 'all' && m.type !== tableTypeFilter) return false;
    if (!tableSearch.trim()) return true;
    const q = tableSearch.toLowerCase();
    return (
      (m.label || '').toLowerCase().includes(q) ||
      (m.tableName || '').toLowerCase().includes(q) ||
      (m.projectName || '').toLowerCase().includes(q) ||
      (m.chassisRef || '').toLowerCase().includes(q)
    );
  });

  const hasActiveFilters = fromDate || toDate || typeFilter !== 'all' || search || superCat !== 'all';
  const hiddenCount = hiddenIds.size;

  return (
    <div className="mv-page">
      <div className="mv-header">
        <h2 className="mv-header__title">{t('navMovements') || 'Mouvements'}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {mainTab === 'inventory' && (
            <>
              <button
                className="mv-refresh-btn"
                onClick={() => setShowGraph(g => !g)}
                style={{
                  background: showGraph ? '#3b82f6' : '#ffffff',
                  color: showGraph ? '#ffffff' : '#000000',
                  borderColor: showGraph ? '#3b82f6' : '#d1d5db'
                }}
              >
                {showGraph ? '✕ Masquer graphique' : '📈 Graphique'}
              </button>
              {/* {hiddenCount > 0 && (
                <button className="mv-refresh-btn" onClick={restoreAll} style={{ background: '#6b7280' }}>
                  ↩ Restaurer ({hiddenCount})
                </button>
              )} */}
              <button className="mv-refresh-btn" onClick={load}>↻ {t('refresh') || 'Actualiser'}</button>
            </>
          )}
          {mainTab === 'tables' && (
            <button className="mv-refresh-btn" onClick={loadTableMovements}>↻ {t('refresh') || 'Actualiser'}</button>
          )}
        </div>
      </div>

      {/* Main tab switcher */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid #e5e7eb', paddingBottom: 0, backgroundColor: '#222' }}>
        {[
          { key: 'inventory', label: 'Inventaire' },
          { key: 'tables', label: 'Mouvements Atelier' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setMainTab(tab.key)}
            style={{
              padding: '8px 18px',
              fontSize: 13,
              fontWeight: mainTab === tab.key ? 700 : 500,
              color: mainTab === tab.key ? '#3b82f6' : '#6b7280',
              background: 'none',
              border: 'none',
              borderBottom: mainTab === tab.key ? '2.5px solid #3b82f6' : '2.5px solid transparent',
              cursor: 'pointer',
              marginBottom: -2,
              transition: 'all .15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── INVENTORY TAB ── */}
      {mainTab === 'inventory' && (<>

      {/* Summary chips */}
      <div className="mv-summary">
        {Object.entries(TYPE_META).map(([type, meta]) => (
          <div key={type} className="mv-chip" style={{ borderColor: meta.color, background: meta.bg }}>
            <span className="mv-chip__icon" style={{ color: meta.color }}>{meta.icon}</span>
            <span className="mv-chip__label" style={{ color: meta.color }}>{TYPE_LABELS[type]}</span>
            <span className="mv-chip__val" style={{ color: meta.color }}>
              {fmt(totals[type] || 0)}
            </span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="mv-filters">
        {/* Supercategory filter */}
        <select
          className="mv-select"
          value={superCat}
          onChange={e => setSuperCat(e.target.value)}
          style={{ minWidth: 160 }}
        >
          {SUPER_CATS.map(sc => (
            <option key={sc.key} value={sc.key}>{sc.labelFr}</option>
          ))}
        </select>

        <input
          className="mv-search"
          type="text"
          placeholder={t('mvSearch') || 'Rechercher article, projet, note…'}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <select className="mv-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          {typeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <div className="mv-dates">
          <input type="date" className="mv-date-input" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          <span className="mv-date-sep">→</span>
          <input type="date" className="mv-date-input" value={toDate} onChange={e => setToDate(e.target.value)} />
        </div>

        {hasActiveFilters && (
          <button className="mv-clear-btn" onClick={() => {
            setFromDate(''); setToDate(''); setTypeFilter('all'); setSearch(''); setSuperCat('all');
          }}>
            ✕ {t('mvClear') || 'Effacer'}
          </button>
        )}
      </div>

      {/* Graph panel */}
      {showGraph && (
        <div className="mv-graph-panel">
          {/* Graph controls */}
          <div className="mv-graph-controls">
            {/* Grouping */}
            <div className="mv-graph-control-group">
              <span className="mv-graph-label">Regrouper par</span>
              <div className="mv-graph-toggle-row">
                {GROUP_OPTIONS.map(g => (
                  <button
                    key={g.value}
                    className={`mv-toggle-btn ${groupBy === g.value ? 'active' : ''}`}
                    onClick={() => setGroupBy(g.value)}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Chart type */}
            <div className="mv-graph-control-group">
              <span className="mv-graph-label">Type de graphique</span>
              <div className="mv-graph-toggle-row">
                <button
                  className={`mv-toggle-btn ${chartType === 'line' ? 'active' : ''}`}
                  onClick={() => setChartType('line')}
                >Courbe</button>
                <button
                  className={`mv-toggle-btn ${chartType === 'bar' ? 'active' : ''}`}
                  onClick={() => setChartType('bar')}
                >Barres</button>
              </div>
            </div>

            {/* Series toggles */}
            <div className="mv-graph-control-group">
              <span className="mv-graph-label">Séries</span>
              <div className="mv-graph-toggle-row">
                {Object.entries(TYPE_META).map(([type, meta]) => (
                  <button
                    key={type}
                    className={`mv-toggle-btn mv-series-btn ${activeTypes.includes(type) ? 'active' : ''}`}
                    style={activeTypes.includes(type)
                      ? { borderColor: meta.color, color: meta.color, background: meta.bg }
                      : {}}
                    onClick={() => toggleType(type)}
                  >
                    {meta.icon} {TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Custom legend */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
            {Object.entries(TYPE_META)
              .filter(([t]) => activeTypes.includes(t))
              .map(([type, meta]) => (
                <span key={type} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: meta.color, display: 'inline-block' }}></span>
                  {TYPE_LABELS[type]}
                </span>
              ))}
          </div>

          {!chartJsReady ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-secondary)', fontSize: 14 }}>
              Chargement du graphique…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-secondary)', fontSize: 14 }}>
              Aucune donnée à afficher pour les filtres sélectionnés.
            </div>
          ) : (
            <MovementsChart
              movements={filtered}
              groupBy={groupBy}
              activeTypes={activeTypes}
              chartType={chartType}
            />
          )}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="mv-state">{t('loading') || 'Chargement…'}</div>
      ) : error ? (
        <div className="mv-state mv-state--error">Erreur: {error}</div>
      ) : filtered.length === 0 ? (
        <div className="mv-state">{t('noData') || 'Aucun mouvement'}</div>
      ) : (
        <div className="mv-table-wrap">
          <table className="mv-table">
            <thead>
              <tr>
                <th>{t('mvColDate') || 'Date'}</th>
                <th>{t('mvColType') || 'Type'}</th>
                <th>Catégorie</th>
                <th>{t('mvColItem') || 'Article'}</th>
                <th className="td-right">{t('mvColQty') || 'Qté'}</th>
                <th className="td-right">{t('mvColBalance') || 'Solde'}</th>
                <th>{t('mvColProject') || 'Projet'}</th>
                <th>{t('mvColNote') || 'Note'}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m, i) => {
                const meta = TYPE_META[m.type] || { color: '#888', bg: '#f9f9f9', icon: '•' };
                const designation = m.itemId?.designation?.[lang] || m.itemId?.designation?.fr || '—';
                const sc = m.itemId?.superCategory || null;
                const scMeta = SUPER_CATS.find(s => s.key === sc);
                const isPositive = m.type === 'entree' || m.type === 'project_return' || m.type === 'order_reception';
                const qty = fmt(m.quantity);
                const bal = fmt(m.balanceAfter);
                return (
                  <tr
                    key={m._id || i}
                    className="mv-row-clickable"
                    onClick={() => setSelectedMovement(m)}
                  >
                    <td className="mv-col-date">{fmtDate(m.createdAt)}</td>
                    <td>
                      <span className="mv-type-badge" style={{ color: meta.color, background: meta.bg }}>
                        {meta.icon} {TYPE_LABELS[m.type] || m.type}
                      </span>
                    </td>
                    <td>
                      <span className="mv-supercat-badge">
                        {scMeta ? scMeta.labelFr : (sc || '—')}
                      </span>
                    </td>
                    <td className="mv-col-item">{designation}</td>
                    <td className="td-right">
                      <span className="mv-qty" style={{ color: meta.color }}>
                        {isPositive ? '+' : '−'}{qty}
                      </span>
                    </td>
                    <td className="td-right mv-balance">{bal}</td>
                    <td className="mv-col-project">{m.projectName || '—'}</td>
                    <td className="mv-col-note">{m.note || '—'}</td>
                    <td>
                      <button
                        className="mv-delete-btn"
                        onClick={(e) => hideMovement(m._id || m.id, e)}
                        title="Masquer ce mouvement"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mv-count">{filtered.length} {t('mvRows') || 'lignes'}</div>
        </div>
      )}

      {/* Detail modal */}
      {selectedMovement && (() => {
        const m = selectedMovement;
        const meta = TYPE_META[m.type] || { color: '#888', bg: '#f9f9f9', icon: '•' };
        const designation = m.itemId?.designation?.[lang] || m.itemId?.designation?.fr || '—';
        const sc = m.itemId?.superCategory || null;
        const scMeta = SUPER_CATS.find(s => s.key === sc);
        const isPositive = m.type === 'entree' || m.type === 'project_return' || m.type === 'order_reception';
        const mid = m._id || m.id;
        return (
          <div className="mv-modal-overlay" onClick={() => setSelectedMovement(null)}>
            <div className="mv-modal" onClick={e => e.stopPropagation()}>
              <div className="mv-modal-header">
                <span className="mv-type-badge" style={{ color: meta.color, background: meta.bg, fontSize: 14, padding: '5px 12px' }}>
                  {meta.icon} {TYPE_LABELS[m.type] || m.type}
                </span>
                <button className="mv-modal-close" onClick={() => setSelectedMovement(null)}>✕</button>
              </div>

              <div className="mv-modal-title">{designation}</div>

              <div className="mv-modal-grid">
                <div className="mv-modal-field">
                  <span className="mv-modal-field__label">Date</span>
                  <span className="mv-modal-field__val">{fmtDate(m.createdAt)}</span>
                </div>
                <div className="mv-modal-field">
                  <span className="mv-modal-field__label">Catégorie</span>
                  <span className="mv-modal-field__val">
                    <span className="mv-supercat-badge">{scMeta ? scMeta.labelFr : (sc || '—')}</span>
                  </span>
                </div>
                <div className="mv-modal-field">
                  <span className="mv-modal-field__label">Quantité</span>
                  <span className="mv-modal-field__val mv-qty" style={{ color: meta.color }}>
                    {isPositive ? '+' : '−'}{fmt(m.quantity)}
                  </span>
                </div>
                <div className="mv-modal-field">
                  <span className="mv-modal-field__label">Solde après</span>
                  <span className="mv-modal-field__val mv-balance">{fmt(m.balanceAfter)}</span>
                </div>
                {m.projectName && (
                  <div className="mv-modal-field">
                    <span className="mv-modal-field__label">Projet</span>
                    <span className="mv-modal-field__val mv-col-project">{m.projectName}</span>
                  </div>
                )}
                {m.user && (
                  <div className="mv-modal-field">
                    <span className="mv-modal-field__label">Utilisateur</span>
                    <span className="mv-modal-field__val">{m.user}</span>
                  </div>
                )}
              </div>

              {m.note && (
                <div className="mv-modal-note">
                  <div className="mv-modal-field__label" style={{ marginBottom: 6 }}>Note</div>
                  <div className="mv-modal-note__body">{m.note}</div>
                </div>
              )}

              <div className="mv-modal-actions">
                <button
                  className="mv-modal-hide-btn"
                  onClick={() => {
                    if (!window.confirm('Masquer ce mouvement ?')) return;
                    setHiddenIds(prev => {
                      const next = new Set(prev);
                      next.add(mid);
                      localStorage.setItem('mv_hidden', JSON.stringify([...next]));
                      return next;
                    });
                    setSelectedMovement(null);
                  }}
                >
                  🗑 Masquer ce mouvement
                </button>
                <button className="mv-modal-close-btn" onClick={() => setSelectedMovement(null)}>
                  Fermer
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      </>)}

      {/* ── TABLES ATELIER TAB ── */}
      {mainTab === 'tables' && (
        <div>
          {/* Summary chips for table movements */}
          <div className="mv-summary">
            {Object.entries(TABLE_TYPE_META).map(([type, meta]) => {
              const total = filteredTableMovements
                .filter(m => m.type === type)
                .reduce((s, m) => s + (m.quantity || 0), 0);
              return (
                <div key={type} className="mv-chip" style={{ borderColor: meta.color, background: meta.bg }}>
                  <span className="mv-chip__icon" style={{ color: meta.color }}>{meta.icon}</span>
                  <span className="mv-chip__label" style={{ color: meta.color }}>{TABLE_TYPE_LABELS[type]}</span>
                  <span className="mv-chip__val" style={{ color: meta.color }}>{fmt(total)}</span>
                </div>
              );
            })}
          </div>

          {/* Filters */}
          <div className="mv-filters">
            <input
              className="mv-search"
              type="text"
              placeholder="Rechercher accessoire, table, projet, châssis…"
              value={tableSearch}
              onChange={e => setTableSearch(e.target.value)}
            />
            <select className="mv-select" value={tableTypeFilter} onChange={e => setTableTypeFilter(e.target.value)}>
              <option value="all">Tous les types</option>
              {Object.entries(TABLE_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            {(tableSearch || tableTypeFilter !== 'all') && (
              <button className="mv-clear-btn" onClick={() => { setTableSearch(''); setTableTypeFilter('all'); }}>
                ✕ Effacer
              </button>
            )}
          </div>

          {/* Table */}
          {tableLoading ? (
            <div className="mv-state">Chargement…</div>
          ) : tableError ? (
            <div className="mv-state mv-state--error">Erreur: {tableError}</div>
          ) : filteredTableMovements.length === 0 ? (
            <div className="mv-state">Aucun mouvement atelier</div>
          ) : (
            <div className="mv-table-wrap">
              <table className="mv-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Table</th>
                    <th>Accessoire</th>
                    <th className="td-right">Qté</th>
                    <th>Unité</th>
                    <th>Projet</th>
                    <th>Châssis</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTableMovements.map((m, i) => {
                    const meta = TABLE_TYPE_META[m.type] || { color: '#888', bg: '#f9f9f9', icon: '•' };
                    const isOut = m.type === 'chassis_assignment' || m.type === 'manual_out';
                    return (
                      <tr key={m._id || i}>
                        <td className="mv-col-date">{fmtDate(m.date || m.createdAt)}</td>
                        <td>
                          <span className="mv-type-badge" style={{ color: meta.color, background: meta.bg }}>
                            {meta.icon} {TABLE_TYPE_LABELS[m.type] || m.type}
                          </span>
                        </td>
                        <td><strong>{m.tableName || '—'}</strong></td>
                        <td className="mv-col-item">{m.label || '—'}</td>
                        <td className="td-right">
                          <span className="mv-qty" style={{ color: meta.color }}>
                            {isOut ? '−' : '+'}{fmt(m.quantity)}
                          </span>
                        </td>
                        <td>{m.unit || '—'}</td>
                        <td className="mv-col-project">{m.projectName || '—'}</td>
                        <td>{m.chassisRef ? <code style={{ fontSize: 11, background: '#f3f4f6', padding: '2px 5px', borderRadius: 3 }}>{m.chassisRef}</code> : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mv-count">{filteredTableMovements.length} lignes</div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}