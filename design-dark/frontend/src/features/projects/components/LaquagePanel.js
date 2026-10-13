import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  Printer, Save, CheckCircle2, AlertTriangle, XCircle,
  Send, RotateCcw, PackageCheck, Clock, ChevronDown,
  ChevronUp, History, MousePointerClick, Plus, Package
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage, tx, activeLanguage } from '../../../context/LanguageContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const ROLE_BARREMAN = 'BARREMAN';
const ROLE_MAGASINIER = 'Magasinier';
const ROLE_LAQUAGE = 'Laquage';
const ROLE_COORDINATEUR = 'Coordinateur';

const LOT_STATUSES = {
  draft: { label: 'lqStDraft', color: '#9ca3af', ink: '#d4d4d8' },
  sent_to_laquage: { label: 'lqStSent', color: '#f59e0b', ink: '#fcd34d' },
  received_laquage: { label: 'lqStRecvLaq', color: '#3b82f6', ink: '#93c5fd' },
  returned_to_coord: { label: 'lqStReturned', color: '#8b5cf6', ink: '#c4b5fd' },
  received_coord: { label: 'lqStRecvCoord', color: '#16a34a', ink: '#86efac' },
};

function fmtDT(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('fr-FR') + ' ' + dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/* ── Toast ──────────────────────────────────────────────────── */
let _globalPush = null;
export function registerToastPush(fn) { _globalPush = fn; }
export function pushToast(msg, type = 'success') { if (_globalPush) _globalPush(msg, type); }

function Toast({ toasts }) {
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 10, pointerEvents: 'none', maxWidth: 340 }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: t.type === 'success' ? '#16a34a' : t.type === 'warning' ? '#d97706' : '#dc2626',
          color: '#fff', borderRadius: 12, padding: '12px 18px', fontSize: 13, fontWeight: 600,
          boxShadow: '0 8px 32px rgba(0,0,0,.3)', display: 'flex', alignItems: 'center', gap: 10,
          animation: 'laqSlideIn .25s ease', pointerEvents: 'auto'
        }}>
          {t.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span style={{ flex: 1 }}>{t.message}</span>
        </div>
      ))}
      <style>{`@keyframes laqSlideIn{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}}`}</style>
    </div>
  );
}

export function useToast() {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(p => [...p, { id, message, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4200);
  }, []);
  useEffect(() => { registerToastPush(push); }, [push]);
  return { toasts, push };
}

/* ── Status badge ────────────────────────────────────────────── */
function StatusBadge({ status }) {
  const { t } = useLanguage();
  const s = LOT_STATUSES[status] || LOT_STATUSES.draft;
  return (
    <span className="laq-status-badge" style={{ background: s.color + '1f', color: s.ink, border: `1px solid ${s.color}59` }}>
      {t(s.label)}
    </span>
  );
}

/* ── Lot badge ───────────────────────────────────────────────── */
function LotBadge({ lotIndex }) {
  const { t } = useLanguage();
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
      background: 'rgba(99,102,241,.12)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,.3)'
    }}>
      <Package size={10} /> {t('lqLot', { n: lotIndex + 1 })}
    </span>
  );
}

/* ── Confirm modal ───────────────────────────────────────────── */
function ConfirmModal({ message, onConfirm, onCancel }) {
  const { t } = useLanguage();
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <p style={{ marginBottom: 20, fontSize: 14, lineHeight: 1.6 }}>{message}</p>
        <div className="modal-actions">
          <button onClick={onCancel}>{t('cancel')}</button>
          <button className="primary" onClick={onConfirm}>{t('confirm')}</button>
        </div>
      </div>
    </div>
  );
}

