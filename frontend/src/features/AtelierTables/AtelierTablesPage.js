import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
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
  non_entame: '#9ca3af',
  en_cours: '#f59e0b',
  non_vitre: '#a855f7',
  fabrique: '#3b82f6',
  pret_a_livrer: '#ef4444',
  livre: '#16a34a',
};
const ETAT_LABELS = {
  non_entame: 'Non entamé',
  en_cours: 'En cours',
  non_vitre: 'Non vitré',
  fabrique: 'Fabriqué',
  pret_a_livrer: 'Prêt à livrer',
  livre: 'Livré',
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
      <rect x={table.x + 4} y={table.y + 6} width={table.w} height={table.h} rx={10} ry={10} fill="rgba(0,0,0,0.18)" filter="url(#blur)" />
      <rect x={table.x} y={table.y} width={table.w} height={table.h} rx={10} ry={10}
        className={`atp__table-rect${isSelected ? ' atp__table-rect--selected' : ''}`} />
      {[0.25, 0.5, 0.75].map((frac, i) => (
        <line key={i} x1={table.x + 12} y1={table.y + table.h * frac}
          x2={table.x + table.w - 12} y2={table.y + table.h * frac} className="atp__table-grain" />
      ))}
      <circle cx={table.x + 22} cy={table.y + 22} r={14} className="atp__table-badge-circle" />
      <text x={table.x + 22} y={table.y + 22} textAnchor="middle" dominantBaseline="central" className="atp__table-badge-num">{table.number}</text>
      {!isEditing ? (
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" className="atp__table-name-text">{table.name}</text>
      ) : (
        <foreignObject x={table.x + 12} y={cy - 16} width={table.w - 24} height={32}>
          <TableNameEditor value={editName} onChange={onEditChange} onBlur={onEditBlur} />
        </foreignObject>
      )}
      {workloadCount > 0 && (
        <g>
          <circle cx={table.x + table.w - 18} cy={table.y + 18} r={13} fill="#3b82f6" />
          <text x={table.x + table.w - 18} y={table.y + 18} textAnchor="middle" dominantBaseline="central"
            style={{ fontSize: 10, fontWeight: 700, fill: '#fff', userSelect: 'none' }}>{workloadCount}</text>
        </g>
      )}
      {stockAlert && (
        <circle cx={table.x + table.w - 14} cy={table.y + table.h - 14} r={7} fill="#ef4444" />
      )}
      {isSelected && (
        <rect x={table.x - 3} y={table.y - 3} width={table.w + 6} height={table.h + 6}
          rx={13} ry={13} fill="none" strokeWidth={2.5} className="atp__table-selection-ring" />
      )}
    </g>
  );
}

