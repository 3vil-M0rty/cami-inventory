import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useLanguage } from '../../context/LanguageContext';
import { dialog } from '../../components/common/dialog';
import './AtelierTablesPage.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const DEFAULT_LAYOUT = [
  { id: 'table-1', number: 1, name: 'Table 1', x: 80,  y: 80,  w: 200, h: 90 },
  { id: 'table-2', number: 2, name: 'Table 2', x: 340, y: 80,  w: 200, h: 90 },
  { id: 'table-3', number: 3, name: 'Table 3', x: 600, y: 80,  w: 200, h: 90 },
  { id: 'table-4', number: 4, name: 'Table 4', x: 80,  y: 240, w: 200, h: 90 },
  { id: 'table-5', number: 5, name: 'Table 5', x: 340, y: 240, w: 200, h: 90 },
  { id: 'table-6', number: 6, name: 'Table 6', x: 600, y: 240, w: 200, h: 90 },
  { id: 'table-7', number: 7, name: 'Table 7', x: 80,  y: 400, w: 200, h: 90 },
  { id: 'table-8', number: 8, name: 'Table 8', x: 340, y: 400, w: 200, h: 90 },
];

const CANVAS_W = 880;
const CANVAS_H = 800;

const ETAT_COLORS = {
  non_entame: '#a1a1aa',
  en_cours: '#fbbf24',
  non_vitre: '#c084fc',
  fabrique: '#60a5fa',
  pret_a_livrer: '#f87171',
  livre: '#4ade80',
};

// ─── Small inline icons (stroke = currentColor) ──────────────────────────────
const Ico = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d.map((p, i) => <path key={i} d={p} />)}
  </svg>
);
const IC = {
  plan:  ['M3 3h18v18H3z', 'M3 9h7v12', 'M14 3v6h7', 'M14 14h3'],
  chart: ['M3 3v18h18', 'M8 17v-5', 'M13 17V8', 'M18 17v-9'],
  plus:  ['M12 5v14', 'M5 12h14'],
  save:  ['M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z', 'M17 21v-8H7v8', 'M7 3v5h8'],
  check: ['M20 6 9 17l-5-5'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6'],
  x:     ['M18 6 6 18', 'M6 6l12 12'],
  edit:  ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
  users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  arrow: ['M7 17 17 7', 'M8 7h9v9'],
};
// translation keys (etat_* exist in LanguageContext)
const ETAT_LABELS = {
  non_entame: 'etat_non_entame',
  en_cours: 'etat_en_cours',
  non_vitre: 'etat_non_vitre',
  fabrique: 'etat_fabrique',
  pret_a_livrer: 'etat_pret_a_livrer',
  livre: 'etat_livre',
};

// All possible etat keys in display order
const ALL_ETATS = ['non_entame', 'en_cours', 'non_vitre', 'fabrique', 'pret_a_livrer', 'livre'];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtDate(d) { if (!d) return '—'; return new Date(d).toLocaleDateString('fr-FR'); }
function evalFormula(formula, L, H) {
  if (!formula) return 0;
  try { return Function('L', 'H', `return (${formula})`)(L, H); } catch { return 0; }
}
function computeAccQty(acc, largeur, hauteur) {
  if (acc.formula && acc.formula.trim()) return Math.round(evalFormula(acc.formula, largeur, hauteur) * 100) / 100;
  return acc.quantity || 0;
}

// ─── Inline name editor ───────────────────────────────────────────────────────
function TableNameEditor({ value, onChange, onBlur }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.select(); }, []);
  return (
    <input
      ref={ref}
      className="atp__table-name-input"
      value={value}
      onChange={e => onChange(e.target.value)}
      onBlur={onBlur}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') onBlur(); }}
      maxLength={32}
      autoFocus
    />
  );
}