/* ── Incomplete modal ────────────────────────────────────────── */
function IncompleteModal({ lineLabel, onConfirm, onCancel }) {
  const { t } = useLanguage();
  const [note, setNote] = useState('');
  const [partial, setPartial] = useState('');
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-head__icon"><AlertTriangle size={14} /></span>
          <h2>{t('lqIncTitle')}</h2>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16 }}>{t('lqLineLabel')} <strong>{lineLabel}</strong></p>
        <div className="form-group">
          <label>{t('lqPartialQty')}</label>
          <input type="number" min="0" step="0.01" className="qty-input"
            placeholder={t('lqPartialPh')}
            value={partial} onChange={e => setPartial(e.target.value)} autoFocus />
        </div>
        <div className="form-group">
          <label>{t('lqReasonLabel')}</label>
          <textarea rows={3} placeholder={t('lqReasonPh')}
            value={note} onChange={e => setNote(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-2)', fontFamily: 'inherit', fontSize: 13, resize: 'vertical', background: 'var(--surface-2)', color: 'var(--text)' }} />
        </div>
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onCancel}>{t('cancel')}</button>
          <button className="btn-confirm btn-confirm--danger"
            disabled={!note.trim()}
            onClick={() => onConfirm({ note, partialQty: partial ? parseFloat(partial) : null })}>
            {t('lqMarkIncomplete')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Reception note modal ────────────────────────────────────── */
function ReceptionNoteModal({ title, onConfirm, onCancel }) {
  const { t } = useLanguage();
  const [note, setNote] = useState('');
  const [qty, setQty] = useState('');
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-head__icon"><PackageCheck size={14} /></span>
          <h2>{title || t('lqReceiveAll')}</h2>
        </div>
        <div className="form-group">
          <label>{t('lqTotalQty')}</label>
          <input type="number" min="0" step="0.01" className="qty-input"
            placeholder={t('lqTotalQtyPh')}
            value={qty} onChange={e => setQty(e.target.value)} autoFocus />
          <small style={{ color: 'var(--text-3)', fontSize: 11 }}>
            {t('lqTotalQtyHint')}
          </small>
        </div>
        <div className="form-group">
          <label>{t('lqNoteLabel')}</label>
          <textarea rows={3} placeholder={t('lqNotePh')}
            value={note} onChange={e => setNote(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-2)', fontFamily: 'inherit', fontSize: 13, resize: 'vertical', background: 'var(--surface-2)', color: 'var(--text)' }} />
        </div>
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onCancel}>{t('cancel')}</button>
          <button className="btn-confirm primary"
            onClick={() => onConfirm({ note: note.trim(), partialQty: qty ? parseFloat(qty) : null })}>
            {t('lqConfirmReception')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Action history log ──────────────────────────────────────── */
/** History action → { label (translated), color }. `tr` is t() or tx() */
const HISTORY_META = {
  add_lot: { label: 'lqHAddLot', color: '#818cf8' },
  send_to_laquage: { label: 'lqStSent', color: '#fbbf24' },
  receive_all_laquage: { label: 'lqHRecvAllLaq', color: '#60a5fa' },
  return_to_coord: { label: 'lqStReturned', color: '#a78bfa' },
  receive_all_coord: { label: 'lqHRecvAllCoord', color: '#4ade80' },
  incomplete_line: { label: 'lqHIncomplete', color: '#f87171' },
};
function historyMeta(action, tr) {
  const a = String(action || '');
  if (a.startsWith('receive_line_laquage:')) return { label: tr('lqHLineLaq'), color: '#60a5fa' };
  if (a.startsWith('receive_line_coord:')) return { label: tr('lqHLineCoord'), color: '#4ade80' };
  const m = HISTORY_META[a];
  return m ? { label: tr(m.label), color: m.color } : { label: action, color: '#a1a1aa' };
}

function HistoryLog({ history }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  if (!history || history.length === 0) return null;

  const getMeta = (action) => historyMeta(action, t);

  return (
    <div className="laq-history">
      <button className="laq-history__toggle" onClick={() => setOpen(v => !v)}>
        <History size={14} />
        {t('lqHistory', { n: history.length })}
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>
      {open && (
        <div className="laq-history__list">
          {[...history].reverse().map((h, i) => {
            const meta = getMeta(h.action);
            return (
              <div key={i} className="laq-history__item">
                <div className="laq-history__dot" style={{ background: meta.color }} />
                <div className="laq-history__body">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="laq-history__label" style={{ color: meta.color }}>{meta.label}</span>
                    {h.lotIndex != null && <LotBadge lotIndex={h.lotIndex} />}
                  </div>
                  <span className="laq-history__meta">
                    {t('lqBy')} <strong>{h.by || '—'}</strong> · <Clock size={10} /> {fmtDT(h.at)}
                  </span>
                  {h.note && <span className="laq-history__note">📝 {h.note}</span>}
                  {h.partialQty != null && <span className="laq-history__note">{t('lqQtyReceived')} <strong>{h.partialQty}</strong></span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Per-lot workflow timeline ───────────────────────────────── */
function LotTimeline({ lot, history }) {
  const { t } = useLanguage();
  const steps = [
    { key: 'draft', label: t('lqStDraft'), action: null },
    { key: 'sent_to_laquage', label: t('lqTlSent'), action: 'send_to_laquage' },
    { key: 'received_laquage', label: t('lqTlRecvLaq'), action: 'receive_all_laquage' },
    { key: 'returned_to_coord', label: t('lqTlReturned'), action: 'return_to_coord' },
    { key: 'received_coord', label: t('lqTlRecvCoord'), action: 'receive_all_coord' },
  ];
  const keys = steps.map(s => s.key);
  const currentIdx = keys.indexOf(lot.status);

  const getEntry = (action) => {
    if (!action || !history) return null;
    return [...history].reverse().find(h => h.action === action && h.lotIndex === lot.lotIndex);
  };

  return (
    <div className="laq-flow-timeline" style={{ margin: '8px 0 0' }}>
      {steps.map((step, i) => {
        const done = i <= currentIdx;
        const entry = getEntry(step.action);
        return (
          <React.Fragment key={step.key}>
            <div className={'laq-step' + (done ? ' laq-step--done' : '')}>
              <div className="laq-step-dot" />
              <div className="laq-step-label">{step.label}</div>
              {entry && (
                <div className="laq-step-timestamp">
                  <Clock size={10} /> {fmtDT(entry.at)}{entry.by ? ` · ${entry.by}` : ''}
                </div>
              )}
            </div>
            {i < steps.length - 1 && <div className={'laq-step-line' + (done ? ' laq-step-line--done' : '')} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ── Inventory search ────────────────────────────────────────── */
function InvSearch({ value, onChange, onSelect, superCategory, label }) {
  const { t } = useLanguage();
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef(null);
  const debRef = useRef(null);

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
        const res = await axios.get(`${API_URL}/inventory/search?q=${encodeURIComponent(q)}&superCategory=${superCategory}`);
        const items = (res.data || []).slice(0, 10);
        setSuggestions(items); setOpen(items.length > 0);
      } catch { setSuggestions([]); } finally { setBusy(false); }
    }, 250);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 2, minWidth: 220 }}>
      <label>{label}</label>
      <div style={{ position: 'relative' }}>
        <input className="laq-add-input" value={value} placeholder={t('lqSearchPh')}
          onChange={e => { onChange(e.target.value); search(e.target.value); }}
          onFocus={() => value.length >= 2 && suggestions.length > 0 && setOpen(true)} />
        {busy && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12 }}>…</span>}
      </div>
      {open && (
        <div className="laq-dropdown">
          <div className="laq-dropdown__header">{t('lqResults', { n: suggestions.length })}</div>
          {suggestions.map(item => {
            const lbl = item.designation?.fr || item.designation || String(item.id);
            return (
              <div key={item.id || item._id} className="laq-dropdown__item"
                onMouseDown={() => { onSelect(lbl, item); setOpen(false); setSuggestions([]); }}>
                {item.image && <img src={item.image} alt="" style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: 4, marginRight: 8 }} />}
                {lbl}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Per-row action buttons ──────────────────────────────────── */
function RowActions({ lKey, lineLabel, lineStatuses, side, onConfirm, onIncomplete }) {
  const { t } = useLanguage();
  const ls = lineStatuses[lKey] || {};
  const done = side === 'laq' ? ls.receivedLaquage : ls.receivedCoord;
  const ts = side === 'laq' ? ls.receivedLaquageAt : ls.receivedCoordAt;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <button className={'laq-line-btn' + (done ? ' laq-line-btn--done' : '')}
        disabled={done} onClick={onConfirm}>
        {done
          ? <><CheckCircle2 size={12} /> {ts ? fmtDT(ts) : t('lqReceived')}</>
          : t('lqConfirmReceptionBtn')}
      </button>
      {!done && (
        <button className="laq-line-btn laq-line-btn--warn" onClick={onIncomplete}>
          <AlertTriangle size={12} /> {t('lqIncomplete')}
        </button>
      )}
      {ls.incomplete && (
        <span className="laq-incomplete-flag" title={ls.incompleteNote || t('lqIncomplete')}>⚠️
          {ls.partialQty != null && <span style={{ fontSize: 10, marginLeft: 3 }}>{ls.partialQty}</span>}
        </span>
      )}
    </div>
  );
}

/* ── PDF printer ─────────────────────────────────────────────── */
/* function printPDF(record, project, type, selectedKeys, imageMap, lotIndex) {
  const isBarres = type === 'barres';
  const title = isBarres ? 'Barres à Laquer' : 'Accessoires à Laquer';
  const date = new Date().toLocaleDateString('fr-FR');
  const cs = '<' + '/script>';

  const lots = lotIndex != null
    ? (record.lots || []).filter(l => l.lotIndex === lotIndex)
    : (record.lots || []);

  const imgCell = ref => {
    const src = imageMap && imageMap[ref];
    return src
      ? `<td style="width:60px;padding:6px"><img src="${src}" style="width:52px;height:42px;object-fit:contain;border-radius:4px"/></td>`
      : `<td style="width:60px;padding:6px;color:#ccc;font-size:11px">—</td>`;
  };

  let allRows = [];
  for (const lot of lots) {
    const lotLabel = `<tr><td colspan="7" style="background:#f0f4ff;color:#3b5bdb;font-weight:700;padding:8px 12px;font-size:12px">Lot ${lot.lotIndex + 1} — ${LOT_STATUSES[lot.status]?.label || ''}</td></tr>`;
    allRows.push(lotLabel);

    if (isBarres) {
      (lot.barresBrutes || []).forEach((r, i) => {
        const k = `bb-${i}`;
        if (selectedKeys.size > 0 && !selectedKeys.has(`${lot.lotIndex}-${k}`)) return;
        allRows.push(`<tr>${imgCell(r.reference)}<td>Barre Brute</td><td>${r.reference || '—'}</td><td>${r.quantiteBrute || 0}</td><td>—</td><td>—</td><td>—</td></tr>`);
      });
      (lot.barresLaquees || []).forEach((r, i) => {
        const k = `bl-${i}`;
        if (selectedKeys.size > 0 && !selectedKeys.has(`${lot.lotIndex}-${k}`)) return;
        allRows.push(`<tr>${imgCell(r.reference)}<td>Barre Laquée</td><td>${r.reference || '—'}</td><td>—</td><td>${r.ral || '—'}</td><td>${r.quantiteLaquee || 0}</td><td>—</td></tr>`);
      });
      (lot.morceauxBruts || []).forEach((r, i) => {
        const k = `mb-${i}`;
        if (selectedKeys.size > 0 && !selectedKeys.has(`${lot.lotIndex}-${k}`)) return;
        allRows.push(`<tr>${imgCell(r.reference)}<td>Morceau Brut</td><td>${r.reference || '—'}</td><td>—</td><td>—</td><td>—</td><td>${r.mesure || '—'} × ${r.quantite || 0}</td></tr>`);
      });
      (lot.morceauxLaques || []).forEach((r, i) => {
        (r.lignes || []).forEach((l, li) => {
          const k = `ml-${i}-${li}`;
          if (selectedKeys.size > 0 && !selectedKeys.has(`${lot.lotIndex}-${k}`)) return;
          allRows.push(`<tr>${imgCell(r.reference)}<td>Morceau Laqué</td><td>${r.reference || '—'}</td><td>—</td><td>${l.ral || '—'}</td><td>${l.quantite || 0}</td><td>${l.mesure || '—'}</td></tr>`);
        });
      });
      if (lot.receptionLaquageNote) {
        allRows.push(`<tr><td colspan="7" style="color:#3b82f6;font-size:11px;padding:4px 12px">📝 Note Laquage: ${lot.receptionLaquageNote}${lot.receptionLaquageQty != null ? ` (Qté reçue: ${lot.receptionLaquageQty})` : ''}</td></tr>`);
      }
      if (lot.receptionCoordNote) {
        allRows.push(`<tr><td colspan="7" style="color:#16a34a;font-size:11px;padding:4px 12px">📝 Note Coord: ${lot.receptionCoordNote}${lot.receptionCoordQty != null ? ` (Qté reçue: ${lot.receptionCoordQty})` : ''}</td></tr>`);
      }
    } else {
      (lot.accessoires || []).forEach((a, i) => {
        const k = `acc-${i}`;
        if (selectedKeys.size > 0 && !selectedKeys.has(`${lot.lotIndex}-${k}`)) return;
        allRows.push(`<tr>${imgCell(a.designation)}<td>${a.designation || '—'}</td><td>${a.quantite || 0}</td><td>${a.notes || '—'}</td></tr>`);
      });
    }
  }

  const thead = isBarres
    ? '<tr><th>Image</th><th>Type</th><th>Référence</th><th>Qté Brutes</th><th>RAL</th><th>Qté Laquées</th><th>Mesure/Qté</th></tr>'
    : '<tr><th>Image</th><th>Désignation</th><th>Quantité</th><th>Notes</th></tr>';

  const histRows = (record.history || []).map(h =>
    `<tr><td>${h.action}</td><td>${h.by || '—'}</td><td>${h.at ? new Date(h.at).toLocaleString('fr-FR') : '—'}</td><td>${h.note || '—'}</td><td>${h.partialQty != null ? h.partialQty : '—'}</td><td>${h.lotIndex != null ? `Lot ${h.lotIndex + 1}` : '—'}</td></tr>`
  ).join('');

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${title}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#1a1a1a;padding:28px 36px}h1{font-size:18px;font-weight:800;margin-bottom:12px}h2{font-size:14px;font-weight:700;margin:24px 0 10px;padding-bottom:6px;border-bottom:2px solid #1a1a1a}.meta{display:flex;gap:16px;font-size:12px;color:#555;margin-bottom:20px;flex-wrap:wrap}table{width:100%;border-collapse:collapse;margin-bottom:20px}thead tr{background:#1a1a1a;color:#fff}th{padding:9px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.06em}td{padding:9px 12px;border-bottom:1px solid #f0f0f0;font-size:12.5px;vertical-align:middle}tr:nth-child(even) td{background:#f9fafb}@media print{*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}body{padding:12mm 16mm}@page{size:A4;margin:0}}</style>
</head><body>
<h1>🎨 ${title}</h1>
<div class="meta"><span>Projet : <strong>${project.name}</strong></span><span>Réf : <strong>${project.reference}</strong></span><span>RAL : <strong>${project.ralCode}</strong></span><span>Date : <strong>${date}</strong></span><span>Lots : <strong>${lots.length}</strong></span></div>
<table><thead>${thead}</thead><tbody>${allRows.join('') || '<tr><td colspan="7" style="text-align:center;color:#aaa">Aucune ligne</td></tr>'}</tbody></table>
${histRows ? `<h2>Historique des actions</h2><table><thead><tr><th>Action</th><th>Par</th><th>Date / Heure</th><th>Remarque</th><th>Qté reçue</th><th>Lot</th></tr></thead><tbody>${histRows}</tbody></table>` : ''}
<script>window.onload=()=>window.print();${cs}</body></html>`;

  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
} */

/* ── PDF printer ─────────────────────────────────────────────── */
function printPDF(record, project, type, selectedKeys, imageMap, lotIndex, lotOnly = false) {
  const isBarres = type === 'barres';
  const title = isBarres ? tx('lqBarresTitle') : tx('lqAccTitle');
  const lang = activeLanguage();
  const date = new Date().toLocaleDateString('fr-FR');
  const cs = '<' + '/script>';

  const lots = lotOnly && lotIndex != null
    ? (record.lots || []).filter(l => l.lotIndex === lotIndex)
    : (record.lots || []);

  const imgCell = ref => {
    const src = imageMap && imageMap[ref];
    return src
      ? `<td style="width:60px;padding:6px"><img src="${src}" style="width:52px;height:42px;object-fit:contain;border-radius:4px"/></td>`
      : `<td style="width:60px;padding:6px;color:#ccc;font-size:11px">—</td>`;
  };

  let allRows = [];
  for (const lot of lots) {
    const lotLabel = `<tr><td colspan="7" style="background:#f0f4ff;color:#3b5bdb;font-weight:700;padding:8px 12px;font-size:12px">${tx('lqLot', { n: lot.lotIndex + 1 })} — ${LOT_STATUSES[lot.status] ? tx(LOT_STATUSES[lot.status].label) : ''}</td></tr>`;
    allRows.push(lotLabel);

    if (isBarres) {
      (lot.barresBrutes || []).forEach((r, i) => {
        const k = `bb-${i}`;
        if (selectedKeys.size > 0 && !selectedKeys.has(`${lot.lotIndex}-${k}`)) return;
        allRows.push(`<tr>${imgCell(r.reference)}<td>${tx('lqBarreBrute')}</td><td>${r.reference || '—'}</td><td>${r.quantiteBrute || 0}</td><td>—</td><td>—</td><td>—</td></tr>`);
      });
      (lot.barresLaquees || []).forEach((r, i) => {
        const k = `bl-${i}`;
        if (selectedKeys.size > 0 && !selectedKeys.has(`${lot.lotIndex}-${k}`)) return;
        allRows.push(`<tr>${imgCell(r.reference)}<td>${tx('lqBarreLaquee')}</td><td>${r.reference || '—'}</td><td>—</td><td>${r.ral || '—'}</td><td>${r.quantiteLaquee || 0}</td><td>—</td></tr>`);
      });
      (lot.morceauxBruts || []).forEach((r, i) => {
        const k = `mb-${i}`;
        if (selectedKeys.size > 0 && !selectedKeys.has(`${lot.lotIndex}-${k}`)) return;
        allRows.push(`<tr>${imgCell(r.reference)}<td>${tx('lqMorceauBrut')}</td><td>${r.reference || '—'}</td><td>—</td><td>—</td><td>—</td><td>${r.mesure || '—'} × ${r.quantite || 0}</td></tr>`);
      });
      (lot.morceauxLaques || []).forEach((r, i) => {
        (r.lignes || []).forEach((l, li) => {
          const k = `ml-${i}-${li}`;
          if (selectedKeys.size > 0 && !selectedKeys.has(`${lot.lotIndex}-${k}`)) return;
          allRows.push(`<tr>${imgCell(r.reference)}<td>${tx('lqMorceauLaque')}</td><td>${r.reference || '—'}</td><td>—</td><td>${l.ral || '—'}</td><td>${l.quantite || 0}</td><td>${l.mesure || '—'}</td></tr>`);
        });
      });
      if (lot.receptionLaquageNote) {
        allRows.push(`<tr><td colspan="7" style="color:#3b82f6;font-size:11px;padding:4px 12px">📝 ${tx('lqNoteLaq')} ${lot.receptionLaquageNote}${lot.receptionLaquageQty != null ? ` (${tx('lqQtyRecvN', { n: lot.receptionLaquageQty })})` : ''}</td></tr>`);
      }
      if (lot.receptionCoordNote) {
        allRows.push(`<tr><td colspan="7" style="color:#16a34a;font-size:11px;padding:4px 12px">📝 ${tx('lqNoteCoord')} ${lot.receptionCoordNote}${lot.receptionCoordQty != null ? ` (${tx('lqQtyRecvN', { n: lot.receptionCoordQty })})` : ''}</td></tr>`);
      }
    } else {
      (lot.accessoires || []).forEach((a, i) => {
        const k = `acc-${i}`;
        if (selectedKeys.size > 0 && !selectedKeys.has(`${lot.lotIndex}-${k}`)) return;
        allRows.push(`<tr>${imgCell(a.designation)}<td>${a.designation || '—'}</td><td>${a.quantite || 0}</td><td>${a.notes || '—'}</td></tr>`);
      });
    }
  }

  const thead = isBarres
    ? `<tr><th>${tx('image')}</th><th>${tx('lqType')}</th><th>${tx('lqRef')}</th><th>${tx('lqQtyRawCol')}</th><th>RAL</th><th>${tx('lqQtyLaqCol')}</th><th>${tx('lqMesureQty')}</th></tr>`
    : `<tr><th>${tx('image')}</th><th>${tx('designation')}</th><th>${tx('quantity')}</th><th>${tx('lqNotes')}</th></tr>`;

  // Global PDF includes full history; per-lot PDF filters history by lotIndex
  const historyEntries = lotOnly ? [] : (record.history || []);

  const histRows = historyEntries.map(h =>
    `<tr><td>${historyMeta(h.action, tx).label}</td><td>${h.by || '—'}</td><td>${h.at ? new Date(h.at).toLocaleString(lang === 'en' ? 'en-GB' : lang === 'it' ? 'it-IT' : 'fr-FR') : '—'}</td><td>${h.note || '—'}</td><td>${h.partialQty != null ? h.partialQty : '—'}</td><td>${h.lotIndex != null ? tx('lqLot', { n: h.lotIndex + 1 }) : '—'}</td></tr>`
  ).join('');
  
  const lotLabel = lotOnly && lotIndex != null ? ` — ${tx('lqLot', { n: lotIndex + 1 })}` : ` — ${tx('lqAllLots', { n: lots.length })}`;

  const html = `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><title>${title}${lotLabel}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#1a1a1a;padding:28px 36px}h1{font-size:18px;font-weight:800;margin-bottom:12px}h2{font-size:14px;font-weight:700;margin:24px 0 10px;padding-bottom:6px;border-bottom:2px solid #1a1a1a}.meta{display:flex;gap:16px;font-size:12px;color:#555;margin-bottom:20px;flex-wrap:wrap}table{width:100%;border-collapse:collapse;margin-bottom:20px}thead tr{background:#1a1a1a;color:#fff}th{padding:9px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.06em}td{padding:9px 12px;border-bottom:1px solid #f0f0f0;font-size:12.5px;vertical-align:middle}tr:nth-child(even) td{background:#f9fafb}@media print{*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}body{padding:12mm 16mm}@page{size:A4;margin:0}}</style>
</head><body>
<h1>🎨 ${title}${lotLabel}</h1>
<div class="meta"><span>${tx('lqPdfProject')} <strong>${project.name}</strong></span><span>${tx('lqPdfRef')} <strong>${project.reference}</strong></span><span>RAL : <strong>${project.ralCode}</strong></span><span>${tx('lqPdfDate')} <strong>${date}</strong></span><span>${tx('lqPdfLots')} <strong>${lots.length}</strong></span></div>
<table><thead>${thead}</thead><tbody>${allRows.join('') || `<tr><td colspan="7" style="text-align:center;color:#aaa">${tx('lqNoLine')}</td></tr>`}</tbody></table>
${histRows ? `<h2>${tx('lqHistoryTitle')}</h2><table><thead><tr><th>${tx('lqAction')}</th><th>${tx('lqByCol')}</th><th>${tx('lqDateTime')}</th><th>${tx('lqRemark')}</th><th>${tx('lqQtyRecvCol')}</th><th>${tx('lqLotCol')}</th></tr></thead><tbody>${histRows}</tbody></table>` : ''}
<script>window.onload=()=>window.print();${cs}</body></html>`;

  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
}

/* ─── Shared "Add new lot" banner ────────────────────────────── */
function AddLotBanner({ canEdit, addingLot, onAdd }) {
  const { t } = useLanguage();
  if (!canEdit) return null;
  return (
    <div className="laq-addlot">
      <Plus size={16} style={{ color: '#a5b4fc', flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#a5b4fc' }}>{t('lqAddLotTitle')}</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
          {t('lqAddLotDesc')}
        </div>
      </div>
      <button
        onClick={onAdd}
        disabled={addingLot}
        className="laq-addlot__btn"
        style={{ opacity: addingLot ? 0.5 : 1 }}>
        <Plus size={12} /> {t('lqNewLot')}
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   BARRES PANEL
   ═══════════════════════════════════════════════════════════════ */
export function BarresLaquerPanel({ project, currentUser }) {
  const { user: authUser } = useAuth();
  const { t } = useLanguage();
  const _cu = currentUser || authUser;
  const userRole = (typeof _cu?.role === 'string' ? _cu.role : _cu?.role?.name) || _cu?.roleName || '';
  const displayName = _cu?.displayName || userRole;
  const isAdmin = userRole === 'Admin';
  const canEdit = isAdmin || [ROLE_BARREMAN, ROLE_MAGASINIER].includes(userRole);
  const canSendToLaquage = isAdmin || [ROLE_BARREMAN, ROLE_MAGASINIER].includes(userRole);
  const canReceiveLaquage = isAdmin || userRole === ROLE_LAQUAGE;
  const canReturnToCoord = isAdmin || userRole === ROLE_LAQUAGE;
  const canReceiveCoord = isAdmin || userRole === ROLE_COORDINATEUR;

  const { toasts, push: toast } = useToast();

  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [incomplete, setIncomplete] = useState(null);
  const [receptionNote, setReceptionNote] = useState(null);
  const [activeLotIdx, setActiveLotIdx] = useState(0);
  const [selected, setSelected] = useState(new Set());
  const [imageMap, setImageMap] = useState({});
  const [addingLot, setAddingLot] = useState(false);

  // itemId links the row to the inventory article: the stock is deducted when the lot is sent to laquage
  const emptyBB = { reference: '', itemId: null, quantiteBrute: 1 };
  const emptyBL = { reference: '', itemId: null, ral: '', quantiteLaquee: 1 };
  const emptyMB = { reference: '', mesure: '', quantite: 1 };
  const emptyML = { reference: '', lignes: [{ ral: '', mesure: '', quantite: 1 }] };

  const [newBB, setNewBB] = useState(emptyBB);
  const [newBL, setNewBL] = useState(emptyBL);
  const [newMB, setNewMB] = useState(emptyMB);
  const [newML, setNewML] = useState(emptyML);

  const loadImages = useCallback(async (rec) => {
    const refs = new Set();
    for (const lot of rec.lots || []) {
      (lot.barresBrutes || []).forEach(r => r.reference && refs.add(r.reference));
      (lot.barresLaquees || []).forEach(r => r.reference && refs.add(r.reference));
      (lot.morceauxBruts || []).forEach(r => r.reference && refs.add(r.reference));
      (lot.morceauxLaques || []).forEach(r => r.reference && refs.add(r.reference));
    }
    const map = {};
    await Promise.all([...refs].map(async (ref) => {
      try {
        const res = await axios.get(`${API_URL}/inventory/search?q=${encodeURIComponent(ref)}&superCategory=aluminium`);
        const match = (res.data || []).find(i => (i.designation?.fr || i.designation || '') === ref);
        if (match?.image) map[ref] = match.image;
      } catch { }
    }));
    setImageMap(map);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/projects/${project.id}/laquage/barres`);
      setRecord(res.data);
      await loadImages(res.data);
      const lots = res.data.lots || [];
      if (lots.length > 0) setActiveLotIdx(lots[lots.length - 1].lotIndex);
    } catch {
      setRecord({ lots: [{ lotIndex: 0, status: 'draft', barresBrutes: [], barresLaquees: [], morceauxBruts: [], morceauxLaques: [], lineStatuses: {} }], history: [] });
    } finally { setLoading(false); }
  }, [project.id, loadImages]);

  useEffect(() => { load(); }, [load]);

  const activeLot = (record?.lots || []).find(l => l.lotIndex === activeLotIdx) || (record?.lots || [])[0];

  const saveLot = async () => {
    if (!activeLot) return;
    setSaving(true); setError('');
    try {
      const res = await axios.put(
        `${API_URL}/projects/${project.id}/laquage/barres/lot/${activeLot.lotIndex}`,
        {
          barresBrutes: activeLot.barresBrutes,
          barresLaquees: activeLot.barresLaquees,
          morceauxBruts: activeLot.morceauxBruts,
          morceauxLaques: activeLot.morceauxLaques,
        }
      );
      setRecord(res.data);
      toast(t('lqSaved'));
    } catch (e) {
      setError(e.response?.data?.error || t('lqSaveError'));
    } finally { setSaving(false); }
  };

  const addNewLot = async () => {
    setAddingLot(true); setError('');
    try {
      const res = await axios.post(
        `${API_URL}/projects/${project.id}/laquage/barres/lot`,
        { barresBrutes: [], barresLaquees: [], morceauxBruts: [], morceauxLaques: [], by: displayName }
      );
      setRecord(res.data);
      const newLots = res.data.lots || [];
      const newest = newLots[newLots.length - 1];
      setActiveLotIdx(newest.lotIndex);
      toast(t('lqLotCreated', { n: newest.lotIndex + 1 }));
    } catch (e) {
      setError(e.response?.data?.error || t('lqLotCreateError'));
    } finally { setAddingLot(false); }
  };

  const transition = async (action, lotIndex, lineKey, extra = {}) => {
    setSaving(true); setError('');
    try {
      // Sending a lot: include the rows shown on screen so unsaved rows are sent (and deducted) too
      const sentLot = action === 'send_to_laquage'
        ? (record?.lots || []).find(l => l.lotIndex === lotIndex)
        : null;
      const lotRows = sentLot ? {
        barresBrutes: sentLot.barresBrutes || [],
        barresLaquees: sentLot.barresLaquees || [],
        morceauxBruts: sentLot.morceauxBruts || [],
        morceauxLaques: sentLot.morceauxLaques || [],
      } : {};
      const res = await axios.post(
        `${API_URL}/projects/${project.id}/laquage/barres/action`,
        { action, lotIndex, lineKey, by: displayName, ...lotRows, ...extra }
      );
      setRecord(res.data);
      if (action === 'send_to_laquage') {
        const ded = res.data.stockDeducted || [];
        toast(ded.length
          ? t('lqStockDeducted', { list: ded.map(d => `${d.quantity} × ${d.reference}`).join(', ') })
          : t('lqNoStockDeduct'), ded.length ? 'success' : 'error');
      }
      const labels = {
        send_to_laquage: t('lqTSent', { n: lotIndex + 1 }),
        receive_all_laquage: t('lqTRecvAllLaq', { n: lotIndex + 1 }),
        return_to_coord: t('lqTReturned', { n: lotIndex + 1 }),
        receive_all_coord: t('lqTRecvAllCoord', { n: lotIndex + 1 }),
        receive_line_laquage: t('lqTLineLaq'),
        receive_line_coord: t('lqTLineCoord'),
        incomplete_line: t('lqTIncomplete'),
      };
      toast(labels[action] || t('lqTDone'));
    } catch (e) {
      setError(e.response?.data?.error || t('lqActionError'));
      toast(t('lqActionErrorToast'), 'error');
    } finally { setSaving(false); setConfirm(null); setIncomplete(null); setReceptionNote(null); }
  };

  const ask = (msg, fn) => setConfirm({ message: msg, action: fn });
  const capImg = (ref, item) => { if (item?.image) setImageMap(m => ({ ...m, [ref]: item.image })); };

  const updateLotData = (key, value) => {
    if (!activeLot) return;
    setRecord(p => ({
      ...p,
      lots: p.lots.map(l =>
        l.lotIndex === activeLot.lotIndex ? { ...l, [key]: value } : l
      )
    }));
  };

  const toggleRow = k => setSelected(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const addBB = () => {
    if (!newBB.reference.trim()) return setError(t('lqRefRequired'));
    updateLotData('barresBrutes', [...(activeLot.barresBrutes || []), { ...newBB, quantiteBrute: Number(newBB.quantiteBrute) || 1 }]);
    setNewBB(emptyBB); setError('');
  };
  const addBL = () => {
    if (!newBL.reference.trim()) return setError(t('lqRefRequired'));
    updateLotData('barresLaquees', [...(activeLot.barresLaquees || []), { ...newBL, quantiteLaquee: Number(newBL.quantiteLaquee) || 1 }]);
    setNewBL(emptyBL); setError('');
  };
  const addMB = () => {
    if (!newMB.reference.trim()) return setError(t('lqRefRequired'));
    updateLotData('morceauxBruts', [...(activeLot.morceauxBruts || []), { ...newMB, quantite: Number(newMB.quantite) || 1 }]);
    setNewMB(emptyMB); setError('');
  };
  const addML = () => {
    if (!newML.reference.trim()) return setError(t('lqRefRequired'));
    const lignes = newML.lignes.filter(l => l.ral || l.mesure || Number(l.quantite) > 0);
    if (!lignes.length) return setError(t('lqFillOneLine'));
    updateLotData('morceauxLaques', [...(activeLot.morceauxLaques || []), { reference: newML.reference, lignes }]);
    setNewML(emptyML); setError('');
  };
  const updateMLLigne = (li, k, v) => setNewML(p => { const l = [...p.lignes]; l[li] = { ...l[li], [k]: v }; return { ...p, lignes: l }; });
  const addMLLigne = () => setNewML(p => ({ ...p, lignes: [...p.lignes, { ral: '', mesure: '', quantite: 1 }] }));
  const removeMLLigne = li => setNewML(p => ({ ...p, lignes: p.lignes.filter((_, i) => i !== li) }));
  const removeRow = (sec, idx) => updateLotData(sec, (activeLot[sec] || []).filter((_, i) => i !== idx));

  if (loading) return <div className="laq-loading">{t('loadingShort')}</div>;
  if (!record) return null;

  const lots = record.lots || [];
  const history = record.history || [];

  // Per-lot derived state
  const lot = activeLot || {};
  const lotStatus = lot.status || 'draft';
  const ls = lot.lineStatuses || {};
  const isDraft = isAdmin || lotStatus === 'draft';
  const isSent = isAdmin || lotStatus === 'sent_to_laquage';
  const isRecvLaq = isAdmin || lotStatus === 'received_laquage';
  const isRetCoord = isAdmin || lotStatus === 'returned_to_coord';

  const allKeys = [
    ...(lot.barresBrutes || []).map((_, i) => `bb-${i}`),
    ...(lot.barresLaquees || []).map((_, i) => `bl-${i}`),
    ...(lot.morceauxBruts || []).map((_, i) => `mb-${i}`),
    ...(lot.morceauxLaques || []).flatMap((r, i) => (r.lignes || [{}]).map((_, li) => `ml-${i}-${li}`)),
  ];
  const allRecvLaq = allKeys.length > 0 && allKeys.every(k => ls[k]?.receivedLaquage);
  const allRecvCoord = allKeys.length > 0 && allKeys.every(k => ls[k]?.receivedCoord);

  const isRowLocked = (k) => {
    const s = ls[k] || {};
    if (isSent && s.receivedLaquage) return true;
    if (isRetCoord && s.receivedCoord) return true;
    return false;
  };
  const rowProps = (k) => ({
    className: 'laq-table-row' + (selected.has(`${lot.lotIndex}-${k}`) ? ' laq-row--selected' : '') + (isRowLocked(k) ? ' laq-row--locked' : ''),
    onClick: () => { if (!isRowLocked(k)) toggleRow(`${lot.lotIndex}-${k}`); },
    style: { cursor: isRowLocked(k) ? 'default' : 'pointer' },
  });

  // ── FIX: canAddLot — always allow adding a new lot as long as there
  // is no existing draft lot (one draft at a time). The old "!isDone"
  // check was blocking lot creation once any lot reached received_coord.
  const hasDraftLot = lots.some(l => l.status === 'draft');
  const canAddLot = canEdit && !hasDraftLot;

  return (
    <div className="laq-panel">
      <Toast toasts={toasts} />
      {confirm && <ConfirmModal message={confirm.message} onConfirm={confirm.action} onCancel={() => setConfirm(null)} />}
      {incomplete && (
        <IncompleteModal
          lineLabel={incomplete.lineLabel}
          onCancel={() => setIncomplete(null)}
          onConfirm={({ note, partialQty }) =>
            transition('incomplete_line', incomplete.lotIndex, incomplete.lKey, { note, partialQty, lineLabel: incomplete.lineLabel })
          }
        />
      )}
      {receptionNote && (
        <ReceptionNoteModal
          title={receptionNote.title}
          onCancel={() => setReceptionNote(null)}
          onConfirm={({ note, partialQty }) =>
            transition(receptionNote.action, receptionNote.lotIndex, null, { note, partialQty })
          }
        />
      )}

      {/* Header */}
      <div className="laq-panel-header">
        <div className="laq-panel-title">
          <span>🎨</span><h3>{t('lqBarresTitle')}</h3>
          <StatusBadge status={lotStatus} />
        </div>
        <div className="laq-panel-actions">
          {canEdit && isDraft && (
            <button className="laq-save-btn" disabled={saving} onClick={saveLot}>
              <Save size={14} /> {saving ? '…' : ''}
            </button>
          )}
          {/* Per-lot PDF — visible to all */}
          {activeLot && (
            <button
              className="laq-print-btn"
              title={t('lqPrintLot', { n: activeLot.lotIndex + 1 })}
              onClick={() => printPDF(record, project, 'barres', selected, imageMap, activeLot.lotIndex, true)}
            >
              <Printer size={14} /> {t('lqLot', { n: activeLot.lotIndex + 1 })}
            </button>
          )}
          {/* Global PDF — admin only */}
          {isAdmin && (
            <button
              className="laq-print-btn laq-print-btn--strong"
              title={t('lqPdfGlobalTitle')}
              onClick={() => printPDF(record, project, 'barres', new Set(), imageMap, null, false)}
            >
              <Printer size={14} /> {t('lqGlobal')}
            </button>
          )}
        </div>
      </div>

      {error && <div className="laq-error">{error}</div>}

      {/* Lot tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0 4px', flexWrap: 'wrap' }}>
        {lots.map(l => (
          <button
            key={l.lotIndex}
            onClick={() => setActiveLotIdx(l.lotIndex)}
            className={`laq-lot-tab${l.lotIndex === activeLotIdx ? ' laq-lot-tab--active' : ''}`}>
            <Package size={12} />
            {t('lqLot', { n: l.lotIndex + 1 })}
            <span className="laq-lot-tab__status" style={{
              background: (LOT_STATUSES[l.status] || LOT_STATUSES.draft).color + '1f',
              color: (LOT_STATUSES[l.status] || LOT_STATUSES.draft).ink,
            }}>
              {t((LOT_STATUSES[l.status] || LOT_STATUSES.draft).label)}
            </span>
          </button>
        ))}
        {canAddLot && (
          <button
            onClick={addNewLot}
            disabled={addingLot}
            className="laq-lot-tab laq-lot-tab--add" style={{ opacity: addingLot ? 0.5 : 1 }}>
            <Plus size={12} /> {t('lqNewLot')}
          </button>
        )}
      </div>

      {/* Lot timeline */}
      {activeLot && (
        <div className="laq-lot-progress">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
              {t('lqProgress', { n: activeLot.lotIndex + 1 })}
            </span>
            {activeLot.receptionLaquageNote && (
              <span style={{ fontSize: 11, color: '#93c5fd', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                📝 {t('lqLaqColon')} {activeLot.receptionLaquageNote}
                {activeLot.receptionLaquageQty != null ? ` (${activeLot.receptionLaquageQty})` : ''}
              </span>
            )}
            {activeLot.receptionCoordNote && (
              <span style={{ fontSize: 11, color: '#86efac', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                📝 {t('lqCoordColon')} {activeLot.receptionCoordNote}
                {activeLot.receptionCoordQty != null ? ` (${activeLot.receptionCoordQty})` : ''}
              </span>
            )}
          </div>
          <LotTimeline lot={activeLot} history={history} />
        </div>
      )}

      {/* Selection bar */}
      {allKeys.length > 0 && (
        <div className="laq-select-bar">
          <MousePointerClick size={13} />
          <span>{t('lqSelectHint')}</span>
        </div>
      )}

      {/* ── Section 1: Barres Brutes ── */}
      <div className="laq-section">
        <div className="laq-section-title">{t('lqSecBB')}</div>
        {canEdit && isDraft && (
          <div className="laq-add-form"><div className="laq-add-form__row">
            <InvSearch value={newBB.reference} onChange={v => setNewBB(p => ({ ...p, reference: v, itemId: null }))} onSelect={(v, item) => { setNewBB(p => ({ ...p, reference: v, itemId: item?.id || item?._id || null })); capImg(v, item); }} superCategory="aluminium" label={t('lqRefAlu')} />
            <div className="laq-add-form__field"><label>{t('quantity')}</label><input type="number" className="laq-add-input laq-add-input--sm" min="1" value={newBB.quantiteBrute} onChange={e => setNewBB(p => ({ ...p, quantiteBrute: e.target.value }))} /></div>
            <button className="laq-add-btn" onClick={addBB}>{t('lqAdd')}</button>
          </div></div>
        )}
        <div className="laq-table-wrapper"><table className="laq-table">
          <thead><tr>
            <th style={{ width: 52 }}>{t('image')}</th><th>{t('lqRef')}</th><th>{t('lqQtyRaw')}</th>
            {isSent && canReceiveLaquage && <th>{t('lqRecvLaqCol')}</th>}
            {isRetCoord && canReceiveCoord && <th>{t('lqRecvCoordCol')}</th>}
            {canEdit && isDraft && <th style={{ width: 40 }} />}
          </tr></thead>
          <tbody>
            {!(lot.barresBrutes || []).length
              ? <tr><td colSpan={9} className="laq-empty-row">{t('lqNoBB')}</td></tr>
              : (lot.barresBrutes || []).map((row, i) => {
                const k = `bb-${i}`;
                return (
                  <tr key={i} {...rowProps(k)}>
                    <td onClick={e => e.stopPropagation()}>{imageMap[row.reference] ? <img src={imageMap[row.reference]} alt="" style={{ width: 44, height: 36, objectFit: 'contain', borderRadius: 4 }} /> : <span style={{ color: 'var(--text-4)', fontSize: 11 }}>—</span>}</td>
                    <td><strong>{row.reference || '—'}</strong></td>
                    <td>{row.quantiteBrute}</td>
                    {isSent && canReceiveLaquage && <td onClick={e => e.stopPropagation()}><RowActions lKey={k} lineLabel={`BB: ${row.reference}`} lineStatuses={ls} side="laq" onConfirm={() => ask(t('lqConfirmReceptionQ'), () => transition('receive_line_laquage', lot.lotIndex, k, { lineLabel: `BB: ${row.reference}` }))} onIncomplete={() => setIncomplete({ lKey: k, lotIndex: lot.lotIndex, lineLabel: `BB: ${row.reference}` })} /></td>}
                    {isRetCoord && canReceiveCoord && <td onClick={e => e.stopPropagation()}><RowActions lKey={k} lineLabel={`BB: ${row.reference}`} lineStatuses={ls} side="coord" onConfirm={() => ask(t('lqConfirmReceptionQ'), () => transition('receive_line_coord', lot.lotIndex, k, { lineLabel: `BB: ${row.reference}` }))} onIncomplete={() => setIncomplete({ lKey: k, lotIndex: lot.lotIndex, lineLabel: `BB: ${row.reference}` })} /></td>}
                    {canEdit && isDraft && <td onClick={e => e.stopPropagation()}><button className="delete-btn" onClick={() => removeRow('barresBrutes', i)}><XCircle size={13} /></button></td>}
                  </tr>
                );
              })}
          </tbody>
        </table></div>
      </div>

      {/* ── Section 2: Barres Laquées ── */}
      <div className="laq-section">
        <div className="laq-section-title">{t('lqSecBL')}</div>
        {canEdit && isDraft && (
          <div className="laq-add-form"><div className="laq-add-form__row">
            <InvSearch value={newBL.reference} onChange={v => setNewBL(p => ({ ...p, reference: v, itemId: null }))} onSelect={(v, item) => { setNewBL(p => ({ ...p, reference: v, itemId: item?.id || item?._id || null })); capImg(v, item); }} superCategory="aluminium" label={t('lqRefAlu')} />
            <div className="laq-add-form__field"><label>RAL</label><input className="laq-add-input laq-add-input--sm" placeholder={t('lqPhRal')} value={newBL.ral} onChange={e => setNewBL(p => ({ ...p, ral: e.target.value }))} /></div>
            <div className="laq-add-form__field"><label>{t('quantity')}</label><input type="number" className="laq-add-input laq-add-input--sm" min="1" value={newBL.quantiteLaquee} onChange={e => setNewBL(p => ({ ...p, quantiteLaquee: e.target.value }))} /></div>
            <button className="laq-add-btn" onClick={addBL}>{t('lqAdd')}</button>
          </div></div>
        )}
        <div className="laq-table-wrapper"><table className="laq-table">
          <thead><tr>
            <th style={{ width: 52 }}>{t('image')}</th><th>{t('lqRef')}</th><th>RAL</th><th>{t('lqQtyLaq')}</th>
            {isSent && canReceiveLaquage && <th>{t('lqRecvLaqCol')}</th>}
            {isRetCoord && canReceiveCoord && <th>{t('lqRecvCoordCol')}</th>}
            {canEdit && isDraft && <th style={{ width: 40 }} />}
          </tr></thead>
          <tbody>
            {!(lot.barresLaquees || []).length
              ? <tr><td colSpan={9} className="laq-empty-row">{t('lqNoBL')}</td></tr>
              : (lot.barresLaquees || []).map((row, i) => {
                const k = `bl-${i}`;
                return (
                  <tr key={i} {...rowProps(k)}>
                    <td onClick={e => e.stopPropagation()}>{imageMap[row.reference] ? <img src={imageMap[row.reference]} alt="" style={{ width: 44, height: 36, objectFit: 'contain', borderRadius: 4 }} /> : <span style={{ color: 'var(--text-4)', fontSize: 11 }}>—</span>}</td>
                    <td><strong>{row.reference || '—'}</strong></td>
                    <td><span className="laq-ral-chip">{row.ral || '—'}</span></td>
                    <td>{row.quantiteLaquee}</td>
                    {isSent && canReceiveLaquage && <td onClick={e => e.stopPropagation()}><RowActions lKey={k} lineLabel={`BL: ${row.reference}`} lineStatuses={ls} side="laq" onConfirm={() => ask(t('lqConfirmQ'), () => transition('receive_line_laquage', lot.lotIndex, k, { lineLabel: `BL: ${row.reference} RAL ${row.ral}` }))} onIncomplete={() => setIncomplete({ lKey: k, lotIndex: lot.lotIndex, lineLabel: `BL: ${row.reference}` })} /></td>}
                    {isRetCoord && canReceiveCoord && <td onClick={e => e.stopPropagation()}><RowActions lKey={k} lineLabel={`BL: ${row.reference}`} lineStatuses={ls} side="coord" onConfirm={() => ask(t('lqConfirmQ'), () => transition('receive_line_coord', lot.lotIndex, k, { lineLabel: `BL: ${row.reference} RAL ${row.ral}` }))} onIncomplete={() => setIncomplete({ lKey: k, lotIndex: lot.lotIndex, lineLabel: `BL: ${row.reference}` })} /></td>}
                    {canEdit && isDraft && <td onClick={e => e.stopPropagation()}><button className="delete-btn" onClick={() => removeRow('barresLaquees', i)}><XCircle size={13} /></button></td>}
                  </tr>
                );
              })}
          </tbody>
        </table></div>
      </div>

      {/* ── Section 3: Morceaux Bruts ── */}
      <div className="laq-section">
        <div className="laq-section-title">{t('lqSecMB')}</div>
        {canEdit && isDraft && (
          <div className="laq-add-form"><div className="laq-add-form__row">
            <InvSearch value={newMB.reference} onChange={v => setNewMB(p => ({ ...p, reference: v }))} onSelect={(v, item) => { setNewMB(p => ({ ...p, reference: v })); capImg(v, item); }} superCategory="aluminium" label={t('lqRefAlu')} />
            <div className="laq-add-form__field"><label>{t('lqMesure')}</label><input className="laq-add-input laq-add-input--sm" placeholder={t('lqPhMesure')} value={newMB.mesure} onChange={e => setNewMB(p => ({ ...p, mesure: e.target.value }))} /></div>
            <div className="laq-add-form__field"><label>{t('quantity')}</label><input type="number" className="laq-add-input laq-add-input--sm" min="1" value={newMB.quantite} onChange={e => setNewMB(p => ({ ...p, quantite: e.target.value }))} /></div>
            <button className="laq-add-btn" onClick={addMB}>{t('lqAdd')}</button>
          </div></div>
        )}
        <div className="laq-table-wrapper"><table className="laq-table">
          <thead><tr>
            <th style={{ width: 52 }}>{t('image')}</th><th>{t('lqRef')}</th><th>{t('lqMesure')}</th><th>{t('quantity')}</th>
            {isSent && canReceiveLaquage && <th>{t('lqRecvLaqCol')}</th>}
            {isRetCoord && canReceiveCoord && <th>{t('lqRecvCoordCol')}</th>}
            {canEdit && isDraft && <th style={{ width: 40 }} />}
          </tr></thead>
          <tbody>
            {!(lot.morceauxBruts || []).length
              ? <tr><td colSpan={9} className="laq-empty-row">{t('lqNoMB')}</td></tr>
              : (lot.morceauxBruts || []).map((row, i) => {
                const k = `mb-${i}`;
                return (
                  <tr key={i} {...rowProps(k)}>
                    <td onClick={e => e.stopPropagation()}>{imageMap[row.reference] ? <img src={imageMap[row.reference]} alt="" style={{ width: 44, height: 36, objectFit: 'contain', borderRadius: 4 }} /> : <span style={{ color: 'var(--text-4)', fontSize: 11 }}>—</span>}</td>
                    <td><strong>{row.reference || '—'}</strong></td>
                    <td>{row.mesure || '—'}</td><td>{row.quantite}</td>
                    {isSent && canReceiveLaquage && <td onClick={e => e.stopPropagation()}><RowActions lKey={k} lineLabel={`MB: ${row.reference}`} lineStatuses={ls} side="laq" onConfirm={() => ask(t('lqConfirmQ'), () => transition('receive_line_laquage', lot.lotIndex, k, { lineLabel: `MB: ${row.reference} ${row.mesure}` }))} onIncomplete={() => setIncomplete({ lKey: k, lotIndex: lot.lotIndex, lineLabel: `MB: ${row.reference}` })} /></td>}
                    {isRetCoord && canReceiveCoord && <td onClick={e => e.stopPropagation()}><RowActions lKey={k} lineLabel={`MB: ${row.reference}`} lineStatuses={ls} side="coord" onConfirm={() => ask(t('lqConfirmQ'), () => transition('receive_line_coord', lot.lotIndex, k, { lineLabel: `MB: ${row.reference} ${row.mesure}` }))} onIncomplete={() => setIncomplete({ lKey: k, lotIndex: lot.lotIndex, lineLabel: `MB: ${row.reference}` })} /></td>}
                    {canEdit && isDraft && <td onClick={e => e.stopPropagation()}><button className="delete-btn" onClick={() => removeRow('morceauxBruts', i)}><XCircle size={13} /></button></td>}
                  </tr>
                );
              })}
          </tbody>
        </table></div>
      </div>

      {/* ── Section 4: Morceaux Laqués ── */}
      <div className="laq-section">
        <div className="laq-section-title">{t('lqSecML')}</div>
        {canEdit && isDraft && (
          <div className="laq-add-form"><div className="laq-add-form__row" style={{ alignItems: 'flex-start' }}>
            <InvSearch value={newML.reference} onChange={v => setNewML(p => ({ ...p, reference: v }))} onSelect={(v, item) => { setNewML(p => ({ ...p, reference: v })); capImg(v, item); }} superCategory="aluminium" label={t('lqRefAlu')} />
            <div className="laq-ml-lignes">
              {newML.lignes.map((lg, li) => (
                <div key={li} className="laq-ml-ligne-row">
                  <div className="laq-add-form__field">{li === 0 && <label>RAL</label>}<input className="laq-add-input laq-add-input--sm" placeholder="RAL" value={lg.ral} onChange={e => updateMLLigne(li, 'ral', e.target.value)} /></div>
                  <div className="laq-add-form__field">{li === 0 && <label>{t('lqMesure')}</label>}<input className="laq-add-input laq-add-input--sm" placeholder={t('lqMesure')} value={lg.mesure} onChange={e => updateMLLigne(li, 'mesure', e.target.value)} /></div>
                  <div className="laq-add-form__field">{li === 0 && <label>{t('quantity')}</label>}<input type="number" className="laq-add-input laq-add-input--sm" min="1" value={lg.quantite} onChange={e => updateMLLigne(li, 'quantite', e.target.value)} /></div>
                  {newML.lignes.length > 1 && <button className="delete-btn" style={{ marginTop: li === 0 ? 22 : 0 }} onClick={() => removeMLLigne(li)}><XCircle size={13} /></button>}
                </div>
              ))}
              <button className="laq-add-ligne-btn" onClick={addMLLigne}>{t('lqAddRalLine')}</button>
            </div>
            <button className="laq-add-btn" style={{ alignSelf: 'flex-end' }} onClick={addML}>{t('lqAdd')}</button>
          </div></div>
        )}
        <div className="laq-table-wrapper"><table className="laq-table">
          <thead><tr>
            <th style={{ width: 52 }}>{t('image')}</th><th>{t('lqRef')}</th><th>RAL</th><th>{t('lqMesure')}</th><th>{t('quantity')}</th>
            {isSent && canReceiveLaquage && <th>{t('lqRecvLaqCol')}</th>}
            {isRetCoord && canReceiveCoord && <th>{t('lqRecvCoordCol')}</th>}
            {canEdit && isDraft && <th style={{ width: 40 }} />}
          </tr></thead>
          <tbody>
            {!(lot.morceauxLaques || []).length
              ? <tr><td colSpan={9} className="laq-empty-row">{t('lqNoML')}</td></tr>
              : (lot.morceauxLaques || []).flatMap((row, i) =>
                (row.lignes || [{}]).map((lg, li) => {
                  const k = `ml-${i}-${li}`;
                  const isFirst = li === 0;
                  const rs = (row.lignes || [{}]).length;
                  return (
                    <tr key={`${i}-${li}`} {...rowProps(k)} className={'laq-table-row' + (li > 0 ? ' laq-sub-row' : '') + (selected.has(`${lot.lotIndex}-${k}`) ? ' laq-row--selected' : '')}>
                      {isFirst && <td rowSpan={rs} style={{ verticalAlign: 'middle' }} onClick={e => e.stopPropagation()}>{imageMap[row.reference] ? <img src={imageMap[row.reference]} alt="" style={{ width: 44, height: 36, objectFit: 'contain', borderRadius: 4 }} /> : <span style={{ color: 'var(--text-4)', fontSize: 11 }}>—</span>}</td>}
                      {isFirst && <td rowSpan={rs} style={{ verticalAlign: 'middle' }}><strong>{row.reference || '—'}</strong></td>}
                      <td><span className="laq-ral-chip">{lg.ral || '—'}</span></td>
                      <td>{lg.mesure || '—'}</td><td>{lg.quantite}</td>
                      {isSent && canReceiveLaquage && <td onClick={e => e.stopPropagation()}><RowActions lKey={k} lineLabel={`ML: ${row.reference} ${lg.ral}`} lineStatuses={ls} side="laq" onConfirm={() => ask(t('lqConfirmQ'), () => transition('receive_line_laquage', lot.lotIndex, k, { lineLabel: `ML: ${row.reference} RAL ${lg.ral}` }))} onIncomplete={() => setIncomplete({ lKey: k, lotIndex: lot.lotIndex, lineLabel: `ML: ${row.reference} ${lg.ral}` })} /></td>}
                      {isRetCoord && canReceiveCoord && <td onClick={e => e.stopPropagation()}><RowActions lKey={k} lineLabel={`ML: ${row.reference} ${lg.ral}`} lineStatuses={ls} side="coord" onConfirm={() => ask(t('lqConfirmQ'), () => transition('receive_line_coord', lot.lotIndex, k, { lineLabel: `ML: ${row.reference} RAL ${lg.ral}` }))} onIncomplete={() => setIncomplete({ lKey: k, lotIndex: lot.lotIndex, lineLabel: `ML: ${row.reference} ${lg.ral}` })} /></td>}
                      {canEdit && isDraft && isFirst && <td rowSpan={rs} style={{ verticalAlign: 'middle', textAlign: 'center' }} onClick={e => e.stopPropagation()}><button className="delete-btn" onClick={() => updateLotData('morceauxLaques', lot.morceauxLaques.filter((_, idx) => idx !== i))}><XCircle size={13} /></button></td>}
                    </tr>
                  );
                })
              )}
          </tbody>
        </table></div>
      </div>

      {/* ── Workflow actions for active lot ── */}
      <div className="laq-workflow">
        <div className="laq-workflow-title">
          {t('lqActions')} — <LotBadge lotIndex={lot.lotIndex} />
        </div>
        <div className="laq-workflow-buttons">
          {canSendToLaquage && isDraft && (
            <button className="laq-wf-btn laq-wf-btn--send" disabled={saving}
              onClick={() => ask(t('lqSendConfirmBarres', { n: lot.lotIndex + 1 }), () => transition('send_to_laquage', lot.lotIndex, null))}>
              <Send size={14} /> {t('lqSendBtn', { n: lot.lotIndex + 1 })}
            </button>
          )}
          {canReceiveLaquage && isSent && (
            <button
              className={'laq-wf-btn laq-wf-btn--receive' + (allRecvLaq ? ' laq-wf-btn--done' : '')}
              disabled={saving || allRecvLaq}
              onClick={() => setReceptionNote({ lotIndex: lot.lotIndex, action: 'receive_all_laquage', title: t('lqReceiveAllTitleLaq', { n: lot.lotIndex + 1 }) })}>
              <PackageCheck size={14} /> {t('lqReceiveAllBtn', { n: lot.lotIndex + 1 })}
            </button>
          )}
          {canReturnToCoord && isRecvLaq && (
            <button className="laq-wf-btn laq-wf-btn--return" disabled={saving}
              onClick={() => ask(t('lqReturnConfirm', { n: lot.lotIndex + 1 }), () => transition('return_to_coord', lot.lotIndex, null))}>
              <RotateCcw size={14} /> {t('lqReturnBtn', { n: lot.lotIndex + 1 })}
            </button>
          )}
          {canReceiveCoord && isRetCoord && (
            <button
              className={'laq-wf-btn laq-wf-btn--receive' + (allRecvCoord ? ' laq-wf-btn--done' : '')}
              disabled={saving || allRecvCoord}
              onClick={() => setReceptionNote({ lotIndex: lot.lotIndex, action: 'receive_all_coord', title: t('lqReceiveAllTitleCoord', { n: lot.lotIndex + 1 }) })}>
              <PackageCheck size={14} /> {t('lqReceiveAllBtn', { n: lot.lotIndex + 1 })}
            </button>
          )}
          {lotStatus === 'received_coord' && (
            <div className="laq-wf-complete"><CheckCircle2 size={16} /> {t('lqLotDone', { n: lot.lotIndex + 1 })}</div>
          )}
        </div>
      </div>

      {/* Add new lot banner — shown whenever there is no existing draft lot */}
      {canAddLot && (
        <AddLotBanner canEdit={canEdit} addingLot={addingLot} onAdd={addNewLot} />
      )}

      <HistoryLog history={history} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ACCESSOIRES PANEL
   ═══════════════════════════════════════════════════════════════ */
export function AccessoiresLaquerPanel({ project, currentUser }) {
  const { user: authUser } = useAuth();
  const { t } = useLanguage();
  const _cu = currentUser || authUser;
  const userRole = (typeof _cu?.role === 'string' ? _cu.role : _cu?.role?.name) || _cu?.roleName || '';
  const displayName = _cu?.displayName || userRole;
  const isAdmin = userRole === 'Admin';
  const canEdit = isAdmin || [ROLE_BARREMAN, ROLE_MAGASINIER].includes(userRole);
  const canSendToLaquage = isAdmin || [ROLE_BARREMAN, ROLE_MAGASINIER].includes(userRole);
  const canReceiveLaquage = isAdmin || userRole === ROLE_LAQUAGE;
  const canReturnToCoord = isAdmin || userRole === ROLE_LAQUAGE;
  const canReceiveCoord = isAdmin || userRole === ROLE_COORDINATEUR;

  const { toasts, push: toast } = useToast();

  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [incomplete, setIncomplete] = useState(null);
  const [receptionNote, setReceptionNote] = useState(null);
  const [activeLotIdx, setActiveLotIdx] = useState(0);
  const [selected, setSelected] = useState(new Set());
  const [imageMap, setImageMap] = useState({});
  const [addingLot, setAddingLot] = useState(false);

  const emptyAcc = { designation: '', quantite: 1, notes: '' };
  const [newAcc, setNewAcc] = useState(emptyAcc);

  const loadImages = useCallback(async (rec) => {
    const refs = new Set();
    for (const lot of rec.lots || []) {
      (lot.accessoires || []).forEach(a => a.designation && refs.add(a.designation));
    }
    const map = {};
    await Promise.all([...refs].map(async (ref) => {
      try {
        const res = await axios.get(`${API_URL}/inventory/search?q=${encodeURIComponent(ref)}&superCategory=accessoires`);
        const match = (res.data || []).find(i => (i.designation?.fr || i.designation || '') === ref);
        if (match?.image) map[ref] = match.image;
      } catch { }
    }));
    setImageMap(map);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/projects/${project.id}/laquage/accessoires`);
      setRecord(res.data);
      await loadImages(res.data);
      const lots = res.data.lots || [];
      if (lots.length > 0) setActiveLotIdx(lots[lots.length - 1].lotIndex);
    } catch {
      setRecord({ lots: [{ lotIndex: 0, status: 'draft', accessoires: [], lineStatuses: {} }], history: [] });
    } finally { setLoading(false); }
  }, [project.id, loadImages]);

  useEffect(() => { load(); }, [load]);

  const activeLot = (record?.lots || []).find(l => l.lotIndex === activeLotIdx) || (record?.lots || [])[0];

  const saveLot = async () => {
    if (!activeLot) return;
    setSaving(true); setError('');
    try {
      const res = await axios.put(
        `${API_URL}/projects/${project.id}/laquage/accessoires/lot/${activeLot.lotIndex}`,
        { accessoires: activeLot.accessoires }
      );
      setRecord(res.data);
      toast(t('lqSaved'));
    } catch (e) {
      setError(e.response?.data?.error || t('lqSaveError'));
    } finally { setSaving(false); }
  };

  const addNewLot = async () => {
    setAddingLot(true); setError('');
    try {
      const res = await axios.post(
        `${API_URL}/projects/${project.id}/laquage/accessoires/lot`,
        { accessoires: [], by: displayName }
      );
      setRecord(res.data);
      const newLots = res.data.lots || [];
      const newest = newLots[newLots.length - 1];
      setActiveLotIdx(newest.lotIndex);
      toast(t('lqLotCreated', { n: newest.lotIndex + 1 }));
    } catch (e) {
      setError(e.response?.data?.error || t('lqLotCreateError'));
    } finally { setAddingLot(false); }
  };

  const transition = async (action, lotIndex, lineKey, extra = {}) => {
    setSaving(true); setError('');
    try {
      const res = await axios.post(
        `${API_URL}/projects/${project.id}/laquage/accessoires/action`,
        { action, lotIndex, lineKey, by: displayName, ...extra }
      );
      setRecord(res.data);
      toast(t('lqActionConfirmed'));
    } catch (e) {
      setError(e.response?.data?.error || t('lqActionError'));
    } finally { setSaving(false); setConfirm(null); setIncomplete(null); setReceptionNote(null); }
  };

  const ask = (msg, fn) => setConfirm({ message: msg, action: fn });

  const updateLotData = (key, value) => {
    if (!activeLot) return;
    setRecord(p => ({
      ...p,
      lots: p.lots.map(l => l.lotIndex === activeLot.lotIndex ? { ...l, [key]: value } : l)
    }));
  };

  const addAcc = () => {
    if (!newAcc.designation.trim()) return setError(t('lqDesignationRequired'));
    updateLotData('accessoires', [...(activeLot.accessoires || []), { ...newAcc, quantite: Number(newAcc.quantite) || 1 }]);
    setNewAcc(emptyAcc); setError('');
  };

  if (loading) return <div className="laq-loading">{t('loadingShort')}</div>;
  if (!record) return null;

  const lots = record.lots || [];
  const history = record.history || [];

  const lot = activeLot || {};
  const lotStatus = lot.status || 'draft';
  const ls = lot.lineStatuses || {};
  const isDraft = isAdmin || lotStatus === 'draft';
  const isSent = isAdmin || lotStatus === 'sent_to_laquage';
  const isRecvLaq = isAdmin || lotStatus === 'received_laquage';
  const isRetCoord = isAdmin || lotStatus === 'returned_to_coord';

  const allKeys = (lot.accessoires || []).map((_, i) => `acc-${i}`);
  const allRecvLaq = allKeys.length > 0 && allKeys.every(k => ls[k]?.receivedLaquage);
  const allRecvCoord = allKeys.length > 0 && allKeys.every(k => ls[k]?.receivedCoord);

  const toggleRow = k => setSelected(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const isRowLocked = k => { const s = ls[k] || {}; if (isSent && s.receivedLaquage) return true; if (isRetCoord && s.receivedCoord) return true; return false; };
  const rowProps = k => ({
    className: 'laq-table-row' + (selected.has(`${lot.lotIndex}-${k}`) ? ' laq-row--selected' : '') + (isRowLocked(k) ? ' laq-row--locked' : ''),
    onClick: () => { if (!isRowLocked(k)) toggleRow(`${lot.lotIndex}-${k}`); },
    style: { cursor: isRowLocked(k) ? 'default' : 'pointer' },
  });

  // ── FIX: same logic — only block if there's already a draft lot open
  const hasDraftLot = lots.some(l => l.status === 'draft');
  const canAddLot = canEdit && !hasDraftLot;

  return (
    <div className="laq-panel">
      <Toast toasts={toasts} />
      {confirm && <ConfirmModal message={confirm.message} onConfirm={confirm.action} onCancel={() => setConfirm(null)} />}
      {incomplete && (
        <IncompleteModal lineLabel={incomplete.lineLabel} onCancel={() => setIncomplete(null)}
          onConfirm={({ note, partialQty }) => transition('incomplete_line', incomplete.lotIndex, incomplete.lKey, { note, partialQty, lineLabel: incomplete.lineLabel })} />
      )}
      {receptionNote && (
        <ReceptionNoteModal title={receptionNote.title} onCancel={() => setReceptionNote(null)}
          onConfirm={({ note, partialQty }) => transition(receptionNote.action, receptionNote.lotIndex, null, { note, partialQty })} />
      )}

      <div className="laq-panel-header">
        <div className="laq-panel-title"><span>🔩</span><h3>{t('lqAccTitle')}</h3><StatusBadge status={lotStatus} /></div>
        <div className="laq-panel-actions">
          {canEdit && isDraft && (
            <button className="laq-save-btn" disabled={saving} onClick={saveLot}>
              <Save size={14} />
            </button>
          )}
          {/* Per-lot PDF — visible to all */}
          {activeLot && (
            <button
              className="laq-print-btn"
              title={t('lqPrintLot', { n: activeLot.lotIndex + 1 })}
              onClick={() => printPDF(record, project, 'accessoires', selected, imageMap, activeLot.lotIndex, true)}
            >
              <Printer size={14} /> {t('lqLot', { n: activeLot.lotIndex + 1 })}
            </button>
          )}
          {/* Global PDF — admin only */}
          {isAdmin && (
            <button
              className="laq-print-btn laq-print-btn--strong"
              title={t('lqPdfGlobalTitle')}
              onClick={() => printPDF(record, project, 'accessoires', new Set(), imageMap, null, false)}
            >
              <Printer size={14} /> {t('lqGlobal')}
            </button>
          )}
        </div>
      </div>

      {error && <div className="laq-error">{error}</div>}

      {/* Lot tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0 4px', flexWrap: 'wrap' }}>
        {lots.map(l => (
          <button key={l.lotIndex} onClick={() => setActiveLotIdx(l.lotIndex)}
            className={`laq-lot-tab${l.lotIndex === activeLotIdx ? ' laq-lot-tab--active' : ''}`}>
            <Package size={12} />
            {t('lqLot', { n: l.lotIndex + 1 })}
            <span className="laq-lot-tab__status" style={{ background: (LOT_STATUSES[l.status] || LOT_STATUSES.draft).color + '1f', color: (LOT_STATUSES[l.status] || LOT_STATUSES.draft).ink }}>
              {t((LOT_STATUSES[l.status] || LOT_STATUSES.draft).label)}
            </span>
          </button>
        ))}
        {canAddLot && (
          <button onClick={addNewLot} disabled={addingLot}
            className="laq-lot-tab laq-lot-tab--add" style={{ opacity: addingLot ? 0.5 : 1 }}>
            <Plus size={12} /> {t('lqNewLot')}
          </button>
        )}
      </div>

      {activeLot && (
        <div className="laq-lot-progress">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>{t('lqProgress', { n: activeLot.lotIndex + 1 })}</span>
            {activeLot.receptionLaquageNote && <span style={{ fontSize: 11, color: '#93c5fd' }}>📝 {activeLot.receptionLaquageNote}{activeLot.receptionLaquageQty != null ? ` (${activeLot.receptionLaquageQty})` : ''}</span>}
            {activeLot.receptionCoordNote && <span style={{ fontSize: 11, color: '#86efac' }}>📝 {activeLot.receptionCoordNote}{activeLot.receptionCoordQty != null ? ` (${activeLot.receptionCoordQty})` : ''}</span>}
          </div>
          <LotTimeline lot={activeLot} history={history} />
        </div>
      )}

      <div className="laq-section">
        {canEdit && isDraft && (
          <div className="laq-add-form"><div className="laq-add-form__row">
            <InvSearch value={newAcc.designation} onChange={v => setNewAcc(p => ({ ...p, designation: v }))}
              onSelect={(v, item) => { setNewAcc(p => ({ ...p, designation: v })); if (item?.image) setImageMap(m => ({ ...m, [v]: item.image })); }}
              superCategory="accessoires" label={t('lqDesigAcc')} />
            <div className="laq-add-form__field"><label>{t('quantity')}</label><input type="number" className="laq-add-input laq-add-input--sm" min="1" value={newAcc.quantite} onChange={e => setNewAcc(p => ({ ...p, quantite: e.target.value }))} /></div>
            <div className="laq-add-form__field" style={{ flex: 2 }}><label>{t('lqNotes')}</label><input className="laq-add-input" placeholder={t('lqNotesPh')} value={newAcc.notes} onChange={e => setNewAcc(p => ({ ...p, notes: e.target.value }))} /></div>
            <button className="laq-add-btn" onClick={addAcc}>{t('lqAdd')}</button>
          </div></div>
        )}
        <div className="laq-table-wrapper"><table className="laq-table">
          <thead><tr>
            <th style={{ width: 52 }}>{t('image')}</th><th>{t('designation')}</th><th>{t('quantity')}</th><th>{t('lqNotes')}</th>
            {isSent && canReceiveLaquage && <th>{t('lqRecvLaqCol')}</th>}
            {isRetCoord && canReceiveCoord && <th>{t('lqRecvCoordCol')}</th>}
            {canEdit && isDraft && <th style={{ width: 40 }} />}
          </tr></thead>
          <tbody>
            {!(lot.accessoires || []).length
              ? <tr><td colSpan={9} className="laq-empty-row">{t('lqNoAcc')}</td></tr>
              : (lot.accessoires || []).map((acc, i) => {
                const k = `acc-${i}`;
                return (
                  <tr key={i} {...rowProps(k)}>
                    <td onClick={e => e.stopPropagation()}>{imageMap[acc.designation] ? <img src={imageMap[acc.designation]} alt="" style={{ width: 44, height: 36, objectFit: 'contain', borderRadius: 4 }} /> : <span style={{ color: 'var(--text-4)', fontSize: 11 }}>—</span>}</td>
                    <td><strong>{acc.designation || '—'}</strong></td>
                    <td>{acc.quantite}</td><td>{acc.notes || '—'}</td>
                    {isSent && canReceiveLaquage && <td onClick={e => e.stopPropagation()}><RowActions lKey={k} lineLabel={acc.designation} lineStatuses={ls} side="laq" onConfirm={() => ask(t('lqConfirmQ'), () => transition('receive_line_laquage', lot.lotIndex, k, { lineLabel: acc.designation }))} onIncomplete={() => setIncomplete({ lKey: k, lotIndex: lot.lotIndex, lineLabel: acc.designation })} /></td>}
                    {isRetCoord && canReceiveCoord && <td onClick={e => e.stopPropagation()}><RowActions lKey={k} lineLabel={acc.designation} lineStatuses={ls} side="coord" onConfirm={() => ask(t('lqConfirmQ'), () => transition('receive_line_coord', lot.lotIndex, k, { lineLabel: acc.designation }))} onIncomplete={() => setIncomplete({ lKey: k, lotIndex: lot.lotIndex, lineLabel: acc.designation })} /></td>}
                    {canEdit && isDraft && <td onClick={e => e.stopPropagation()}><button className="delete-btn" onClick={() => updateLotData('accessoires', lot.accessoires.filter((_, idx) => idx !== i))}><XCircle size={13} /></button></td>}
                  </tr>
                );
              })}
          </tbody>
        </table></div>
      </div>

      <div className="laq-workflow">
        <div className="laq-workflow-title">{t('lqActions')} — <LotBadge lotIndex={lot.lotIndex} /></div>
        <div className="laq-workflow-buttons">
          {canSendToLaquage && isDraft && (
            <button className="laq-wf-btn laq-wf-btn--send" disabled={saving}
              onClick={() => ask(t('lqSendConfirm', { n: lot.lotIndex + 1 }), () => transition('send_to_laquage', lot.lotIndex, null))}>
              <Send size={14} /> {t('lqSendBtn', { n: lot.lotIndex + 1 })}
            </button>
          )}
          {canReceiveLaquage && isSent && (
            <button className={'laq-wf-btn laq-wf-btn--receive' + (allRecvLaq ? ' laq-wf-btn--done' : '')}
              disabled={saving || allRecvLaq}
              onClick={() => setReceptionNote({ lotIndex: lot.lotIndex, action: 'receive_all_laquage', title: t('lqReceiveAllTitleLaq', { n: lot.lotIndex + 1 }) })}>
              <PackageCheck size={14} /> {t('lqReceiveAllBtn', { n: lot.lotIndex + 1 })}
            </button>
          )}
          {canReturnToCoord && isRecvLaq && (
            <button className="laq-wf-btn laq-wf-btn--return" disabled={saving}
              onClick={() => ask(t('lqReturnConfirm', { n: lot.lotIndex + 1 }), () => transition('return_to_coord', lot.lotIndex, null))}>
              <RotateCcw size={14} /> {t('lqReturnBtn', { n: lot.lotIndex + 1 })}
            </button>
          )}
          {canReceiveCoord && isRetCoord && (
            <button className={'laq-wf-btn laq-wf-btn--receive' + (allRecvCoord ? ' laq-wf-btn--done' : '')}
              disabled={saving || allRecvCoord}
              onClick={() => setReceptionNote({ lotIndex: lot.lotIndex, action: 'receive_all_coord', title: t('lqReceiveAllTitleCoord', { n: lot.lotIndex + 1 }) })}>
              <PackageCheck size={14} /> {t('lqReceiveAllBtn', { n: lot.lotIndex + 1 })}
            </button>
          )}
          {lotStatus === 'received_coord' && (
            <div className="laq-wf-complete"><CheckCircle2 size={16} /> {t('lqLotDone', { n: lot.lotIndex + 1 })}</div>
          )}
        </div>
      </div>

      {/* Add new lot banner — shown whenever there is no existing draft lot */}
      {canAddLot && (
        <AddLotBanner canEdit={canEdit} addingLot={addingLot} onAdd={addNewLot} />
      )}

      <HistoryLog history={history} />
    </div>
  );
}