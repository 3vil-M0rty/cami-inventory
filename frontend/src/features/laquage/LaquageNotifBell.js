import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import {
  Bell, Clock, X, CheckCircle2, AlertTriangle,
  Send, RotateCcw, PackageCheck, Trash2, ShoppingCart
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
const POLL_MS  = 20_000;
const LS_READ  = 'notif_bell_read_ids';   // replaces the old single-timestamp key
const PRUNE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/* ── Per-notification ID helpers ─────────────────────────────── */
function getNotifId(ev) {
  if (ev._type === 'purchase') return `pr_${ev._id}`;
  return `laq_${ev.action}_${ev.projectId}_${new Date(ev.at).getTime()}`;
}

function loadReadIds() {
  try {
    const raw  = JSON.parse(localStorage.getItem(LS_READ) || '{}');
    const cutoff = Date.now() - PRUNE_MS;
    // raw is { id: savedAt_ms }
    return new Set(
      Object.entries(raw)
        .filter(([, ts]) => ts > cutoff)
        .map(([id]) => id)
    );
  } catch { return new Set(); }
}

function persistReadIds(newIds, existingSet) {
  try {
    const raw    = JSON.parse(localStorage.getItem(LS_READ) || '{}');
    const now    = Date.now();
    const cutoff = now - PRUNE_MS;
    // merge new IDs
    for (const id of newIds) { if (!raw[id]) raw[id] = now; }
    // prune old
    for (const id of Object.keys(raw)) { if (raw[id] < cutoff) delete raw[id]; }
    localStorage.setItem(LS_READ, JSON.stringify(raw));
  } catch { /* silent */ }
}

/* ── Laquage action metadata ─────────────────────────────────── */
const LAQUAGE_META = {
  send_to_laquage:     { label: 'Envoyé au laquage',               color: '#f59e0b', icon: <Send size={13}/> },
  receive_all_laquage: { label: 'Tout réceptionné (Laquage)',      color: '#3b82f6', icon: <PackageCheck size={13}/> },
  return_to_coord:     { label: 'Retourné au coordinateur',        color: '#8b5cf6', icon: <RotateCcw size={13}/> },
  receive_all_coord:   { label: 'Tout réceptionné (Coordinateur)', color: '#16a34a', icon: <CheckCircle2 size={13}/> },
  incomplete_line:     { label: 'Ligne signalée incomplète',       color: '#dc2626', icon: <AlertTriangle size={13}/> },
};

function getLaquageMeta(action) {
  return LAQUAGE_META[action] || { label: action, color: '#9ca3af', icon: <Bell size={13}/> };
}

function fmtDT(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('fr-FR') + ' ' + dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export default function NotifBell() {
  const { can } = useAuth();
  const isAdmin = can('admin.view');

  const [events,   setEvents]   = useState([]);
  const [readIds,  setReadIds]  = useState(() => loadReadIds());
  const [open,     setOpen]     = useState(false);
  const [badge,    setBadge]    = useState(0);
  const [deleting, setDeleting] = useState(false);

  /* ── Fetch both sources ─────────────────────────────────────── */
  const fetchAll = useCallback(async () => {
    try {
      const requests = [
        axios.get(`${API_URL}/laquage/recent-actions?limit=30`).catch(() => ({ data: [] })),
      ];
      if (isAdmin) {
        requests.push(
          axios.get(`${API_URL}/purchase-requests?status=ordered&limit=30`).catch(() => ({ data: [] }))
        );
      }
      const [laqRes, prRes] = await Promise.all(requests);

      const laqEvents = (laqRes.data || []).map(ev => ({ ...ev, _type: 'laquage' }));
      const prEvents  = isAdmin
        ? (prRes?.data || []).map(pr => ({
            _type:       'purchase',
            action:      'purchase_ordered',
            at:          pr.orderedAt || pr.updatedAt,
            by:          pr.orderedBy || 'ACHAT',
            projectName: pr.itemName,
            projectRef:  `Qté : ${pr.quantity}`,
            note:        pr.note || null,
            _id:         pr.id || pr._id,
          }))
        : [];

      const all = [...laqEvents, ...prEvents].sort((a, b) => new Date(b.at) - new Date(a.at));
      setEvents(all.slice(0, 40));
    } catch { /* silent */ }
  }, [isAdmin]);

  /* ── Recompute badge whenever events or readIds change ─────── */
  useEffect(() => {
    const currentRead = loadReadIds(); // always read fresh from localStorage
    const unread = events.filter(ev => !currentRead.has(getNotifId(ev))).length;
    setBadge(Math.min(unread, 9));
  }, [events, readIds]);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, POLL_MS);
    return () => clearInterval(id);
  }, [fetchAll]);

  /* ── Close on outside click ─────────────────────────────────── */
  const wrapRef = useRef(null);
  useEffect(() => {
    const h = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  /* ── Mark all visible notifications as read ─────────────────── */
  const markAllRead = useCallback(() => {
    const ids = events.map(getNotifId);
    persistReadIds(ids);
    setReadIds(loadReadIds());
    setBadge(0);
  }, [events]);

  const handleBellClick = () => {
    if (open) {
      setOpen(false);
    } else {
      markAllRead();
      setOpen(true);
    }
  };

  /* ── Admin: delete one notification ────────────────────────── */
  const deleteOne = async (ev) => {
    if (deleting) return;
    setDeleting(true);
    try {
      if (ev._type === 'laquage') {
        await axios.delete(`${API_URL}/laquage/history-entry`, {
          data: { projectId: ev.projectId, action: ev.action, at: ev.at }
        });
        setEvents(prev => prev.filter(e =>
          !(e._type === 'laquage' &&
            String(e.projectId) === String(ev.projectId) &&
            e.action === ev.action &&
            new Date(e.at).getTime() === new Date(ev.at).getTime())
        ));
      } else if (ev._type === 'purchase') {
        await axios.delete(`${API_URL}/purchase-requests/${ev._id}`);
        setEvents(prev => prev.filter(e =>
          !(e._type === 'purchase' && String(e._id) === String(ev._id))
        ));
      }
    } catch { /* silent */ }
    finally { setDeleting(false); }
  };

  /* ── Admin: clear all laquage history ──────────────────────── */
  const clearAll = async () => {
    if (deleting) return;
    if (!window.confirm('Supprimer toutes les notifications laquage ?')) return;
    setDeleting(true);
    try {
      await axios.delete(`${API_URL}/laquage/history-all`);
      setEvents(prev => prev.filter(e => e._type !== 'laquage'));
    } catch { /* silent */ }
    finally { setDeleting(false); }
  };

  /* ── Render helpers ─────────────────────────────────────────── */
  const displayBadge = badge >= 9 ? '9+' : badge;
  const hasLaquage   = events.some(e => e._type === 'laquage');

  const unreadCount = events.filter(ev => !readIds.has(getNotifId(ev))).length;

  const renderEvent = (ev, i) => {
    const isRead    = readIds.has(getNotifId(ev));
    const rowStyle  = {
      display: 'flex', gap: 12, padding: '11px 16px',
      borderBottom: '1px solid #f5f5f5', alignItems: 'flex-start',
      background: isRead ? 'transparent' : '#fffbf0',
      borderLeft: isRead ? '3px solid transparent' : '3px solid #f59e0b',
      opacity: isRead ? 0.72 : 1,
      transition: 'background .15s',
    };

    if (ev._type === 'purchase') {
      return (
        <div key={`pr-${i}`} className="notif-row" style={rowStyle}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#f59e0b18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#f59e0b' }}>
            <ShoppingCart size={13}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
              Commande lancée par ACHAT
              {isRead && <span style={{ fontSize: 9, fontWeight: 600, color: '#aaa', background: '#f0f0f0', borderRadius: 4, padding: '1px 5px', letterSpacing: '.03em' }}>VU</span>}
            </div>
            <div style={{ fontSize: 12, color: '#222', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ev.projectName}
              {ev.projectRef && <span style={{ color: '#888', fontWeight: 400 }}> · {ev.projectRef}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#999', marginTop: 2 }}>
              <Clock size={10}/> {fmtDT(ev.at)}
              {ev.by && ev.by !== '—' && <><span>·</span><span>{ev.by}</span></>}
            </div>
            {ev.note && (
              <div style={{ fontSize: 11, color: '#555', marginTop: 3, padding: '2px 7px', background: '#f5f5f5', borderRadius: 4 }}>
                📝 {ev.note}
              </div>
            )}
          </div>
          {isAdmin && (
            <button
              onClick={() => deleteOne(ev)}
              disabled={deleting}
              title="Supprimer"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ddd', padding: 2, flexShrink: 0, display: 'flex', alignItems: 'center', marginTop: 2 }}
              onMouseEnter={e => e.currentTarget.style.color = '#dc2626'}
              onMouseLeave={e => e.currentTarget.style.color = '#ddd'}
            >
              <Trash2 size={12}/>
            </button>
          )}
        </div>
      );
    }

    // Laquage event
    const meta = getLaquageMeta(ev.action);
    return (
      <div key={`lq-${i}`} className="notif-row" style={rowStyle}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: meta.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: meta.color }}>
          {meta.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: meta.color, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
            {meta.label}
            {isRead && <span style={{ fontSize: 9, fontWeight: 600, color: '#aaa', background: '#f0f0f0', borderRadius: 4, padding: '1px 5px', letterSpacing: '.03em' }}>VU</span>}
          </div>
          {ev.projectName && (
            <div style={{ fontSize: 12, color: '#222', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ev.projectName}
              {ev.projectRef && <span style={{ color: '#888', fontWeight: 400 }}> · {ev.projectRef}</span>}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#999', marginTop: 2 }}>
            <Clock size={10}/> {fmtDT(ev.at)}
            {ev.by && ev.by !== '—' && <><span>·</span><span>{ev.by}</span></>}
          </div>
          {ev.note && (
            <div style={{ fontSize: 11, color: '#555', marginTop: 3, padding: '2px 7px', background: '#f5f5f5', borderRadius: 4 }}>
              📝 {ev.note}
            </div>
          )}
        </div>
        {isAdmin && (
          <button
            className="notif-trash"
            onClick={() => deleteOne(ev)}
            disabled={deleting}
            title="Supprimer"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ddd', padding: 2, flexShrink: 0, display: 'flex', alignItems: 'center', marginTop: 2 }}
            onMouseEnter={e => e.currentTarget.style.color = '#dc2626'}
            onMouseLeave={e => e.currentTarget.style.color = '#ddd'}
          >
            <Trash2 size={12}/>
          </button>
        )}
      </div>
    );
  };

  /* ── JSX ────────────────────────────────────────────────────── */
  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>

      {/* Bell button */}
      <button
        onClick={handleBellClick}
        title="Notifications"
        style={{
          position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 34, height: 34,
          background: open ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.08)',
          border: '1px solid rgba(255,255,255,.18)',
          borderRadius: '50%',
          cursor: 'pointer', color: '#fff',
          transition: 'background .15s',
        }}
      >
        <Bell size={16} strokeWidth={2}/>

        {badge > 0 && (
          <span style={{
            position: 'absolute', top: -5, right: -5,
            background: '#dc2626', color: '#fff',
            fontSize: 10, fontWeight: 800,
            minWidth: 18, height: 18, borderRadius: 999,
            padding: '0 4px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid var(--900, #111)',
            lineHeight: 1, whiteSpace: 'nowrap', boxSizing: 'border-box',
            pointerEvents: 'none',
          }}>
            {displayBadge}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 10px)', right: 0,
          width: 'min(370px, 92vw)',
          background: '#fff', borderRadius: 14,
          boxShadow: '0 16px 60px rgba(0,0,0,.22)',
          border: '1px solid #e8e8e8',
          zIndex: 9999, overflow: 'hidden',
          animation: 'notifBellIn .18s ease',
        }}>
          <style>{`
            @keyframes notifBellIn { from { opacity:0; transform:translateY(-8px) scale(.97); } to { opacity:1; transform:translateY(0) scale(1); } }
            .notif-row:hover { background: #f9f9f9 !important; }
          `}</style>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #f0f0f0', background: '#fafafa' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bell size={15} style={{ color: '#555' }}/>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>Notifications</span>
              {unreadCount > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, background: '#dc2626', color: '#fff', borderRadius: 999, padding: '1px 6px' }}>
                  {unreadCount} non lu{unreadCount > 1 ? 'es' : 'e'}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {isAdmin && hasLaquage && (
                <button onClick={clearAll} disabled={deleting} title="Effacer historique laquage"
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer', color: '#dc2626', fontSize: 11, fontWeight: 600, fontFamily: 'inherit', opacity: deleting ? .5 : 1 }}>
                  <Trash2 size={11}/> Tout effacer
                </button>
              )}
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', display: 'flex', padding: 4 }}>
                <X size={14}/>
              </button>
            </div>
          </div>

          {/* Event list */}
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {events.length === 0 ? (
              <div style={{ padding: '36px 16px', textAlign: 'center', color: '#bbb', fontSize: 13 }}>
                Aucune activité récente
              </div>
            ) : events.map((ev, i) => renderEvent(ev, i))}
          </div>

          {events.length > 0 && (
            <div style={{ padding: '9px 16px', borderTop: '1px solid #f0f0f0', background: '#fafafa', textAlign: 'center' }}>
              <span style={{ fontSize: 11, color: '#bbb' }}>
                {events.length} notification{events.length > 1 ? 's' : ''} · {events.length - unreadCount} lue{events.length - unreadCount !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
