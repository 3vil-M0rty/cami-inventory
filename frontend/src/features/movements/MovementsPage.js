import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useLanguage } from '../../context/LanguageContext';
import { dialog } from '../../components/common/dialog';
import './MovementsPage.css';
import { PackageOpen, ChartNetwork, LineChart, X, RotateCw, Trash2, Inbox } from 'lucide-react';

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
  entree: { color: '#4ade80', bg: 'rgba(74,222,128,.10)', icon: '↑' },
  sortie: { color: '#f87171', bg: 'rgba(248,113,113,.10)', icon: '↓' },
  project_use: { color: '#fbbf24', bg: 'rgba(251,191,36,.10)', icon: '↙' },
  project_return: { color: '#60a5fa', bg: 'rgba(96,165,250,.10)', icon: '↗' },
  order_reception: { color: '#e879f9', bg: 'rgba(232,121,249,.10)', icon: '↑' },
};

const PAGE_SIZE = 200;

// label = translation key
const SUPER_CATS = [
  { key: 'all', icon: '', label: 'superCatAll' },
  { key: 'aluminium', icon: '🔩 ', label: 'superCatAluminium' },
  { key: 'verre', icon: '💎 ', label: 'superCatVerre' },
  { key: 'accessoires', icon: '🔧 ', label: 'superCatAccessoires' },
  { key: 'poudre', icon: '🎨 ', label: 'superCatPoudre' },
];