// ─── Etat Filter Bar ──────────────────────────────────────────────────────────
function EtatFilterBar({ workload, activeFilter, onChange }) {
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
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px 0 4px', alignItems: 'center' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', marginRight: 2 }}>
        Filtrer :
      </span>
      {/* "All" pill */}
      <button
        onClick={() => onChange('all')}
        style={{
          padding: '3px 10px',
          borderRadius: 999,
          border: '1.5px solid',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          borderColor: activeFilter === 'all' ? '#1a1a1a' : '#e5e7eb',
          background: activeFilter === 'all' ? '#1a1a1a' : '#fff',
          color: activeFilter === 'all' ? '#fff' : '#374151',
          transition: 'all .15s',
        }}
      >
        Tous ({workload.length})
      </button>
      {presentEtats.map(e => {
        const active = activeFilter === e;
        return (
          <button
            key={e}
            onClick={() => onChange(active ? 'all' : e)}
            style={{
              padding: '3px 10px',
              borderRadius: 999,
              border: '1.5px solid',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              borderColor: active ? ETAT_COLORS[e] : '#e5e7eb',
              background: active ? ETAT_COLORS[e] : '#fff',
              color: active ? '#fff' : '#374151',
              transition: 'all .15s',
            }}
          >
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: active ? '#fff' : ETAT_COLORS[e],
              display: 'inline-block', flexShrink: 0,
            }} />
            {ETAT_LABELS[e]}
            <span style={{
              background: active ? 'rgba(255,255,255,.25)' : ETAT_COLORS[e] + '22',
              color: active ? '#fff' : ETAT_COLORS[e],
              borderRadius: 999,
              padding: '0 5px',
              fontSize: 11,
              fontWeight: 700,
              minWidth: 18,
              textAlign: 'center',
            }}>
              {counts[e]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Table Detail Popup ───────────────────────────────────────────────────────
function TableDetailPopup({ table, onClose }) {
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
    if (!window.confirm('Supprimer cette entrée du journal de consommation ?')) return;
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
    if (!window.confirm(`Retirer "${item.label}" du stock de cette table ?\nLa quantité restante (${item.quantity}) sera retournée à l'inventaire global.`)) return;
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
          <button className="atp__popup-close" onClick={onClose}>✕</button>
        </div>

        {/* Workers strip */}
        <div className="atp__popup-workers">
          <span className="atp__popup-workers-label">👷 Opérateurs :</span>
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
                placeholder="Ajouter opérateur…" className="atp__worker-input" />
              <button onClick={addWorker} className="atp__worker-addbtn">＋</button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="atp__popup-tabs">
          {[
            ['workload', `📋 En cours${workload.length > 0 ? ` (${workload.length})` : ''}`],
            ['stock', '🔧 Stock'],
            ['recap', '📊 Récap'],
          ].map(([k, label]) => (
            <button key={k} className={`atp__popup-tab${activeTab === k ? ' active' : ''}`} onClick={() => setActiveTab(k)}>
              {label}
            </button>
          ))}
        </div>

        <div className="atp__popup-body">
          {loading ? (
            <div className="atp__popup-loading"><div className="atp__loading-spinner" /><span>Chargement…</span></div>
          ) : (
            <>
              {/* ── WORKLOAD TAB ── */}
              {activeTab === 'workload' && (
                <div className="atp__popup-workload">
                  {workload.length === 0 ? (
                    <div className="atp__popup-empty">Aucun châssis assigné à cette table</div>
                  ) : (
                    <>
                      {/* Etat filter pills */}
                      <EtatFilterBar
                        workload={workload}
                        activeFilter={etatFilter}
                        onChange={setEtatFilter}
                      />

                      {filteredWorkload.length === 0 ? (
                        <div className="atp__popup-empty" style={{ marginTop: 16 }}>
                          Aucun châssis avec l'état &laquo;&nbsp;
                          <span style={{ color: ETAT_COLORS[etatFilter], fontWeight: 700 }}>
                            {ETAT_LABELS[etatFilter]}
                          </span>
                          &nbsp;&raquo;
                        </div>
                      ) : (
                        <table className="atp__popup-table" style={{ marginTop: 8 }}>
                          <thead>
                            <tr>
                              <th>Projet</th>
                              <th>Client</th>
                              <th>Réf châssis</th>
                              <th>Dim.</th>
                              <th>État</th>
                              <th>Livraison</th>
                              <th>Accessoires</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredWorkload.map((w, i) => (
                              <tr key={i}>
                                <td>
                                  <strong>{w.projectName}</strong>
                                  <br />
                                  <small style={{ color: '#6b7280' }}>{w.projectRef}</small>
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
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 5,
                                    padding: '2px 8px',
                                    borderRadius: 999,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    background: (ETAT_COLORS[w.etat] || '#9ca3af') + '1a',
                                    color: ETAT_COLORS[w.etat] || '#9ca3af',
                                    border: `1px solid ${(ETAT_COLORS[w.etat] || '#9ca3af')}40`,
                                    whiteSpace: 'nowrap',
                                  }}>
                                    <span style={{
                                      width: 7, height: 7, borderRadius: '50%',
                                      background: ETAT_COLORS[w.etat] || '#9ca3af',
                                      display: 'inline-block', flexShrink: 0,
                                    }} />
                                    {ETAT_LABELS[w.etat] || w.etat}
                                  </span>
                                </td>
                                <td>{fmtDate(w.deliveryDate)}</td>
                                <td>
                                  {(w.accessories || []).filter(a => a.quantity > 0).length === 0
                                    ? <span style={{ color: '#9ca3af' }}>—</span>
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
                        </table>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── STOCK TAB ── */}
              {activeTab === 'stock' && (
                <div className="atp__popup-stock">
                  <h4 className="atp__popup-section-title">Stock d'accessoires de la table</h4>
                  {stock.length === 0 ? (
                    <div className="atp__popup-empty">Aucun accessoire en stock</div>
                  ) : (
                    <table className="atp__popup-table">
                      <thead>
                        <tr>
                          <th>Accessoire</th><th>Unité</th><th style={{ textAlign: 'right' }}>Qté</th><th>Ajuster</th><th></th>
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
                                  onClick={() => setAdjusting({ idx: i, delta: '' })}>✎</button>
                              </div>
                              {adjusting?.idx === i && (
                                <div className="atp__adj-custom">
                                  <input type="number" className="atp__adj-input"
                                    value={adjusting.delta}
                                    onChange={e => setAdjusting({ ...adjusting, delta: e.target.value })}
                                    placeholder="±qté" />
                                  <button className="atp__adj-ok" onClick={() => {
                                    const d = parseFloat(adjusting.delta);
                                    if (!isNaN(d) && d !== 0) handleAdjust(item, d);
                                    setAdjusting(null);
                                  }}>OK</button>
                                  <button className="atp__adj-cancel" onClick={() => setAdjusting(null)}>✕</button>
                                </div>
                              )}
                            </td>
                            <td>
                              <button
                                className="atp__adj-btn"
                                disabled={saving}
                                title="Retirer cet accessoire du stock de la table (retour inventaire)"
                                style={{ color: '#ef4444', borderColor: '#fca5a5' }}
                                onClick={() => handleRemoveItem(item)}
                              >🗑</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  <div className="atp__stock-add-section">
                    <h5 className="atp__popup-section-subtitle">➕ Ajouter depuis l'inventaire accessoires</h5>
                    <input className="atp__stock-search" value={stockSearch} onChange={e => setStockSearch(e.target.value)}
                      placeholder="Rechercher un accessoire…" />
                    {addingItem && (
                      <div className="atp__add-item-form">
                        <span className="atp__add-item-name">{addingItem.label}</span>
                        <input type="number" className="atp__adj-input" value={addQty} onChange={e => setAddQty(e.target.value)} placeholder="Quantité" min={1} />
                        <button className="atp__adj-ok" onClick={handleAddItem} disabled={saving}>Ajouter</button>
                        <button className="atp__adj-cancel" onClick={() => { setAddingItem(null); setAddQty(''); }}>✕</button>
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
                      {filteredInventory.length === 0 && <span style={{ color: '#9ca3af', fontSize: 13 }}>Aucun résultat</span>}
                    </div>
                  </div>
                </div>
              )}

              {/* ── RECAP TAB ── */}
              {activeTab === 'recap' && (
                <div className="atp__popup-recap">
                  <div className="atp__recap-toolbar">
                    <h4 className="atp__popup-section-title" style={{ margin: 0 }}>Consommation — {table.name}</h4>
                    <div className="atp__period-selector">
                      {[['daily','Jour'], ['weekly','Semaine'], ['monthly','Mois']].map(([k, l]) => (
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
                    const TYPE_COLORS = { chassis_assignment: '#f59e0b', manual_in: '#16a34a', manual_out: '#ef4444' };
                    const TYPE_LABELS = { chassis_assignment: 'Châssis', manual_in: 'Appro.', manual_out: 'Retrait' };
                    return recap.length === 0 ? (
                      <div className="atp__popup-empty">Aucune consommation enregistrée</div>
                    ) : (
                      <div className="atp__recap-periods">
                        {periods.map(([periodKey, entries]) => (
                          <div key={periodKey} className="atp__recap-period-block">
                            <div className="atp__recap-period-header">
                              <span className="atp__recap-period-key">{periodKey}</span>
                              <span className="atp__recap-period-total">{entries.length} entrée{entries.length > 1 ? 's' : ''}</span>
                            </div>
                            <table className="atp__popup-table atp__popup-table--compact">
                              <thead>
                                <tr>
                                  <th>Accessoire</th><th>Unité</th><th>Type</th>
                                  <th>Qté</th><th>Projet</th><th>Châssis</th><th></th>
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
                                        <span style={{ fontSize: 11, fontWeight: 600, color: TYPE_COLORS[entry.type] || '#888' }}>
                                          {TYPE_LABELS[entry.type] || entry.type}
                                        </span>
                                      </td>
                                      <td>
                                        <span style={{ fontWeight: 700, color: isOut ? '#ef4444' : '#16a34a' }}>
                                          {isOut ? '−' : '+'}{entry.quantity}
                                        </span>
                                      </td>
                                      <td style={{ fontSize: 11, color: '#6b7280' }}>{entry.projectName || '—'}</td>
                                      <td style={{ fontSize: 11 }}>{entry.chassisRef ? <code>{entry.chassisRef}</code> : '—'}</td>
                                      <td>
                                        <button
                                          className="atp__adj-btn"
                                          style={{ color: '#ef4444', borderColor: '#fca5a5' }}
                                          title="Supprimer cette entrée"
                                          onClick={() => handleDeleteRecapEntry(id)}
                                        >🗑</button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
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

  const allPeriodKeys = [...new Set(recap.flatMap(t => Object.keys(t.periods)))].sort((a, b) => b.localeCompare(a));

  return (
    <div className="atp__popup-overlay" onClick={onClose}>
      <div className="atp__popup atp__popup--wide" onClick={e => e.stopPropagation()}>
        <div className="atp__popup-header">
          <div className="atp__popup-title">
            <span style={{ fontSize: 22 }}>📊</span>
            <h2>Récap global — Consommation accessoires</h2>
          </div>
          <button className="atp__popup-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '12px 20px 0', display: 'flex', gap: 8 }}>
          {[['daily','Par jour'], ['weekly','Par semaine'], ['monthly','Par mois']].map(([k, l]) => (
            <button key={k} className={`atp__period-btn${period === k ? ' active' : ''}`} onClick={() => setPeriod(k)}>{l}</button>
          ))}
        </div>
        <div className="atp__popup-body">
          {loading ? (
            <div className="atp__popup-loading"><div className="atp__loading-spinner" /><span>Chargement…</span></div>
          ) : recap.length === 0 ? (
            <div className="atp__popup-empty">Aucune donnée de consommation</div>
          ) : (
            allPeriodKeys.slice(0, 20).map(pk => (
              <div key={pk} className="atp__recap-period-block">
                <div className="atp__recap-period-header">
                  <span className="atp__recap-period-key">{pk}</span>
                </div>
                <table className="atp__popup-table atp__popup-table--compact">
                  <thead>
                    <tr>
                      <th>Table</th><th>Accessoire</th><th>Consommé</th><th>Réappro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recap.flatMap(t =>
                      (t.periods[pk] || []).map((it, i) => (
                        <tr key={`${t.tableId}-${i}`}>
                          <td><strong>{t.tableName}</strong></td>
                          <td>{it.label}</td>
                          <td><span className="atp__recap-consumed">{it.consumed} {it.unit}</span></td>
                          <td>{it.restocked > 0 ? <span className="atp__recap-restocked">+{it.restocked}</span> : '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main AtelierTablesPage ───────────────────────────────────────────────────
function AtelierTablesPage() {
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
      setError(e.response?.data?.error || 'Erreur lors de la sauvegarde');
    } finally { setSaving(false); }
  };

  const handleAddTable = () => {
    const nextNum = tables.length > 0 ? Math.max(...tables.map(t => t.number)) + 1 : 1;
    const newTable = {
      id: `table-${nextNum}-${Date.now()}`,
      number: nextNum, name: `Table ${nextNum}`,
      x: 80 + (tables.length % 3) * 260,
      y: 80 + Math.floor(tables.length / 3) * 160,
      w: 200, h: 90,
    };
    setTables(prev => [...prev, newTable]);
    setSelectedId(newTable.id);
  };

  const handleDeleteSelected = () => {
    if (!selectedId) return;
    if (!window.confirm('Supprimer cette table ?')) return;
    setTables(prev => prev.filter(t => t.id !== selectedId));
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
          <div className="atp__header-icon">🏭</div>
          <div>
            <h1 className="atp__title">Atelier — Tables de travail</h1>
            <p className="atp__subtitle">Vue de dessus · Clic pour détails · Double-clic pour renommer · Glisser pour repositionner</p>
          </div>
        </div>
        <div className="atp__header-actions">
          <button className="atp__btn atp__btn--recap" onClick={() => setShowGlobalRecap(true)}>
            📊 Récap global
          </button>
          <button className="atp__btn atp__btn--add" onClick={handleAddTable}>
            <span>＋</span> Ajouter une table
          </button>
          {selectedId && (
            <button className="atp__btn atp__btn--delete" onClick={handleDeleteSelected}>🗑 Supprimer</button>
          )}
          <button className={`atp__btn atp__btn--save${saved ? ' atp__btn--saved' : ''}`} onClick={handleSave} disabled={saving}>
            {saving ? '…' : saved ? '✓ Enregistré' : '💾 Enregistrer'}
          </button>
        </div>
      </div>

      {error && <div className="atp__error">{error}</div>}

      {selectedTable && (
        <div className="atp__info-bar">
          <span className="atp__info-badge">#{selectedTable.number}</span>
          <strong>{selectedTable.name}</strong>
          <span className="atp__info-hint">Clic = détails · Double-clic = renommer</span>
          <button className="atp__info-open-btn" onClick={() => setPopupTable(selectedTable)}>Ouvrir ↗</button>
        </div>
      )}

      <div className="atp__canvas-wrap">
        <div className="atp__canvas-label atp__canvas-label--top">ENTRÉE</div>
        <div className="atp__canvas-label atp__canvas-label--left">NORD</div>
        {loading ? (
          <div className="atp__loading"><div className="atp__loading-spinner" /><span>Chargement de l'atelier…</span></div>
        ) : (
          <svg ref={svgRef} className="atp__svg" viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
            onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
            onClick={e => { if (e.target === svgRef.current || e.target.classList.contains('atp__floor')) setSelectedId(null); }}>
            <defs>
              <filter id="blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4" /></filter>
              <pattern id="floor-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <rect width="40" height="40" fill="#f5f3ee" />
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e2ddd5" strokeWidth="0.8" />
              </pattern>
              <pattern id="wall-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="8" height="8" fill="#c8c0b4" />
                <line x1="0" y1="4" x2="8" y2="4" stroke="#b8b0a4" strokeWidth="1.5" />
              </pattern>
            </defs>
            <rect className="atp__floor" x={0} y={0} width={CANVAS_W} height={CANVAS_H} fill="url(#floor-grid)" rx={4} />
            <rect x={0} y={0} width={CANVAS_W} height={16} fill="url(#wall-hatch)" />
            <rect x={0} y={CANVAS_H - 16} width={CANVAS_W} height={16} fill="url(#wall-hatch)" />
            <rect x={0} y={0} width={16} height={CANVAS_H} fill="url(#wall-hatch)" />
            <rect x={CANVAS_W - 16} y={0} width={16} height={CANVAS_H} fill="url(#wall-hatch)" />
            <rect x={CANVAS_W / 2 - 40} y={CANVAS_H - 17} width={80} height={18} fill="#f5f3ee" />
            <text x={CANVAS_W / 2} y={CANVAS_H - 5} textAnchor="middle" className="atp__door-label">▼ ENTRÉE</text>
            {[1, 2, 3, 4].map(i => (
              <line key={`vr${i}`} x1={i * (CANVAS_W / 5)} y1={16} x2={i * (CANVAS_W / 5)} y2={CANVAS_H - 16}
                stroke="#ddd8d0" strokeWidth="0.5" strokeDasharray="4,8" />
            ))}
            {[1, 2, 3].map(i => (
              <line key={`hr${i}`} x1={16} y1={i * (CANVAS_H / 4)} x2={CANVAS_W - 16} y2={i * (CANVAS_H / 4)}
                stroke="#ddd8d0" strokeWidth="0.5" strokeDasharray="4,8" />
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
                Aucune table — cliquez sur "Ajouter une table"
              </text>
            )}
          </svg>
        )}
        <div className="atp__canvas-label atp__canvas-label--right">SUD</div>
      </div>

      <div className="atp__list-section">
        <h3 className="atp__list-title">Tables configurées <span className="atp__list-count">{tables.length}</span></h3>
        <div className="atp__list">
          {tables.map(table => (
            <div key={table.id}
              className={`atp__list-item${selectedId === table.id ? ' atp__list-item--selected' : ''}`}
              onClick={() => setSelectedId(table.id)}
              onDoubleClick={() => { setEditingId(table.id); setEditName(table.name); }}>
              <span className="atp__list-num">#{table.number}</span>
              <span className="atp__list-name">{table.name}</span>
              {(workloads[table.id] || 0) > 0 && <span className="atp__list-workload">{workloads[table.id]} châssis</span>}
              {stockAlerts[table.id] && <span className="atp__list-alert">⚠ stock bas</span>}
              <button className="atp__list-open-btn" onClick={e => { e.stopPropagation(); setPopupTable(table); }}>Détails ↗</button>
            </div>
          ))}
          {tables.length === 0 && <div className="atp__list-empty">Aucune table configurée</div>}
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