// ─── Single SVG Table block ───────────────────────────────────────────────────
function WorkshopTable({ table, isSelected, isDragging, onMouseDown, onDoubleClick, onClick, editingId, editName, onEditChange, onEditBlur, workloadCount, stockAlert }) {
  const isEditing = editingId === table.id;
  const cx = table.x + table.w / 2;
  const cy = table.y + table.h / 2;

  return (
    <g
      className={`atp__table-group${isSelected ? ' atp__table-group--selected' : ''}${isDragging ? ' atp__table-group--dragging' : ''}`}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      onClick={onClick}
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
    >
      <rect x={table.x + 2} y={table.y + 8} width={table.w} height={table.h} rx={10} ry={10} fill="rgba(0,0,0,0.55)" filter="url(#blur)" />
      <rect x={table.x} y={table.y} width={table.w} height={table.h} rx={10} ry={10}
        className={`atp__table-rect${isSelected ? ' atp__table-rect--selected' : ''}`} />
      <rect x={table.x + 8} y={table.y + 8} width={table.w - 16} height={table.h - 16} rx={6} ry={6} className="atp__table-top" />
      {[0.38, 0.62].map((frac, i) => (
        <line key={i} x1={table.x + 46} y1={table.y + table.h * frac}
          x2={table.x + table.w - 46} y2={table.y + table.h * frac} className="atp__table-grain" />
      ))}
      <rect x={table.x + 14} y={table.y + 14} width={26} height={18} rx={5} ry={5} className="atp__table-badge-circle" />
      <text x={table.x + 27} y={table.y + 23.5} textAnchor="middle" dominantBaseline="central" className="atp__table-badge-num">{table.number}</text>
      {!isEditing ? (
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" className="atp__table-name-text">{table.name}</text>
      ) : (
        <foreignObject x={table.x + 12} y={cy - 16} width={table.w - 24} height={32}>
          <TableNameEditor value={editName} onChange={onEditChange} onBlur={onEditBlur} />
        </foreignObject>
      )}
      {workloadCount > 0 && (
        <g>
          <rect x={table.x + table.w - 40} y={table.y + 14} width={26} height={18} rx={9} ry={9} className="atp__table-load" />
          <text x={table.x + table.w - 27} y={table.y + 23.5} textAnchor="middle" dominantBaseline="central"
            className="atp__table-load-num">{workloadCount}</text>
        </g>
      )}
      {stockAlert && (
        <g>
          <circle cx={table.x + table.w - 22} cy={table.y + table.h - 22} r={8} fill="rgba(248,113,113,.25)" />
          <circle cx={table.x + table.w - 22} cy={table.y + table.h - 22} r={4} fill="#f87171" />
        </g>
      )}
      {isSelected && (
        <rect x={table.x - 3} y={table.y - 3} width={table.w + 6} height={table.h + 6}
          rx={13} ry={13} fill="none" strokeWidth={1.5} strokeDasharray="6 4" className="atp__table-selection-ring" />
      )}
    </g>
  );
}