const GROUP_OPTIONS = [
  { value: 'day', label: 'mvGroupDay' },
  { value: 'week', label: 'mvGroupWeek' },
  { value: 'month', label: 'mvGroupMonth' },
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

function MovementsChart({ movements, groupBy, activeTypes, chartType, typeLabels = {} }) {
  const { t } = useLanguage();
  const ariaLabel = t('mvChartAria');
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
          label: typeLabels[ds.label] || ds.label,
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
            backgroundColor: '#222227',
            borderColor: '#34343b',
            borderWidth: 1,
            titleColor: '#f4f4f5',
            bodyColor: '#b4b4bd',
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)}`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.06)' }, border: { color: '#27272c' },
            ticks: { color: '#8b8b94', font: { size: 11 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 12 },
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255,255,255,0.06)' }, border: { color: '#27272c' },
            ticks: { color: '#8b8b94', font: { size: 11 } },
          },
        },
      },
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [movements, groupBy, activeTypes, chartType, JSON.stringify(typeLabels)]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ position: 'relative', width: '100%', height: 280 }}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={ariaLabel}
      >
        {ariaLabel}
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
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  // Hidden movements (soft-delete, persisted in localStorage)
  const [hiddenIds, setHiddenIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('mv_hidden') || '[]')); }
    catch { return new Set(); }
  });

  // Detail modal
  const [selectedMovement, setSelectedMovement] = useState(null);

  const hideMovement = async (id, e) => {
    e.stopPropagation();
    if (!(await dialog.confirm({ title: t('mvHideTitle'), message: t('mvHideConfirm'), confirmLabel: t('mvHideAction') }))) return;
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
      params.set('limit', String(PAGE_SIZE));
      params.set('skip', '0');
      const res = await axios.get(`${API}/movements?${params}`);
      setMovements(res.data.movements);
      setTotalCount(res.data.total);
      setHasMore(res.data.hasMore);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [typeFilter, fromDate, toDate]);


  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams();
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      params.set('limit', String(PAGE_SIZE));
      params.set('skip', String(movements.length));
      const res = await axios.get(`${API}/movements?${params}`);
      setMovements(prev => [...prev, ...res.data.movements]);
      setTotalCount(res.data.total);
      setHasMore(res.data.hasMore);
    } catch (e) { setError(e.message); }
    finally { setLoadingMore(false); }
  }, [typeFilter, fromDate, toDate, movements.length, hasMore, loadingMore]);

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
    chassis_assignment: t('mvChassisAssign'),
    manual_in: t('mvManualIn'),
    manual_out: t('mvManualOut'),
  };
  const TABLE_TYPE_META = {
    chassis_assignment: { color: '#fbbf24', bg: 'rgba(251,191,36,.10)', icon: '⚙' },
    manual_in: { color: '#4ade80', bg: 'rgba(74,222,128,.10)', icon: '↑' },
    manual_out: { color: '#f87171', bg: 'rgba(248,113,113,.10)', icon: '↓' },
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
        <div className="mv-header__heading">
          <span className="mv-header__icon"><ChartNetwork size={18} strokeWidth={2} /></span>
          <h2 className="mv-header__title">{t('navMovements') || 'Mouvements'}</h2>
        </div>
        <div className="mv-header__actions">
          {mainTab === 'inventory' && (
            <>
              <button
                className={`mv-refresh-btn ${showGraph ? 'is-active' : ''}`}
                onClick={() => setShowGraph(g => !g)}
              >
                {showGraph ? <X /> : <LineChart />}
                {showGraph ? t('mvHideChart') : t('mvChart')}
              </button>
              {/* {hiddenCount > 0 && (
                <button className="mv-refresh-btn" onClick={restoreAll} style={{ background: '#6b7280' }}>
                  ↩ Restaurer ({hiddenCount})
                </button>
              )} */}
              <button className="mv-refresh-btn" onClick={load}><RotateCw />{t('refresh') || 'Actualiser'}</button>
            </>
          )}
          {mainTab === 'tables' && (
            <button className="mv-refresh-btn" onClick={loadTableMovements}><RotateCw />{t('refresh') || 'Actualiser'}</button>
          )}
        </div>
      </div>

      {/* Main tab switcher */}
      <div className="mv-tabs" role="tablist">
        {[
          { key: 'inventory', label: t('mvTabInventory') },
          { key: 'tables', label: t('mvTabWorkshop') },
        ].map(tab => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={mainTab === tab.key}
            className={`mv-tab ${mainTab === tab.key ? 'active' : ''}`}
            onClick={() => setMainTab(tab.key)}
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
            <div key={type} className="mv-chip" style={{ '--mv-c': meta.color, '--mv-bg': meta.bg }}>
              <span className="mv-chip__icon">{meta.icon}</span>
              <span className="mv-chip__label">{TYPE_LABELS[type]}</span>
              <span className="mv-chip__val">
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
          >
            {SUPER_CATS.map(sc => (
              <option key={sc.key} value={sc.key}>{sc.icon}{t(sc.label)}</option>
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
              <X size={13} />{t('mvClear') || 'Effacer'}
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
                <span className="mv-graph-label">{t('mvGroupBy')}</span>
                <div className="mv-graph-toggle-row">
                  {GROUP_OPTIONS.map(g => (
                    <button
                      key={g.value}
                      className={`mv-toggle-btn ${groupBy === g.value ? 'active' : ''}`}
                      onClick={() => setGroupBy(g.value)}
                    >
                      {t(g.label)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chart type */}
              <div className="mv-graph-control-group">
                <span className="mv-graph-label">{t('mvChartType')}</span>
                <div className="mv-graph-toggle-row">
                  <button
                    className={`mv-toggle-btn ${chartType === 'line' ? 'active' : ''}`}
                    onClick={() => setChartType('line')}
                  >{t('mvLine')}</button>
                  <button
                    className={`mv-toggle-btn ${chartType === 'bar' ? 'active' : ''}`}
                    onClick={() => setChartType('bar')}
                  >{t('mvBars')}</button>
                </div>
              </div>

              {/* Series toggles */}
              <div className="mv-graph-control-group">
                <span className="mv-graph-label">{t('mvSeries')}</span>
                <div className="mv-graph-toggle-row">
                  {Object.entries(TYPE_META).map(([type, meta]) => (
                    <button
                      key={type}
                      className={`mv-toggle-btn mv-series-btn ${activeTypes.includes(type) ? 'active' : ''}`}
                      style={activeTypes.includes(type)
                        ? { borderColor: meta.color, color: meta.color, background: meta.bg }
                        : undefined}
                      onClick={() => toggleType(type)}
                    >
                      {meta.icon} {TYPE_LABELS[type]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Custom legend */}
            <div className="mv-legend">
              {Object.entries(TYPE_META)
                .filter(([t]) => activeTypes.includes(t))
                .map(([type, meta]) => (
                  <span key={type} className="mv-legend__item">
                    <span className="mv-legend__swatch" style={{ background: meta.color }}></span>
                    {TYPE_LABELS[type]}
                  </span>
                ))}
            </div>

            {!chartJsReady ? (
              <div className="mv-graph-empty">
                {t('mvChartLoading')}
              </div>
            ) : filtered.length === 0 ? (
              <div className="mv-graph-empty">
                {t('mvNoChartData')}
              </div>
            ) : (
              <MovementsChart
                movements={filtered}
                groupBy={groupBy}
                activeTypes={activeTypes}
                chartType={chartType}
                typeLabels={TYPE_LABELS}
              />
            )}
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="mv-state">{t('loading') || 'Chargement…'}</div>
        ) : error ? (
          <div className="mv-state mv-state--error">{t('errorWithMsg', { msg: error })}</div>
        ) : filtered.length === 0 ? (
          <div className="mv-state"><span className="mv-state__icon"><Inbox size={20} strokeWidth={1.8} /></span>{t('mvNoMovement')}</div>
        ) : (
          <div className="mv-table-wrap">
            <table className="mv-table">
              <thead>
                <tr>
                  <th>{t('mvColDate') || 'Date'}</th>
                  <th>{t('mvColType') || 'Type'}</th>
                  <th>{t('mvColCategory')}</th>
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
                  const meta = TYPE_META[m.type] || { color: '#a1a1aa', bg: 'rgba(161,161,170,.10)', icon: '•' };
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
                        <span className="mv-type-badge" style={{ color: meta.color, background: meta.bg, borderColor: meta.color + '4d' }}>
                          {meta.icon} {TYPE_LABELS[m.type] || m.type}
                        </span>
                      </td>
                      <td>
                        <span className="mv-supercat-badge">
                          {scMeta ? t(scMeta.label) : (sc || '—')}
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
                          title={t('mvHideBtn')}
                        >
                          <X size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mv-count">
              {filtered.length} {t('mvRows') || 'lignes'}
              {totalCount > movements.length && t('mvLoaded', { n: movements.length, total: totalCount })}
            </div>
            {hasMore && (
              <div className="mv-load-more">
                <button className="mv-refresh-btn" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? t('loadingShort') : t('mvLoadMore', { n: totalCount - movements.length })}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Detail modal */}
        {selectedMovement && (() => {
          const m = selectedMovement;
          const meta = TYPE_META[m.type] || { color: '#a1a1aa', bg: 'rgba(161,161,170,.10)', icon: '•' };
          const designation = m.itemId?.designation?.[lang] || m.itemId?.designation?.fr || '—';
          const sc = m.itemId?.superCategory || null;
          const scMeta = SUPER_CATS.find(s => s.key === sc);
          const isPositive = m.type === 'entree' || m.type === 'project_return' || m.type === 'order_reception';
          const mid = m._id || m.id;
          return (
            <div className="mv-modal-overlay" onClick={() => setSelectedMovement(null)}>
              <div className="mv-modal" onClick={e => e.stopPropagation()}>
                <div className="mv-modal-header">
                  <span className="mv-type-badge mv-type-badge--lg" style={{ color: meta.color, background: meta.bg, borderColor: meta.color + '4d' }}>
                    {meta.icon} {TYPE_LABELS[m.type] || m.type}
                  </span>
                  <button className="mv-modal-close" onClick={() => setSelectedMovement(null)} aria-label={t('close')}><X size={16} /></button>
                </div>

                <div className="mv-modal-title">{designation}</div>

                <div className="mv-modal-grid">
                  <div className="mv-modal-field">
                    <span className="mv-modal-field__label">{t('mvColDate')}</span>
                    <span className="mv-modal-field__val">{fmtDate(m.createdAt)}</span>
                  </div>
                  <div className="mv-modal-field">
                    <span className="mv-modal-field__label">{t('mvColCategory')}</span>
                    <span className="mv-modal-field__val">
                      <span className="mv-supercat-badge">{scMeta ? t(scMeta.label) : (sc || '—')}</span>
                    </span>
                  </div>
                  <div className="mv-modal-field">
                    <span className="mv-modal-field__label">{t('mvQuantity')}</span>
                    <span className="mv-modal-field__val mv-qty" style={{ color: meta.color }}>
                      {isPositive ? '+' : '−'}{fmt(m.quantity)}
                    </span>
                  </div>
                  <div className="mv-modal-field">
                    <span className="mv-modal-field__label">{t('mvBalanceAfter')}</span>
                    <span className="mv-modal-field__val mv-balance">{fmt(m.balanceAfter)}</span>
                  </div>
                  {m.projectName && (
                    <div className="mv-modal-field">
                      <span className="mv-modal-field__label">{t('mvProject')}</span>
                      <span className="mv-modal-field__val mv-col-project">{m.projectName}</span>
                    </div>
                  )}
                  {m.user && (
                    <div className="mv-modal-field">
                      <span className="mv-modal-field__label">{t('mvUser')}</span>
                      <span className="mv-modal-field__val">{m.user}</span>
                    </div>
                  )}
                </div>

                {m.note && (
                  <div className="mv-modal-note">
                    <div className="mv-modal-field__label mv-modal-note__label">{t('mvNote')}</div>
                    <div className="mv-modal-note__body">{m.note}</div>
                  </div>
                )}

                <div className="mv-modal-actions">
                  <button
                    className="mv-modal-hide-btn"
                    onClick={async () => {
                      if (!(await dialog.confirm({ title: t('mvHideTitle'), message: t('mvHideConfirm'), confirmLabel: t('mvHideAction') }))) return;
                      setHiddenIds(prev => {
                        const next = new Set(prev);
                        next.add(mid);
                        localStorage.setItem('mv_hidden', JSON.stringify([...next]));
                        return next;
                      });
                      setSelectedMovement(null);
                    }}
                  >
                    <Trash2 size={14} />{t('mvHideBtn')}
                  </button>
                  <button className="mv-modal-close-btn" onClick={() => setSelectedMovement(null)}>
                    {t('close')}
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
                <div key={type} className="mv-chip" style={{ '--mv-c': meta.color, '--mv-bg': meta.bg }}>
                  <span className="mv-chip__icon">{meta.icon}</span>
                  <span className="mv-chip__label">{TABLE_TYPE_LABELS[type]}</span>
                  <span className="mv-chip__val">{fmt(total)}</span>
                </div>
              );
            })}
          </div>

          {/* Filters */}
          <div className="mv-filters">
            <input
              className="mv-search"
              type="text"
              placeholder={t('mvWsSearch')}
              value={tableSearch}
              onChange={e => setTableSearch(e.target.value)}
            />
            <select className="mv-select" value={tableTypeFilter} onChange={e => setTableTypeFilter(e.target.value)}>
              <option value="all">{t('mvAllTypes')}</option>
              {Object.entries(TABLE_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            {(tableSearch || tableTypeFilter !== 'all') && (
              <button className="mv-clear-btn" onClick={() => { setTableSearch(''); setTableTypeFilter('all'); }}>
                <X size={13} />{t('mvClear')}
              </button>
            )}
          </div>

          {/* Table */}
          {tableLoading ? (
            <div className="mv-state">{t('loadingShort')}</div>
          ) : tableError ? (
            <div className="mv-state mv-state--error">{t('errorWithMsg', { msg: tableError })}</div>
          ) : filteredTableMovements.length === 0 ? (
            <div className="mv-state"><span className="mv-state__icon"><Inbox size={20} strokeWidth={1.8} /></span>{t('mvNoWorkshop')}</div>
          ) : (
            <div className="mv-table-wrap">
              <table className="mv-table">
                <thead>
                  <tr>
                    <th>{t('mvColDate')}</th>
                    <th>{t('mvColType')}</th>
                    <th>{t('mvColTable')}</th>
                    <th>{t('mvColAccessory')}</th>
                    <th className="td-right">{t('mvColQty')}</th>
                    <th>{t('mvColUnit')}</th>
                    <th>{t('mvColProject')}</th>
                    <th>{t('mvColChassis')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTableMovements.map((m, i) => {
                    const meta = TABLE_TYPE_META[m.type] || { color: '#a1a1aa', bg: 'rgba(161,161,170,.10)', icon: '•' };
                    const isOut = m.type === 'chassis_assignment' || m.type === 'manual_out';
                    return (
                      <tr key={m._id || i}>
                        <td className="mv-col-date">{fmtDate(m.date || m.createdAt)}</td>
                        <td>
                          <span className="mv-type-badge" style={{ color: meta.color, background: meta.bg, borderColor: meta.color + '4d' }}>
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
                        <td>{m.chassisRef ? <code className="mv-code">{m.chassisRef}</code> : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mv-count">{t('mvLines', { n: filteredTableMovements.length })}</div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}