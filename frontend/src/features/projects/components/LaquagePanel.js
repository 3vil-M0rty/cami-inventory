import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const ROLE_BARREMAN     = 'BARREMAN';
const ROLE_MAGASINIER   = 'Magasinier';
const ROLE_LAQUAGE      = 'Laquage';
const ROLE_COORDINATEUR = 'Coordinateur';

const BARRE_STATUSES = {
  draft:             { label: 'Brouillon',                color: '#9ca3af' },
  sent_to_laquage:   { label: 'Envoyé au laquage',        color: '#f59e0b' },
  received_laquage:  { label: 'Reçu au laquage',          color: '#3b82f6' },
  returned_to_coord: { label: 'Retourné au coordinateur', color: '#8b5cf6' },
  received_coord:    { label: 'Reçu par coordinateur',    color: '#16a34a' },
};

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const s = BARRE_STATUSES[status] || BARRE_STATUSES.draft;
  return (
    <span className="laq-status-badge" style={{ background: s.color + '20', color: s.color, border: `1px solid ${s.color}40` }}>
      {s.label}
    </span>
  );
}

// ─── PDF print ────────────────────────────────────────────────────────────────
function printLaquagePDF(record, project, type) {
  const isBarres = type === 'barres';
  const title = isBarres ? 'Barres à Laquer' : 'Accessoires à Laquer';
  const date = new Date().toLocaleDateString('fr-FR');
  const closeScript = '<' + '/script>';

  let tableHTML = '';
  if (isBarres) {
    const rows = [
      ...(record.barresBrutes || []).map(r =>
        `<tr><td>Barre Brute</td><td>${r.reference || '—'}</td><td>${r.quantiteBrute || 0}</td><td>—</td><td>—</td><td>—</td></tr>`),
      ...(record.barresLaquees || []).map(r =>
        `<tr><td>Barre Laquée</td><td>${r.reference || '—'}</td><td>—</td><td>${r.ral || '—'}</td><td>${r.quantiteLaquee || 0}</td><td>—</td></tr>`),
      ...(record.morceauxBruts || []).map(r =>
        `<tr><td>Morceau Brut</td><td>${r.reference || '—'}</td><td>—</td><td>—</td><td>—</td><td>${r.mesure || '—'} × ${r.quantite || 0}</td></tr>`),
      ...(record.morceauxLaques || []).flatMap(r =>
        (r.lignes || []).map(l =>
          `<tr><td>Morceau Laqué</td><td>${r.reference || '—'}</td><td>—</td><td>${l.ral || '—'}</td><td>${l.quantite || 0}</td><td>${l.mesure || '—'}</td></tr>`)),
    ].join('');
    tableHTML = `<table>
      <thead><tr><th>Type</th><th>Référence</th><th>Qté Brutes</th><th>RAL</th><th>Qté Laquées</th><th>Mesure / Qté</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:#aaa">Aucune ligne</td></tr>'}</tbody>
    </table>`;
  } else {
    const rows = (record.accessoires || []).map(a =>
      `<tr><td>${a.designation || '—'}</td><td>${a.quantite || 0}</td><td>${a.notes || '—'}</td></tr>`
    ).join('');
    tableHTML = `<table>
      <thead><tr><th>Désignation</th><th>Quantité</th><th>Notes</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="3" style="text-align:center;color:#aaa">Aucun accessoire</td></tr>'}</tbody>
    </table>`;
  }

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${title}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#1a1a1a;padding:28px 36px}
    h1{font-size:18px;font-weight:800;margin-bottom:12px}
    .meta{display:flex;gap:16px;font-size:12px;color:#555;margin-bottom:20px;flex-wrap:wrap}
    table{width:100%;border-collapse:collapse}
    thead tr{background:#1a1a1a;color:#fff}
    th{padding:9px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.06em}
    td{padding:9px 12px;border-bottom:1px solid #f0f0f0;font-size:12.5px}
    tr:nth-child(even) td{background:#f9fafb}
    @media print{*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}body{padding:12mm 16mm}@page{size:A4;margin:0}}
  </style></head><body>
  <h1>🎨 ${title}</h1>
  <div class="meta">
    <span>Projet : <strong>${project.name}</strong></span>
    <span>Réf : <strong>${project.reference}</strong></span>
    <span>RAL : <strong>${project.ralCode}</strong></span>
    <span>Date : <strong>${date}</strong></span>
    <span>Statut : <strong>${BARRE_STATUSES[record.status]?.label || '—'}</strong></span>
  </div>
  ${tableHTML}
  <script>window.onload=()=>window.print();${closeScript}
  </body></html>`;

  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
}

// ─── Confirm modal ────────────────────────────────────────────────────────────
function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <p style={{ marginBottom: 20, fontSize: 14, lineHeight: 1.6 }}>{message}</p>
        <div className="modal-actions">
          <button onClick={onCancel}>Annuler</button>
          <button className="primary" onClick={onConfirm}>Confirmer</button>
        </div>
      </div>
    </div>
  );
}

// ─── Inventory search — aluminium ─────────────────────────────────────────────
function AlumSearch({ value, onChange, onSelect }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef(null);
  const debRef  = useRef(null);

  useEffect(() => {
    const h = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const search = q => {
    clearTimeout(debRef.current);
    if (!q || q.length < 2) { setSuggestions([]); setOpen(false); return; }
    debRef.current = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await axios.get(`${API_URL}/inventory/search?q=${encodeURIComponent(q)}&superCategory=aluminium`);
        const items = (res.data || []).slice(0, 10);
        setSuggestions(items);
        setOpen(items.length > 0);
      } catch { setSuggestions([]); } finally { setBusy(false); }
    }, 250);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 2, minWidth: 220 }}>
      <label>Référence (inventaire aluminium)</label>
      <div style={{ position: 'relative' }}>
        <input
          className="laq-add-input"
          value={value}
          placeholder="🔍 Tapez pour chercher…"
          onChange={e => { onChange(e.target.value); search(e.target.value); }}
          onFocus={() => value.length >= 2 && suggestions.length > 0 && setOpen(true)}
        />
        {busy && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12 }}>⏳</span>}
      </div>
      {open && suggestions.length > 0 && (
        <div className="laq-dropdown">
          <div className="laq-dropdown__header">{suggestions.length} résultat(s) — inventaire aluminium</div>
          {suggestions.map(item => {
            const label = item.designation?.fr || item.designation || String(item.id);
            return (
              <div key={item.id || item._id} className="laq-dropdown__item"
                onMouseDown={() => { onSelect(label); setOpen(false); setSuggestions([]); }}>
                📦 {label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Inventory search — accessoires ──────────────────────────────────────────
function AccSearch({ value, onChange, onSelect }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef(null);
  const debRef  = useRef(null);

  useEffect(() => {
    const h = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const search = q => {
    clearTimeout(debRef.current);
    if (!q || q.length < 2) { setSuggestions([]); setOpen(false); return; }
    debRef.current = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await axios.get(`${API_URL}/inventory/search?q=${encodeURIComponent(q)}&superCategory=accessoires`);
        const items = (res.data || []).slice(0, 10);
        setSuggestions(items);
        setOpen(items.length > 0);
      } catch { setSuggestions([]); } finally { setBusy(false); }
    }, 250);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 2, minWidth: 220 }}>
      <label>Désignation (inventaire accessoires)</label>
      <div style={{ position: 'relative' }}>
        <input
          className="laq-add-input"
          value={value}
          placeholder="🔍 Tapez pour chercher…"
          onChange={e => { onChange(e.target.value); search(e.target.value); }}
          onFocus={() => value.length >= 2 && suggestions.length > 0 && setOpen(true)}
        />
        {busy && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12 }}>⏳</span>}
      </div>
      {open && suggestions.length > 0 && (
        <div className="laq-dropdown">
          <div className="laq-dropdown__header">{suggestions.length} résultat(s) — inventaire accessoires</div>
          {suggestions.map(item => {
            const label = item.designation?.fr || item.designation || String(item.id);
            return (
              <div key={item.id || item._id} className="laq-dropdown__item"
                onMouseDown={() => { onSelect(label); setOpen(false); setSuggestions([]); }}>
                🔩 {label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Workflow timeline ────────────────────────────────────────────────────────
function WorkflowTimeline({ status }) {
  const steps = [
    { key: 'draft',             label: 'Brouillon',      role: 'Barreman / Magasinier' },
    { key: 'sent_to_laquage',   label: 'Envoyé',         role: 'Barreman / Magasinier' },
    { key: 'received_laquage',  label: 'Reçu (Laquage)', role: 'Laquage' },
    { key: 'returned_to_coord', label: 'Retourné',       role: 'Laquage' },
    { key: 'received_coord',    label: 'Reçu (Coord.)',  role: 'Coordinateur' },
  ];
  const keys = steps.map(s => s.key);
  const currentIdx = keys.indexOf(status);
  return (
    <div className="laq-flow-timeline">
      {steps.map((step, i) => {
        const done = i <= currentIdx;
        return (
          <React.Fragment key={step.key}>
            <div className={`laq-step${done ? ' laq-step--done' : ''}`}>
              <div className="laq-step-dot" />
              <div className="laq-step-label">{step.label}</div>
              <div className="laq-step-role">{step.role}</div>
            </div>
            {i < steps.length - 1 && (
              <div className={`laq-step-line${done ? ' laq-step-line--done' : ''}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BARRES À LAQUER PANEL
// ═══════════════════════════════════════════════════════════════════════════════
export function BarresLaquerPanel({ project, currentUser }) {
  const { user: authUser } = useAuth();
  const _cu = currentUser || authUser;
  const userRole = (typeof _cu?.role === 'string' ? _cu.role : _cu?.role?.name) || _cu?.roleName || '';
  const isAdmin           = userRole === 'Admin';
  const canEdit           = isAdmin || [ROLE_BARREMAN, ROLE_MAGASINIER].includes(userRole);
  const canSendToLaquage  = isAdmin || [ROLE_BARREMAN, ROLE_MAGASINIER].includes(userRole);
  const canReceiveLaquage = isAdmin || userRole === ROLE_LAQUAGE;
  const canReturnToCoord  = isAdmin || userRole === ROLE_LAQUAGE;
  const canReceiveCoord   = isAdmin || userRole === ROLE_COORDINATEUR;

  const [record, setRecord]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [confirm, setConfirm] = useState(null);

  // ── Add-form states ──
  const emptyBB = { reference: '', quantiteBrute: 1 };
  const emptyBL = { reference: '', ral: '', quantiteLaquee: 1 };
  const emptyMB = { reference: '', mesure: '', quantite: 1 };
  const emptyML = { reference: '', lignes: [{ ral: '', mesure: '', quantite: 1 }] };

  const [newBB, setNewBB] = useState(emptyBB);
  const [newBL, setNewBL] = useState(emptyBL);
  const [newMB, setNewMB] = useState(emptyMB);
  const [newML, setNewML] = useState(emptyML);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/projects/${project.id}/laquage/barres`);
      setRecord(res.data);
    } catch {
      setRecord({ barresBrutes: [], barresLaquees: [], morceauxBruts: [], morceauxLaques: [], status: 'draft', lineStatuses: {} });
    } finally { setLoading(false); }
  }, [project.id]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true); setError('');
    try {
      const res = await axios.put(`${API_URL}/projects/${project.id}/laquage/barres`, record);
      setRecord(res.data);
    } catch { setError('Erreur lors de la sauvegarde.'); }
    finally { setSaving(false); }
  };

  const removeRow = (section, idx) =>
    setRecord(prev => ({ ...prev, [section]: (prev[section] || []).filter((_, i) => i !== idx) }));

  const transition = async (action, lineKey) => {
    setSaving(true); setError('');
    try {
      const res = await axios.post(`${API_URL}/projects/${project.id}/laquage/barres/action`,
        { action, lineKey, by: currentUser?.displayName || userRole });
      setRecord(res.data);
    } catch { setError("Erreur lors de l'action."); }
    finally { setSaving(false); setConfirm(null); }
  };

  const ask = (message, action) => setConfirm({ message, action });

  // ── Add handlers ──
  const addBB = () => {
    if (!newBB.reference.trim()) return setError('Référence requise');
    setRecord(prev => ({ ...prev, barresBrutes: [...(prev.barresBrutes || []), { ...newBB, quantiteBrute: Number(newBB.quantiteBrute) || 1 }] }));
    setNewBB(emptyBB); setError('');
  };
  const addBL = () => {
    if (!newBL.reference.trim()) return setError('Référence requise');
    setRecord(prev => ({ ...prev, barresLaquees: [...(prev.barresLaquees || []), { ...newBL, quantiteLaquee: Number(newBL.quantiteLaquee) || 1 }] }));
    setNewBL(emptyBL); setError('');
  };
  const addMB = () => {
    if (!newMB.reference.trim()) return setError('Référence requise');
    setRecord(prev => ({ ...prev, morceauxBruts: [...(prev.morceauxBruts || []), { ...newMB, quantite: Number(newMB.quantite) || 1 }] }));
    setNewMB(emptyMB); setError('');
  };
  const addML = () => {
    if (!newML.reference.trim()) return setError('Référence requise');
    const lignes = newML.lignes.filter(l => l.ral || l.mesure || Number(l.quantite) > 0);
    if (!lignes.length) return setError('Remplissez au moins une ligne RAL / mesure');
    setRecord(prev => ({ ...prev, morceauxLaques: [...(prev.morceauxLaques || []), { reference: newML.reference, lignes }] }));
    setNewML(emptyML); setError('');
  };
  const updateMLLigne = (li, key, val) =>
    setNewML(prev => { const l = [...prev.lignes]; l[li] = { ...l[li], [key]: val }; return { ...prev, lignes: l }; });
  const addMLLigne    = () => setNewML(prev => ({ ...prev, lignes: [...prev.lignes, { ral: '', mesure: '', quantite: 1 }] }));
  const removeMLLigne = li  => setNewML(prev => ({ ...prev, lignes: prev.lignes.filter((_, i) => i !== li) }));

  if (loading) return <div className="laq-loading">Chargement…</div>;
  if (!record)  return null;

  const status     = record.status || 'draft';
  const isDraft    = isAdmin || status === 'draft';
  const isSent     = isAdmin || status === 'sent_to_laquage';
  const isRecvLaq  = isAdmin || status === 'received_laquage';
  const isRetCoord = isAdmin || status === 'returned_to_coord';
  const isDone     = status === 'received_coord';

  const lineStatuses = record.lineStatuses || {};

  const allKeys = [
    ...(record.barresBrutes   || []).map((_, i) => `bb-${i}`),
    ...(record.barresLaquees  || []).map((_, i) => `bl-${i}`),
    ...(record.morceauxBruts  || []).map((_, i) => `mb-${i}`),
    ...(record.morceauxLaques || []).flatMap((r, i) => (r.lignes || [{}]).map((_, li) => `ml-${i}-${li}`)),
  ];
  const allRecvLaq   = allKeys.length > 0 && allKeys.every(k => lineStatuses[k]?.receivedLaquage);
  const allRecvCoord = allKeys.length > 0 && allKeys.every(k => lineStatuses[k]?.receivedCoord);

  const RecvLaqBtn = ({ lKey }) => (
    <button className={`laq-line-btn${lineStatuses[lKey]?.receivedLaquage ? ' laq-line-btn--done' : ''}`}
      disabled={lineStatuses[lKey]?.receivedLaquage}
      onClick={() => ask('Confirmer la réception de cette ligne ?', () => transition('receive_line_laquage', lKey))}>
      {lineStatuses[lKey]?.receivedLaquage ? '✅ Reçu' : 'Confirmer réception'}
    </button>
  );
  const RecvCoordBtn = ({ lKey }) => (
    <button className={`laq-line-btn${lineStatuses[lKey]?.receivedCoord ? ' laq-line-btn--done' : ''}`}
      disabled={lineStatuses[lKey]?.receivedCoord}
      onClick={() => ask('Confirmer la réception de cette ligne ?', () => transition('receive_line_coord', lKey))}>
      {lineStatuses[lKey]?.receivedCoord ? '✅ Reçu' : 'Confirmer réception'}
    </button>
  );

  return (
    <div className="laq-panel">
      {confirm && <ConfirmModal message={confirm.message} onConfirm={confirm.action} onCancel={() => setConfirm(null)} />}

      {/* ── Header ── */}
      <div className="laq-panel-header">
        <div className="laq-panel-title">
          <span>🎨</span><h3>Barres à Laquer</h3>
          <StatusBadge status={status} />
        </div>
        <div className="laq-panel-actions">
          {canEdit && isDraft && (
            <button className="laq-save-btn" disabled={saving} onClick={save}>
              {saving ? '…' : '💾 Enregistrer'}
            </button>
          )}
          <button className="laq-print-btn" onClick={() => printLaquagePDF(record, project, 'barres')}>
            🖨 Imprimer PDF
          </button>
        </div>
      </div>

      {error && <div className="laq-error">{error}</div>}

      {/* ════ SECTION 1 — Barres Brutes ════ */}
      <div className="laq-section">
        <div className="laq-section-title">1. Barres Brutes</div>
        {canEdit && isDraft && (
          <div className="laq-add-form">
            <div className="laq-add-form__row">
              <AlumSearch value={newBB.reference}
                onChange={v => setNewBB(p => ({ ...p, reference: v }))}
                onSelect={v => setNewBB(p => ({ ...p, reference: v }))} />
              <div className="laq-add-form__field">
                <label>Quantité</label>
                <input type="number" className="laq-add-input laq-add-input--sm" min="1"
                  value={newBB.quantiteBrute}
                  onChange={e => setNewBB(p => ({ ...p, quantiteBrute: e.target.value }))} />
              </div>
              <button className="laq-add-btn" onClick={addBB}>+ Ajouter</button>
            </div>
          </div>
        )}
        <div className="laq-table-wrapper">
          <table className="laq-table">
            <thead><tr>
              <th>Référence</th><th>Qté brutes</th>
              {isSent      && canReceiveLaquage && <th>Reçu — Laquage</th>}
              {isRetCoord  && canReceiveCoord   && <th>Reçu — Coordinateur</th>}
              {canEdit && isDraft && <th style={{ width: 40 }} />}
            </tr></thead>
            <tbody>
              {!(record.barresBrutes || []).length
                ? <tr><td colSpan={9} className="laq-empty-row">Aucune barre brute.</td></tr>
                : (record.barresBrutes || []).map((row, i) => {
                  const lKey = `bb-${i}`;
                  return (
                    <tr key={i}>
                      <td><strong>{row.reference || '—'}</strong></td>
                      <td>{row.quantiteBrute}</td>
                      {isSent     && canReceiveLaquage && <td><RecvLaqBtn lKey={lKey} /></td>}
                      {isRetCoord && canReceiveCoord   && <td><RecvCoordBtn lKey={lKey} /></td>}
                      {canEdit && isDraft && <td><button className="delete-btn" onClick={() => removeRow('barresBrutes', i)}>✕</button></td>}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ════ SECTION 2 — Barres Laquées ════ */}
      <div className="laq-section">
        <div className="laq-section-title">2. Barres Laquées</div>
        {canEdit && isDraft && (
          <div className="laq-add-form">
            <div className="laq-add-form__row">
              <AlumSearch value={newBL.reference}
                onChange={v => setNewBL(p => ({ ...p, reference: v }))}
                onSelect={v => setNewBL(p => ({ ...p, reference: v }))} />
              <div className="laq-add-form__field">
                <label>RAL</label>
                <input className="laq-add-input laq-add-input--sm" placeholder="ex: 9010"
                  value={newBL.ral}
                  onChange={e => setNewBL(p => ({ ...p, ral: e.target.value }))} />
              </div>
              <div className="laq-add-form__field">
                <label>Quantité</label>
                <input type="number" className="laq-add-input laq-add-input--sm" min="1"
                  value={newBL.quantiteLaquee}
                  onChange={e => setNewBL(p => ({ ...p, quantiteLaquee: e.target.value }))} />
              </div>
              <button className="laq-add-btn" onClick={addBL}>+ Ajouter</button>
            </div>
          </div>
        )}
        <div className="laq-table-wrapper">
          <table className="laq-table">
            <thead><tr>
              <th>Référence</th><th>RAL</th><th>Qté laquées</th>
              {isSent     && canReceiveLaquage && <th>Reçu — Laquage</th>}
              {isRetCoord && canReceiveCoord   && <th>Reçu — Coordinateur</th>}
              {canEdit && isDraft && <th style={{ width: 40 }} />}
            </tr></thead>
            <tbody>
              {!(record.barresLaquees || []).length
                ? <tr><td colSpan={9} className="laq-empty-row">Aucune barre laquée.</td></tr>
                : (record.barresLaquees || []).map((row, i) => {
                  const lKey = `bl-${i}`;
                  return (
                    <tr key={i}>
                      <td><strong>{row.reference || '—'}</strong></td>
                      <td><span className="laq-ral-chip">{row.ral || '—'}</span></td>
                      <td>{row.quantiteLaquee}</td>
                      {isSent     && canReceiveLaquage && <td><RecvLaqBtn lKey={lKey} /></td>}
                      {isRetCoord && canReceiveCoord   && <td><RecvCoordBtn lKey={lKey} /></td>}
                      {canEdit && isDraft && <td><button className="delete-btn" onClick={() => removeRow('barresLaquees', i)}>✕</button></td>}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ════ SECTION 3 — Morceaux Bruts ════ */}
      <div className="laq-section">
        <div className="laq-section-title">3. Morceaux Bruts</div>
        {canEdit && isDraft && (
          <div className="laq-add-form">
            <div className="laq-add-form__row">
              <AlumSearch value={newMB.reference}
                onChange={v => setNewMB(p => ({ ...p, reference: v }))}
                onSelect={v => setNewMB(p => ({ ...p, reference: v }))} />
              <div className="laq-add-form__field">
                <label>Mesure</label>
                <input className="laq-add-input laq-add-input--sm" placeholder="ex: 1200 mm"
                  value={newMB.mesure}
                  onChange={e => setNewMB(p => ({ ...p, mesure: e.target.value }))} />
              </div>
              <div className="laq-add-form__field">
                <label>Quantité</label>
                <input type="number" className="laq-add-input laq-add-input--sm" min="1"
                  value={newMB.quantite}
                  onChange={e => setNewMB(p => ({ ...p, quantite: e.target.value }))} />
              </div>
              <button className="laq-add-btn" onClick={addMB}>+ Ajouter</button>
            </div>
          </div>
        )}
        <div className="laq-table-wrapper">
          <table className="laq-table">
            <thead><tr>
              <th>Référence</th><th>Mesure</th><th>Quantité</th>
              {isSent     && canReceiveLaquage && <th>Reçu — Laquage</th>}
              {isRetCoord && canReceiveCoord   && <th>Reçu — Coordinateur</th>}
              {canEdit && isDraft && <th style={{ width: 40 }} />}
            </tr></thead>
            <tbody>
              {!(record.morceauxBruts || []).length
                ? <tr><td colSpan={9} className="laq-empty-row">Aucun morceau brut.</td></tr>
                : (record.morceauxBruts || []).map((row, i) => {
                  const lKey = `mb-${i}`;
                  return (
                    <tr key={i}>
                      <td><strong>{row.reference || '—'}</strong></td>
                      <td>{row.mesure || '—'}</td>
                      <td>{row.quantite}</td>
                      {isSent     && canReceiveLaquage && <td><RecvLaqBtn lKey={lKey} /></td>}
                      {isRetCoord && canReceiveCoord   && <td><RecvCoordBtn lKey={lKey} /></td>}
                      {canEdit && isDraft && <td><button className="delete-btn" onClick={() => removeRow('morceauxBruts', i)}>✕</button></td>}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ════ SECTION 4 — Morceaux Laqués (multi-lignes) ════ */}
      <div className="laq-section">
        <div className="laq-section-title">4. Morceaux Laqués</div>
        {canEdit && isDraft && (
          <div className="laq-add-form">
            <div className="laq-add-form__row" style={{ alignItems: 'flex-start' }}>
              <AlumSearch value={newML.reference}
                onChange={v => setNewML(p => ({ ...p, reference: v }))}
                onSelect={v => setNewML(p => ({ ...p, reference: v }))} />
              <div className="laq-ml-lignes">
                {newML.lignes.map((lg, li) => (
                  <div key={li} className="laq-ml-ligne-row">
                    <div className="laq-add-form__field">
                      {li === 0 && <label>RAL</label>}
                      <input className="laq-add-input laq-add-input--sm" placeholder="RAL"
                        value={lg.ral} onChange={e => updateMLLigne(li, 'ral', e.target.value)} />
                    </div>
                    <div className="laq-add-form__field">
                      {li === 0 && <label>Mesure</label>}
                      <input className="laq-add-input laq-add-input--sm" placeholder="Mesure"
                        value={lg.mesure} onChange={e => updateMLLigne(li, 'mesure', e.target.value)} />
                    </div>
                    <div className="laq-add-form__field">
                      {li === 0 && <label>Quantité</label>}
                      <input type="number" className="laq-add-input laq-add-input--sm" min="1"
                        value={lg.quantite} onChange={e => updateMLLigne(li, 'quantite', e.target.value)} />
                    </div>
                    {newML.lignes.length > 1 && (
                      <button className="delete-btn" style={{ marginTop: li === 0 ? 22 : 0 }}
                        onClick={() => removeMLLigne(li)}>✕</button>
                    )}
                  </div>
                ))}
                <button className="laq-add-ligne-btn" onClick={addMLLigne}>+ Ligne RAL</button>
              </div>
              <button className="laq-add-btn" style={{ alignSelf: 'flex-end' }} onClick={addML}>+ Ajouter</button>
            </div>
          </div>
        )}
        <div className="laq-table-wrapper">
          <table className="laq-table">
            <thead><tr>
              <th>Référence</th><th>RAL</th><th>Mesure</th><th>Quantité</th>
              {isSent     && canReceiveLaquage && <th>Reçu — Laquage</th>}
              {isRetCoord && canReceiveCoord   && <th>Reçu — Coordinateur</th>}
              {canEdit && isDraft && <th style={{ width: 40 }} />}
            </tr></thead>
            <tbody>
              {!(record.morceauxLaques || []).length
                ? <tr><td colSpan={9} className="laq-empty-row">Aucun morceau laqué.</td></tr>
                : (record.morceauxLaques || []).flatMap((row, i) =>
                  (row.lignes || [{}]).map((lg, li) => {
                    const lKey = `ml-${i}-${li}`;
                    const isFirst = li === 0;
                    const rowSpan = (row.lignes || [{}]).length;
                    return (
                      <tr key={`${i}-${li}`} className={li > 0 ? 'laq-sub-row' : ''}>
                        {isFirst && (
                          <td rowSpan={rowSpan} style={{ verticalAlign: 'middle' }}>
                            <strong>{row.reference || '—'}</strong>
                          </td>
                        )}
                        <td><span className="laq-ral-chip">{lg.ral || '—'}</span></td>
                        <td>{lg.mesure || '—'}</td>
                        <td>{lg.quantite}</td>
                        {isSent     && canReceiveLaquage && <td><RecvLaqBtn lKey={lKey} /></td>}
                        {isRetCoord && canReceiveCoord   && <td><RecvCoordBtn lKey={lKey} /></td>}
                        {canEdit && isDraft && isFirst && (
                          <td rowSpan={rowSpan} style={{ verticalAlign: 'middle', textAlign: 'center' }}>
                            <button className="delete-btn"
                              onClick={() => setRecord(prev => ({ ...prev, morceauxLaques: prev.morceauxLaques.filter((_, idx) => idx !== i) }))}>✕</button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ════ WORKFLOW ════ */}
      <div className="laq-workflow">
        <div className="laq-workflow-title">Actions de workflow</div>
        <div className="laq-workflow-buttons">
          {canSendToLaquage && isDraft && (
            <button className="laq-wf-btn laq-wf-btn--send" disabled={saving}
              onClick={() => ask("Confirmer l'envoi de toutes les barres/morceaux au laquage ?", () => transition('send_to_laquage'))}>
              📤 Envoyer au Laquage
            </button>
          )}
          {canReceiveLaquage && isSent && (
            <button className={`laq-wf-btn laq-wf-btn--receive${allRecvLaq ? ' laq-wf-btn--done' : ''}`}
              disabled={saving || allRecvLaq}
              onClick={() => ask('Confirmer la réception GLOBALE de toutes les lignes ?', () => transition('receive_all_laquage'))}>
              ✅ Réceptionner TOUT (Laquage)
            </button>
          )}
          {canReturnToCoord && isRecvLaq && (
            <button className="laq-wf-btn laq-wf-btn--return" disabled={saving}
              onClick={() => ask('Confirmer le retour des barres laquées au coordinateur ?', () => transition('return_to_coord'))}>
              📦 Retourner au Coordinateur
            </button>
          )}
          {canReceiveCoord && isRetCoord && (
            <button className={`laq-wf-btn laq-wf-btn--receive${allRecvCoord ? ' laq-wf-btn--done' : ''}`}
              disabled={saving || allRecvCoord}
              onClick={() => ask('Confirmer la réception GLOBALE de toutes les barres laquées ?', () => transition('receive_all_coord'))}>
              ✅ Réceptionner TOUT (Coordinateur)
            </button>
          )}
          {isDone && <div className="laq-wf-complete">✅ Processus de laquage terminé</div>}
        </div>
        <WorkflowTimeline status={status} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACCESSOIRES À LAQUER PANEL
// ═══════════════════════════════════════════════════════════════════════════════
export function AccessoiresLaquerPanel({ project, currentUser }) {
  const { user: authUser } = useAuth();
  const _cu = currentUser || authUser;
  const userRole = (typeof _cu?.role === 'string' ? _cu.role : _cu?.role?.name) || _cu?.roleName || '';
  const isAdmin           = userRole === 'Admin';
  const canEdit           = isAdmin || [ROLE_BARREMAN, ROLE_MAGASINIER].includes(userRole);
  const canSendToLaquage  = isAdmin || [ROLE_BARREMAN, ROLE_MAGASINIER].includes(userRole);
  const canReceiveLaquage = isAdmin || userRole === ROLE_LAQUAGE;
  const canReturnToCoord  = isAdmin || userRole === ROLE_LAQUAGE;
  const canReceiveCoord   = isAdmin || userRole === ROLE_COORDINATEUR;

  const [record, setRecord]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [confirm, setConfirm] = useState(null);

  const emptyAcc = { designation: '', quantite: 1, notes: '' };
  const [newAcc, setNewAcc] = useState(emptyAcc);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/projects/${project.id}/laquage/accessoires`);
      setRecord(res.data);
    } catch {
      setRecord({ accessoires: [], status: 'draft', lineStatuses: {} });
    } finally { setLoading(false); }
  }, [project.id]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true); setError('');
    try {
      const res = await axios.put(`${API_URL}/projects/${project.id}/laquage/accessoires`, record);
      setRecord(res.data);
    } catch { setError('Erreur lors de la sauvegarde.'); }
    finally { setSaving(false); }
  };

  const addAcc = () => {
    if (!newAcc.designation.trim()) return setError('Désignation requise');
    setRecord(prev => ({ ...prev, accessoires: [...(prev.accessoires || []), { ...newAcc, quantite: Number(newAcc.quantite) || 1 }] }));
    setNewAcc(emptyAcc); setError('');
  };

  const removeAcc = idx =>
    setRecord(prev => ({ ...prev, accessoires: prev.accessoires.filter((_, i) => i !== idx) }));

  const transition = async (action, lineKey) => {
    setSaving(true); setError('');
    try {
      const res = await axios.post(`${API_URL}/projects/${project.id}/laquage/accessoires/action`,
        { action, lineKey, by: currentUser?.displayName || userRole });
      setRecord(res.data);
    } catch { setError("Erreur lors de l'action."); }
    finally { setSaving(false); setConfirm(null); }
  };

  const ask = (message, action) => setConfirm({ message, action });

  if (loading) return <div className="laq-loading">Chargement…</div>;
  if (!record)  return null;

  const status     = record.status || 'draft';
  const isDraft    = isAdmin || status === 'draft';
  const isSent     = isAdmin || status === 'sent_to_laquage';
  const isRecvLaq  = isAdmin || status === 'received_laquage';
  const isRetCoord = isAdmin || status === 'returned_to_coord';
  const isDone     = status === 'received_coord';

  const lineStatuses = record.lineStatuses || {};
  const allKeys = (record.accessoires || []).map((_, i) => `acc-${i}`);
  const allRecvLaq   = allKeys.length > 0 && allKeys.every(k => lineStatuses[k]?.receivedLaquage);
  const allRecvCoord = allKeys.length > 0 && allKeys.every(k => lineStatuses[k]?.receivedCoord);

  const RecvLaqBtn = ({ lKey }) => (
    <button className={`laq-line-btn${lineStatuses[lKey]?.receivedLaquage ? ' laq-line-btn--done' : ''}`}
      disabled={lineStatuses[lKey]?.receivedLaquage}
      onClick={() => ask('Confirmer la réception de cet accessoire ?', () => transition('receive_line_laquage', lKey))}>
      {lineStatuses[lKey]?.receivedLaquage ? '✅ Reçu' : 'Confirmer réception'}
    </button>
  );
  const RecvCoordBtn = ({ lKey }) => (
    <button className={`laq-line-btn${lineStatuses[lKey]?.receivedCoord ? ' laq-line-btn--done' : ''}`}
      disabled={lineStatuses[lKey]?.receivedCoord}
      onClick={() => ask('Confirmer la réception de cet accessoire ?', () => transition('receive_line_coord', lKey))}>
      {lineStatuses[lKey]?.receivedCoord ? '✅ Reçu' : 'Confirmer réception'}
    </button>
  );

  return (
    <div className="laq-panel">
      {confirm && <ConfirmModal message={confirm.message} onConfirm={confirm.action} onCancel={() => setConfirm(null)} />}

      <div className="laq-panel-header">
        <div className="laq-panel-title">
          <span>🔩</span><h3>Accessoires à Laquer</h3>
          <StatusBadge status={status} />
        </div>
        <div className="laq-panel-actions">
          {canEdit && isDraft && (
            <button className="laq-save-btn" disabled={saving} onClick={save}>
              {saving ? '…' : '💾 Enregistrer'}
            </button>
          )}
          <button className="laq-print-btn" onClick={() => printLaquagePDF(record, project, 'accessoires')}>
            🖨 Imprimer PDF
          </button>
        </div>
      </div>

      {error && <div className="laq-error">{error}</div>}

      <div className="laq-section">
        {canEdit && isDraft && (
          <div className="laq-add-form">
            <div className="laq-add-form__row">
              <AccSearch value={newAcc.designation}
                onChange={v => setNewAcc(p => ({ ...p, designation: v }))}
                onSelect={v => setNewAcc(p => ({ ...p, designation: v }))} />
              <div className="laq-add-form__field">
                <label>Quantité</label>
                <input type="number" className="laq-add-input laq-add-input--sm" min="1"
                  value={newAcc.quantite}
                  onChange={e => setNewAcc(p => ({ ...p, quantite: e.target.value }))} />
              </div>
              <div className="laq-add-form__field" style={{ flex: 2 }}>
                <label>Notes</label>
                <input className="laq-add-input" placeholder="Notes optionnelles…"
                  value={newAcc.notes}
                  onChange={e => setNewAcc(p => ({ ...p, notes: e.target.value }))} />
              </div>
              <button className="laq-add-btn" onClick={addAcc}>+ Ajouter</button>
            </div>
          </div>
        )}

        <div className="laq-table-wrapper">
          <table className="laq-table">
            <thead><tr>
              <th>Désignation</th><th>Quantité</th><th>Notes</th>
              {isSent     && canReceiveLaquage && <th>Reçu — Laquage</th>}
              {isRetCoord && canReceiveCoord   && <th>Reçu — Coordinateur</th>}
              {canEdit && isDraft && <th style={{ width: 40 }} />}
            </tr></thead>
            <tbody>
              {!(record.accessoires || []).length
                ? <tr><td colSpan={9} className="laq-empty-row">Aucun accessoire ajouté.</td></tr>
                : (record.accessoires || []).map((acc, i) => {
                  const lKey = `acc-${i}`;
                  return (
                    <tr key={i}>
                      <td><strong>{acc.designation || '—'}</strong></td>
                      <td>{acc.quantite}</td>
                      <td>{acc.notes || '—'}</td>
                      {isSent     && canReceiveLaquage && <td><RecvLaqBtn lKey={lKey} /></td>}
                      {isRetCoord && canReceiveCoord   && <td><RecvCoordBtn lKey={lKey} /></td>}
                      {canEdit && isDraft && <td><button className="delete-btn" onClick={() => removeAcc(i)}>✕</button></td>}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="laq-workflow">
        <div className="laq-workflow-title">Actions de workflow</div>
        <div className="laq-workflow-buttons">
          {canSendToLaquage && isDraft && (
            <button className="laq-wf-btn laq-wf-btn--send" disabled={saving}
              onClick={() => ask("Confirmer l'envoi des accessoires au laquage ?", () => transition('send_to_laquage'))}>
              📤 Envoyer au Laquage
            </button>
          )}
          {canReceiveLaquage && isSent && (
            <button className={`laq-wf-btn laq-wf-btn--receive${allRecvLaq ? ' laq-wf-btn--done' : ''}`}
              disabled={saving || allRecvLaq}
              onClick={() => ask('Confirmer la réception GLOBALE de tous les accessoires ?', () => transition('receive_all_laquage'))}>
              ✅ Réceptionner TOUT (Laquage)
            </button>
          )}
          {canReturnToCoord && isRecvLaq && (
            <button className="laq-wf-btn laq-wf-btn--return" disabled={saving}
              onClick={() => ask('Confirmer le retour des accessoires laqués au coordinateur ?', () => transition('return_to_coord'))}>
              📦 Retourner au Coordinateur
            </button>
          )}
          {canReceiveCoord && isRetCoord && (
            <button className={`laq-wf-btn laq-wf-btn--receive${allRecvCoord ? ' laq-wf-btn--done' : ''}`}
              disabled={saving || allRecvCoord}
              onClick={() => ask('Confirmer la réception GLOBALE de tous les accessoires laqués ?', () => transition('receive_all_coord'))}>
              ✅ Réceptionner TOUT (Coordinateur)
            </button>
          )}
          {isDone && <div className="laq-wf-complete">✅ Processus de laquage terminé</div>}
        </div>
        <WorkflowTimeline status={status} />
      </div>
    </div>
  );
}