// ─── Etat Filter Bar ──────────────────────────────────────────────────────────
function EtatFilterBar({ workload, activeFilter, onChange }) {
  const { t } = useLanguage();
  // Count how many rows exist per etat
  const counts = {};
  for (const w of workload) {
    const e = w.etat || 'non_entame';
    counts[e] = (counts[e] || 0) + 1;
  }
  // Only show etats that actually appear in this workload
  const presentEtats = ALL_ETATS.filter(e => counts[e] > 0);

  if (presentEtats.length === 0) return null;

  return (
    <div className="atp__filter">
      <span className="atp__filter-label">
        {t('atFilterLabel')}
      </span>
      {/* "All" pill */}
      <button
        onClick={() => onChange('all')}
        className={`atp__pill${activeFilter === 'all' ? ' atp__pill--active' : ''}`}
      >
        {t('atAll', { n: workload.length })}
      </button>
      {presentEtats.map(e => {
        const active = activeFilter === e;
        return (
          <button
            key={e}
            onClick={() => onChange(active ? 'all' : e)}
            className={`atp__pill atp__pill--etat${active ? ' atp__pill--on' : ''}`}
            style={{ '--c': ETAT_COLORS[e] }}
          >
            <span className="atp__pill-dot" />
            {t(ETAT_LABELS[e])}
            <span className="atp__pill-count">{counts[e]}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Table Detail Popup ───────────────────────────────────────────────────────
function TableDetailPopup({ table, onClose }) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab]         = useState('workload');
  const [workload, setWorkload]           = useState([]);
  const [stock, setStock]                 = useState([]);
  const [workers, setWorkers]             = useState([]);
  const [recap, setRecap]                 = useState([]);
  const [recapPeriod, setRecapPeriod]     = useState('daily');
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [newWorker, setNewWorker]         = useState('');
  const [inventoryItems, setInventoryItems] = useState([]);
  const [stockSearch, setStockSearch]     = useState('');
  const [addingItem, setAddingItem]       = useState(null);
  const [addQty, setAddQty]               = useState('');
  const [adjusting, setAdjusting]         = useState(null);
  const [savingStock, setSavingStock]     = useState(false);

  // ── Etat filter for workload tab ──────────────────────────────────────────
  const [etatFilter, setEtatFilter] = useState('all');

  // Load workload + stock
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [wRes, sRes] = await Promise.all([
          axios.get(`${API_URL}/atelier-tables/${table.id}/workload`),
          axios.get(`${API_URL}/table-stock/${table.id}`),
        ]);
        setWorkload(wRes.data.workload || []);
        setStock(sRes.data.stock || []);
        setWorkers(sRes.data.workers || []);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
  }, [table.id]);

  // Reset filter when workload changes (e.g. table switch)
  useEffect(() => { setEtatFilter('all'); }, [table.id]);

  const loadRecap = () => {
    axios.get(`${API_URL}/table-consumption?tableId=${table.id}`)
      .then(r => setRecap(r.data || []))
      .catch(() => setRecap([]));
  };
  useEffect(() => {
    if (activeTab !== 'recap') return;
    loadRecap();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, recapPeriod, table.id]);

  const handleDeleteRecapEntry = async (id) => {
    if (!(await dialog.confirm({ title: t('deleteTitle'), message: t('atDeleteRecapConfirm'), danger: true, confirmLabel: t('deleteAction') }))) return;
    try {
      await axios.delete(`${API_URL}/table-consumption/${id}`);
      setRecap(prev => prev.filter(e => (e._id || e.id) !== id));
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (activeTab !== 'stock') return;
    axios.get(`${API_URL}/inventory?superCategory=accessoires`)
      .then(r => setInventoryItems(r.data || []))
      .catch(() => setInventoryItems([]));
  }, [activeTab]);

  const saveStock = async (newStock, newWorkers) => {
    setSavingStock(true);
    try {
      await axios.put(`${API_URL}/table-stock/${table.id}`, {
        tableName: table.name,
        workers: newWorkers ?? workers,
        stock: newStock ?? stock,
      });
    } catch (e) { console.error(e); }
    finally { setSavingStock(false); }
  };

  const addWorker = () => {
    const w = newWorker.trim();
    if (!w) return;
    const next = [...workers, w];
    setWorkers(next);
    setNewWorker('');
    saveStock(null, next);
  };
  const removeWorker = (i) => {
    const next = workers.filter((_, idx) => idx !== i);
    setWorkers(next);
    saveStock(null, next);
  };

  const handleAddItem = async () => {
    if (!addingItem || !addQty) return;
    const qty = parseFloat(addQty);
    if (isNaN(qty) || qty <= 0) return;
    setSaving(true);
    try {
      const r = await axios.patch(`${API_URL}/table-stock/${table.id}/adjust`, {
        itemId: addingItem.itemId,
        label: addingItem.label,
        unit: addingItem.unit,
        delta: qty,
        type: 'manual_in',
      });
      setStock(r.data.stock || []);
    } catch (e) { console.error(e); }
    finally { setSaving(false); setAddingItem(null); setAddQty(''); }
  };

  const handleAdjust = async (item, delta) => {
    setSaving(true);
    try {
      const r = await axios.patch(`${API_URL}/table-stock/${table.id}/adjust`, {
        itemId: item.itemId,
        label: item.label,
        unit: item.unit,
        delta,
        type: delta > 0 ? 'manual_in' : 'manual_out',
      });
      setStock(r.data.stock || []);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const handleRemoveItem = async (item) => {
    const ok = await dialog.confirm({
      title: t('atRemoveItemTitle'), message: t('atRemoveItemConfirm', { name: item.label }),
      details: t('atRemoveItemDetails', { n: item.quantity }), danger: true, confirmLabel: t('atRemoveAction'),
    });
    if (!ok) return;
    setSaving(true);
    try {
      const r = await axios.delete(`${API_URL}/table-stock/${table.id}/item/${item.itemId}`);
      setStock(r.data.stock || []);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const filteredInventory = inventoryItems
    .filter(it => {
      const label = it.designation?.fr || it.designation?.en || '';
      return label.toLowerCase().includes(stockSearch.toLowerCase());
    })
    .filter(it => !stock.some(s => s.itemId === it.id));

  // Apply etat filter to workload
  const filteredWorkload = etatFilter === 'all'
    ? workload
    : workload.filter(w => (w.etat || 'non_entame') === etatFilter);

  return (
    <div className="atp__popup-overlay" onClick={onClose}>
      <div className="atp__popup" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="atp__popup-header">
          <div className="atp__popup-title">
            <span className="atp__popup-badge">#{table.number}</span>
            <h2>{table.name}</h2>
          </div>
          <button className="atp__popup-close" onClick={onClose}><Ico d={IC.x} /></button>
        </div>

        {/* Workers strip */}
        <div className="atp__popup-workers">
          <span className="atp__popup-workers-label"><Ico d={IC.users} size={14} /> {t('atOperators')}</span>
          <div className="atp__popup-workers-list">
            {workers.map((w, i) => (
              <span key={i} className="atp__worker-chip">
                {w}
                <button onClick={() => removeWorker(i)} className="atp__worker-rm">×</button>
              </span>
            ))}
            <div className="atp__worker-add">
              <input value={newWorker} onChange={e => setNewWorker(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addWorker(); }}
                placeholder={t('atAddOperator')} className="atp__worker-input" />
              <button onClick={addWorker} className="atp__worker-addbtn"><Ico d={IC.plus} size={14} /></button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="atp__popup-tabs">
          {[
            ['workload', t('atTabWorkload'), workload.length > 0 ? workload.length : null],
            ['stock', t('atTabStock'), null],
            ['recap', t('atTabRecap'), null],
          ].map(([k, label, n]) => (
            <button key={k} className={`atp__popup-tab${activeTab === k ? ' active' : ''}`} onClick={() => setActiveTab(k)}>
              {label}{n != null && <span className="atp__popup-tab-count">{n}</span>}
            </button>
          ))}
        </div>

        <div className="atp__popup-body">
          {loading ? (
            <div className="atp__popup-loading"><div className="atp__loading-spinner" /><span>{t('loadingShort')}</span></div>
          ) : (
            <>
              {/* ── WORKLOAD TAB ── */}
              {activeTab === 'workload' && (
                <div className="atp__popup-workload">
                  {workload.length === 0 ? (
                    <div className="atp__popup-empty">{t('atNoChassis')}</div>
                  ) : (
                    <>
                      {/* Etat filter pills */}
                      <EtatFilterBar
                        workload={workload}
                        activeFilter={etatFilter}
                        onChange={setEtatFilter}
                      />

                      {filteredWorkload.length === 0 ? (
                        <div className="atp__popup-empty">
                          {t('atNoChassisWithState', { etat: t(ETAT_LABELS[etatFilter]) })}
                        </div>
                      ) : (
                        <div className="atp__table-scroll"><table className="atp__popup-table">
                          <thead>
                            <tr>
                              <th>{t('atColProject')}</th>
                              <th>{t('atColClient')}</th>
                              <th>{t('atColChassisRef')}</th>
                              <th>{t('atColDim')}</th>
                              <th>{t('atColState')}</th>
                              <th>{t('atColDelivery')}</th>
                              <th>{t('atColAccessories')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredWorkload.map((w, i) => (
                              <tr key={i}>
                                <td>
                                  <strong>{w.projectName}</strong>
                                  <br />
                                  <small className="atp__muted">{w.projectRef}</small>
                                </td>
                                <td>{w.clientName || '—'}</td>
                                <td>
                                  <code>{w.chassisRef}</code>
                                  {w.unitIndex > 0 && (
                                    <span className="atp__unit-idx"> #{w.unitIndex + 1}</span>
                                  )}
                                </td>
                                <td>{w.dimension}</td>
                                <td>
                                  <span className="atp__etat-badge" style={{ '--c': ETAT_COLORS[w.etat] || '#a1a1aa' }}>
                                    <span className="atp__etat-badge-dot" />
                                    {ETAT_LABELS[w.etat] ? t(ETAT_LABELS[w.etat]) : w.etat}
                                  </span>
                                </td>
                                <td>{fmtDate(w.deliveryDate)}</td>
                                <td>
                                  {(w.accessories || []).filter(a => a.quantity > 0).length === 0
                                    ? <span className="atp__muted">—</span>
                                    : (w.accessories || []).filter(a => a.quantity > 0).map((a, ai) => (
                                      <span key={ai} className="atp__acc-chip">
                                        {a.label} <strong>{a.quantity}</strong>{a.unit && ` ${a.unit}`}
                                      </span>
                                    ))
                                  }
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table></div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── STOCK TAB ── */}
              {activeTab === 'stock' && (
                <div className="atp__popup-stock">
                  <h4 className="atp__popup-section-title">{t('atStockTitle')}</h4>
                  {stock.length === 0 ? (
                    <div className="atp__popup-empty">{t('atNoStock')}</div>
                  ) : (
                    <div className="atp__table-scroll"><table className="atp__popup-table">
                      <thead>
                        <tr>
                          <th>{t('atColAccessory')}</th><th>{t('atColUnit')}</th><th style={{ textAlign: 'right' }}>{t('atColQty')}</th><th>{t('atColAdjust')}</th><th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {stock.map((item, i) => (
                          <tr key={i} className={item.quantity <= 0 ? 'atp__stock-row--zero' : ''}>
                            <td>{item.label}</td>
                            <td>{item.unit || '—'}</td>
                            <td style={{ textAlign: 'right' }}>
                              <strong className={item.quantity <= 0 ? 'atp__qty-zero' : ''}>{item.quantity}</strong>
                            </td>
                            <td>
                              <div className="atp__adj-row">
                                <button className="atp__adj-btn atp__adj-btn--minus" disabled={saving} onClick={() => handleAdjust(item, -1)}>−1</button>
                                <button className="atp__adj-btn atp__adj-btn--plus"  disabled={saving} onClick={() => handleAdjust(item, +1)}>+1</button>
                                <button className="atp__adj-btn atp__adj-btn--custom" disabled={saving}
                                  onClick={() => setAdjusting({ idx: i, delta: '' })}><Ico d={IC.edit} size={13} /></button>
                              </div>
                              {adjusting?.idx === i && (
                                <div className="atp__adj-custom">
                                  <input type="number" className="atp__adj-input"
                                    value={adjusting.delta}
                                    onChange={e => setAdjusting({ ...adjusting, delta: e.target.value })}
                                    placeholder={t('atQtyPh')} />
                                  <button className="atp__adj-ok" onClick={() => {
                                    const d = parseFloat(adjusting.delta);
                                    if (!isNaN(d) && d !== 0) handleAdjust(item, d);
                                    setAdjusting(null);
                                  }}>OK</button>
                                  <button className="atp__adj-cancel" onClick={() => setAdjusting(null)}><Ico d={IC.x} size={13} /></button>
                                </div>
                              )}
                            </td>
                            <td>
                              <button
                                className="atp__adj-btn atp__adj-btn--danger"
                                disabled={saving}
                                title={t('atRemoveItemHint')}
                                onClick={() => handleRemoveItem(item)}
                              ><Ico d={IC.trash} size={13} /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table></div>
                  )}

                  <div className="atp__stock-add-section">
                    <h5 className="atp__popup-section-subtitle">{t('atAddFromInv')}</h5>
                    <input className="atp__stock-search" value={stockSearch} onChange={e => setStockSearch(e.target.value)}
                      placeholder={t('atSearchAcc')} />
                    {addingItem && (
                      <div className="atp__add-item-form">
                        <span className="atp__add-item-name">{addingItem.label}</span>
                        <input type="number" className="atp__adj-input" value={addQty} onChange={e => setAddQty(e.target.value)} placeholder={t('atQuantityPh')} min={1} />
                        <button className="atp__adj-ok" onClick={handleAddItem} disabled={saving}>{t('add')}</button>
                        <button className="atp__adj-cancel" onClick={() => { setAddingItem(null); setAddQty(''); }}><Ico d={IC.x} size={13} /></button>
                      </div>
                    )}
                    <div className="atp__inv-list">
                      {filteredInventory.slice(0, 12).map(it => (
                        <button key={it.id} className="atp__inv-chip"
                          onClick={() => setAddingItem({ itemId: it.id, label: it.designation?.fr || it.designation?.en || it.id, unit: '' })}>
                          {it.designation?.fr || it.designation?.en}
                          <span className="atp__inv-chip-stock">{it.quantity}</span>
                        </button>
                      ))}
                      {filteredInventory.length === 0 && <span className="atp__muted">{t('atNoResult')}</span>}
                    </div>
                  </div>
                </div>
              )}

              {/* ── RECAP TAB ── */}
              {activeTab === 'recap' && (
                <div className="atp__popup-recap">
                  <div className="atp__recap-toolbar">
                    <h4 className="atp__popup-section-title atp__popup-section-title--flush">{t('atConsumption', { name: table.name })}</h4>
                    <div className="atp__period-selector">
                      {[['daily', t('atDay')], ['weekly', t('atWeek')], ['monthly', t('atMonth')]].map(([k, l]) => (
                        <button key={k} className={`atp__period-btn${recapPeriod === k ? ' active' : ''}`}
                          onClick={() => setRecapPeriod(k)}>{l}</button>
                      ))}
                    </div>
                  </div>

                  {(() => {
                    const getPeriodKey = (dateStr) => {
                      const d = new Date(dateStr);
                      if (recapPeriod === 'daily')   return d.toISOString().split('T')[0];
                      if (recapPeriod === 'weekly') {
                        const jan1 = new Date(d.getFullYear(), 0, 1);
                        const w = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
                        return `${d.getFullYear()}-S${String(w).padStart(2,'0')}`;
                      }
                      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
                    };
                    const grouped = {};
                    for (const entry of recap) {
                      const key = getPeriodKey(entry.date || entry.createdAt);
                      if (!grouped[key]) grouped[key] = [];
                      grouped[key].push(entry);
                    }
                    const periods = Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]));
                    const TYPE_COLORS = { chassis_assignment: '#fbbf24', manual_in: '#4ade80', manual_out: '#f87171' };
                    const TYPE_LABELS = { chassis_assignment: t('atTypeChassis'), manual_in: t('atTypeIn'), manual_out: t('atTypeOut') };
                    return recap.length === 0 ? (
                      <div className="atp__popup-empty">{t('atNoConsumption')}</div>
                    ) : (
                      <div className="atp__recap-periods">
                        {periods.map(([periodKey, entries]) => (
                          <div key={periodKey} className="atp__recap-period-block">
                            <div className="atp__recap-period-header">
                              <span className="atp__recap-period-key">{periodKey}</span>
                              <span className="atp__recap-period-total">{t('atEntries', { n: entries.length })}</span>
                            </div>
                            <div className="atp__table-scroll"><table className="atp__popup-table atp__popup-table--compact">
                              <thead>
                                <tr>
                                  <th>{t('atColAccessory')}</th><th>{t('atColUnit')}</th><th>{t('atColType')}</th>
                                  <th>{t('atColQty')}</th><th>{t('atColProject')}</th><th>{t('atColChassis')}</th><th></th>
                                </tr>
                              </thead>
                              <tbody>
                                {entries.sort((a, b) => new Date(b.date||b.createdAt) - new Date(a.date||a.createdAt)).map((entry) => {
                                  const id = entry._id || entry.id;
                                  const isOut = entry.type === 'chassis_assignment' || entry.type === 'manual_out';
                                  return (
                                    <tr key={id}>
                                      <td>{entry.label}</td>
                                      <td>{entry.unit || '—'}</td>
                                      <td>
                                        <span className="atp__type-badge" style={{ '--c': TYPE_COLORS[entry.type] || '#a1a1aa' }}>
                                          {TYPE_LABELS[entry.type] || entry.type}
                                        </span>
                                      </td>
                                      <td>
                                        <span className={`atp__qty ${isOut ? 'atp__qty--out' : 'atp__qty--in'}`}>
                                          {isOut ? '−' : '+'}{entry.quantity}
                                        </span>
                                      </td>
                                      <td className="atp__muted">{entry.projectName || '—'}</td>
                                      <td style={{ fontSize: 11 }}>{entry.chassisRef ? <code>{entry.chassisRef}</code> : '—'}</td>
                                      <td>
                                        <button
                                          className="atp__adj-btn atp__adj-btn--danger"
                                          title={t('atDeleteEntry')}
                                          onClick={() => handleDeleteRecapEntry(id)}
                                        ><Ico d={IC.trash} size={13} /></button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table></div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Global Recap Modal ───────────────────────────────────────────────────────
function GlobalRecapModal({ tables, onClose }) {
  const { t } = useLanguage();
  const [period, setPeriod] = useState('monthly');
  const [recap, setRecap]   = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    axios.get(`${API_URL}/table-consumption/recap?period=${period}`)
      .then(r => setRecap(r.data || []))
      .catch(() => setRecap([]))
      .finally(() => setLoading(false));
  }, [period]);

  const allPeriodKeys = [...new Set(recap.flatMap(r => Object.keys(r.periods)))].sort((a, b) => b.localeCompare(a));

  return (
    <div className="atp__popup-overlay" onClick={onClose}>
      <div className="atp__popup atp__popup--wide" onClick={e => e.stopPropagation()}>
        <div className="atp__popup-header">
          <div className="atp__popup-title">
            <span className="atp__popup-icon"><Ico d={IC.chart} size={18} /></span>
            <h2>{t('atGlobalRecap')}</h2>
          </div>
          <button className="atp__popup-close" onClick={onClose}><Ico d={IC.x} /></button>
        </div>
        <div className="atp__recap-periodbar">
          {[['daily', t('atPerDay')], ['weekly', t('atPerWeek')], ['monthly', t('atPerMonth')]].map(([k, l]) => (
            <button key={k} className={`atp__period-btn${period === k ? ' active' : ''}`} onClick={() => setPeriod(k)}>{l}</button>
          ))}
        </div>
        <div className="atp__popup-body">
          {loading ? (
            <div className="atp__popup-loading"><div className="atp__loading-spinner" /><span>{t('loadingShort')}</span></div>
          ) : recap.length === 0 ? (
            <div className="atp__popup-empty">{t('atNoConsumptionData')}</div>
          ) : (
            <div className="atp__recap-periods">{allPeriodKeys.slice(0, 20).map(pk => (
              <div key={pk} className="atp__recap-period-block">
                <div className="atp__recap-period-header">
                  <span className="atp__recap-period-key">{pk}</span>
                </div>
                <div className="atp__table-scroll"><table className="atp__popup-table atp__popup-table--compact">
                  <thead>
                    <tr>
                      <th>{t('atColTable')}</th><th>{t('atColAccessory')}</th><th>{t('atColConsumed')}</th><th>{t('atColRestocked')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recap.flatMap(r =>
                      (r.periods[pk] || []).map((it, i) => (
                        <tr key={`${r.tableId}-${i}`}>
                          <td><strong>{r.tableName}</strong></td>
                          <td>{it.label}</td>
                          <td><span className="atp__recap-consumed">{it.consumed} {it.unit}</span></td>
                          <td>{it.restocked > 0 ? <span className="atp__recap-restocked">+{it.restocked}</span> : '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table></div>
              </div>
            ))}</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main AtelierTablesPage ───────────────────────────────────────────────────
function AtelierTablesPage() {
  const { t } = useLanguage();
  const [tables, setTables]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);
  const [error, setError]             = useState('');
  const [selectedId, setSelectedId]   = useState(null);
  const [editingId, setEditingId]     = useState(null);
  const [editName, setEditName]       = useState('');
  const [dragging, setDragging]       = useState(null);
  const [popupTable, setPopupTable]   = useState(null);
  const [showGlobalRecap, setShowGlobalRecap] = useState(false);
  const [workloads, setWorkloads]     = useState({});
  const [stockAlerts, setStockAlerts] = useState({});
  const svgRef = useRef(null);
  const clickTimerRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`${API_URL}/atelier-tables`);
        const t = res.data?.length ? res.data : DEFAULT_LAYOUT;
        setTables(t);
        loadWorkloads(t);
      } catch {
        setTables(DEFAULT_LAYOUT);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const loadWorkloads = async (tbls) => {
    const counts = {};
    const alerts = {};
    await Promise.allSettled(tbls.map(async t => {
      try {
        const [wRes, sRes] = await Promise.all([
          axios.get(`${API_URL}/atelier-tables/${t.id}/workload`),
          axios.get(`${API_URL}/table-stock/${t.id}`),
        ]);
        counts[t.id] = (wRes.data.workload || []).length;
        const stock = sRes.data.stock || [];
        alerts[t.id] = stock.some(s => s.quantity <= 0);
      } catch { counts[t.id] = 0; alerts[t.id] = false; }
    }));
    setWorkloads(counts);
    setStockAlerts(alerts);
  };

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      await axios.put(`${API_URL}/atelier-tables`, { tables });
      setSaved(true); setTimeout(() => setSaved(false), 2200);
    } catch (e) {
      setError(e.response?.data?.error || t('errSave'));
    } finally { setSaving(false); }
  };

  const handleAddTable = () => {
    const nextNum = tables.length > 0 ? Math.max(...tables.map(tb => tb.number)) + 1 : 1;
    const newTable = {
      id: `table-${nextNum}-${Date.now()}`,
      number: nextNum, name: t('atTableN', { n: nextNum }),
      x: 80 + (tables.length % 3) * 260,
      y: 80 + Math.floor(tables.length / 3) * 160,
      w: 200, h: 90,
    };
    setTables(prev => [...prev, newTable]);
    setSelectedId(newTable.id);
  };

  const handleDeleteSelected = async () => {
    if (!selectedId) return;
    const tbl = tables.find(tb => tb.id === selectedId);
    if (!(await dialog.confirm({ title: t('deleteTitle'), message: t('atDeleteTableConfirm', { name: tbl?.name || '' }), danger: true, confirmLabel: t('deleteAction') }))) return;
    setTables(prev => prev.filter(tb => tb.id !== selectedId));
    setSelectedId(null);
  };

  const handleDoubleClick = (table, e) => {
    e.stopPropagation();
    if (clickTimerRef.current) { clearTimeout(clickTimerRef.current); clickTimerRef.current = null; }
    setEditingId(table.id);
    setEditName(table.name);
  };

  const handleEditBlur = () => {
    if (editingId) {
      setTables(prev => prev.map(t => t.id === editingId ? { ...t, name: editName.trim() || t.name } : t));
      setEditingId(null);
    }
  };

  const handleTableClick = (table, e) => {
    e.stopPropagation();
    if (editingId) return;
    setSelectedId(table.id);
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      setPopupTable(table);
      clickTimerRef.current = null;
    }, 220);
  };

  const handleMouseDown = useCallback((e, tableId) => {
    if (editingId) return;
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const svgPt = pt.matrixTransform(svg.getScreenCTM().inverse());
    const table = tables.find(t => t.id === tableId);
    if (!table) return;
    setSelectedId(tableId);
    setDragging({ id: tableId, startX: svgPt.x, startY: svgPt.y, origX: table.x, origY: table.y, moved: false });
  }, [tables, editingId]);

  const handleMouseMove = useCallback((e) => {
    if (!dragging) return;
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const svgPt = pt.matrixTransform(svg.getScreenCTM().inverse());
    const dx = svgPt.x - dragging.startX;
    const dy = svgPt.y - dragging.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      setDragging(prev => ({ ...prev, moved: true }));
      if (clickTimerRef.current) { clearTimeout(clickTimerRef.current); clickTimerRef.current = null; }
    }
    setTables(prev => prev.map(t => {
      if (t.id !== dragging.id) return t;
      return { ...t, x: Math.max(0, Math.min(CANVAS_W - t.w, dragging.origX + dx)), y: Math.max(0, Math.min(CANVAS_H - t.h, dragging.origY + dy)) };
    }));
  }, [dragging]);

  const handleMouseUp = useCallback(() => { setDragging(null); }, []);

  const selectedTable = tables.find(t => t.id === selectedId);

  return (
    <div className="atp">
      <div className="atp__header">
        <div className="atp__header-left">
          <div className="atp__header-icon"><Ico d={IC.plan} size={20} /></div>
          <div>
            <h1 className="atp__title">{t('atTitle')}</h1>
            <p className="atp__subtitle">{t('atSubtitle')}</p>
          </div>
        </div>
        <div className="atp__header-actions">
          <button className="atp__btn atp__btn--recap" onClick={() => setShowGlobalRecap(true)}>
            <Ico d={IC.chart} size={15} /> {t('atGlobalRecapBtn')}
          </button>
          <button className="atp__btn atp__btn--add" onClick={handleAddTable}>
            <Ico d={IC.plus} size={15} /> {t('atAddTable')}
          </button>
          {selectedId && (
            <button className="atp__btn atp__btn--delete" onClick={handleDeleteSelected}><Ico d={IC.trash} size={15} /> {t('delete')}</button>
          )}
          <button className={`atp__btn atp__btn--save${saved ? ' atp__btn--saved' : ''}`} onClick={handleSave} disabled={saving}>
            {saving ? '…' : saved ? <><Ico d={IC.check} size={15} /> {t('atSaved')}</> : <><Ico d={IC.save} size={15} /> {t('save')}</>}
          </button>
        </div>
      </div>

      {error && <div className="atp__error">{error}</div>}

      {selectedTable && (
        <div className="atp__info-bar">
          <span className="atp__info-badge">#{selectedTable.number}</span>
          <strong>{selectedTable.name}</strong>
          <span className="atp__info-hint">{t('atHint')}</span>
          <button className="atp__info-open-btn" onClick={() => setPopupTable(selectedTable)}>{t('atOpen')}</button>
        </div>
      )}

      <div className="atp__canvas-wrap">
        <div className="atp__canvas-label atp__canvas-label--top">{t('atEntrance')}</div>
        <div className="atp__canvas-label atp__canvas-label--left">{t('atNorth')}</div>
        {loading ? (
          <div className="atp__loading"><div className="atp__loading-spinner" /><span>{t('atLoading')}</span></div>
        ) : (
          <svg ref={svgRef} className="atp__svg" viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
            onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
            onClick={e => { if (e.target === svgRef.current || e.target.classList.contains('atp__floor')) setSelectedId(null); }}>
            <defs>
              <filter id="blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4" /></filter>
              <pattern id="floor-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <rect width="40" height="40" fill="#0e0e11" />
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.045)" strokeWidth="1" />
              </pattern>
              <pattern id="wall-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="8" height="8" fill="#1c1c21" />
                <line x1="0" y1="4" x2="8" y2="4" stroke="#2c2c33" strokeWidth="1.5" />
              </pattern>
            </defs>
            <rect className="atp__floor" x={0} y={0} width={CANVAS_W} height={CANVAS_H} fill="url(#floor-grid)" rx={4} />
            <rect x={0} y={0} width={CANVAS_W} height={16} fill="url(#wall-hatch)" />
            <rect x={0} y={CANVAS_H - 16} width={CANVAS_W} height={16} fill="url(#wall-hatch)" />
            <rect x={0} y={0} width={16} height={CANVAS_H} fill="url(#wall-hatch)" />
            <rect x={CANVAS_W - 16} y={0} width={16} height={CANVAS_H} fill="url(#wall-hatch)" />
            <rect x={16} y={16} width={CANVAS_W - 32} height={CANVAS_H - 32} fill="none" stroke="#34343b" strokeWidth="1" />
            <rect x={CANVAS_W / 2 - 60} y={CANVAS_H - 17} width={120} height={18} fill="#0e0e11" />
            <path d={`M ${CANVAS_W / 2 - 60} ${CANVAS_H - 16} A 60 60 0 0 1 ${CANVAS_W / 2} ${CANVAS_H - 76}`} fill="none" stroke="#3f3f46" strokeWidth="1" strokeDasharray="3 4" />
            <line x1={CANVAS_W / 2} y1={CANVAS_H - 16} x2={CANVAS_W / 2} y2={CANVAS_H - 76} stroke="#3f3f46" strokeWidth="1" />
            <text x={CANVAS_W / 2 + 30} y={CANVAS_H - 30} textAnchor="middle" className="atp__door-label">{t('atEntrance')}</text>
            {[1, 2, 3, 4].map(i => (
              <line key={`vr${i}`} x1={i * (CANVAS_W / 5)} y1={16} x2={i * (CANVAS_W / 5)} y2={CANVAS_H - 16}
                stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="2,10" />
            ))}
            {[1, 2, 3].map(i => (
              <line key={`hr${i}`} x1={16} y1={i * (CANVAS_H / 4)} x2={CANVAS_W - 16} y2={i * (CANVAS_H / 4)}
                stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="2,10" />
            ))}
            {tables.map(table => (
              <WorkshopTable
                key={table.id}
                table={table}
                isSelected={selectedId === table.id}
                isDragging={dragging?.id === table.id}
                onMouseDown={e => handleMouseDown(e, table.id)}
                onDoubleClick={e => handleDoubleClick(table, e)}
                onClick={e => handleTableClick(table, e)}
                editingId={editingId}
                editName={editName}
                onEditChange={setEditName}
                onEditBlur={handleEditBlur}
                workloadCount={workloads[table.id] || 0}
                stockAlert={stockAlerts[table.id] || false}
              />
            ))}
            {tables.length === 0 && (
              <text x={CANVAS_W / 2} y={CANVAS_H / 2} textAnchor="middle" dominantBaseline="central" className="atp__empty-hint">
                {t('atNoTableHint')}
              </text>
            )}
          </svg>
        )}
        <div className="atp__canvas-label atp__canvas-label--right">{t('atSouth')}</div>
      </div>

      <div className="atp__list-section">
        <h3 className="atp__list-title">{t('atConfigured')} <span className="atp__list-count">{tables.length}</span></h3>
        <div className="atp__list">
          {tables.map(table => (
            <div key={table.id}
              className={`atp__list-item${selectedId === table.id ? ' atp__list-item--selected' : ''}`}
              onClick={() => setSelectedId(table.id)}
              onDoubleClick={() => { setEditingId(table.id); setEditName(table.name); }}>
              <span className="atp__list-num">#{table.number}</span>
              <span className="atp__list-name">{table.name}</span>
              {(workloads[table.id] || 0) > 0 && <span className="atp__list-workload">{t('atChassisCount', { n: workloads[table.id] })}</span>}
              {stockAlerts[table.id] && <span className="atp__list-alert">{t('atLowStock')}</span>}
              <button className="atp__list-open-btn" onClick={e => { e.stopPropagation(); setPopupTable(table); }}>{t('atDetails')}</button>
            </div>
          ))}
          {tables.length === 0 && <div className="atp__list-empty">{t('atNoTable')}</div>}
        </div>
      </div>

      {popupTable && (
        <TableDetailPopup
          table={popupTable}
          onClose={() => {
            setPopupTable(null);
            loadWorkloads(tables);
          }}
        />
      )}
      {showGlobalRecap && (
        <GlobalRecapModal tables={tables} onClose={() => setShowGlobalRecap(false)} />
      )}
    </div>
  );
}

export default AtelierTablesPage;