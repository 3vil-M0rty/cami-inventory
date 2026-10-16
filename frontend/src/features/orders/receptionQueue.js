// Delivery notes waiting for reception, shared by the ACHATS badge, the banner and the
// « À réceptionner » tab: one request every minute (and when the window comes back), however
// many components listen. New BLs ring a desktop notification + a short chime on this computer.
import { useEffect, useState } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
const POLL_MS = 60 * 1000;
export const RECEIVING_ROLES = ['Magasinier', 'Laquage', 'Coordinateur-vitrage'];
// Admin receives aluminium / fer / tôles; the three roles receive their families
export const canReceiveBls = (user, can) => !!user && (can('admin.view') || RECEIVING_ROLES.includes(user.role));

let state = { items: [], count: 0, loaded: false };
const listeners = new Set();
let timer = null;
let inflight = null;
let userKey = '';
const baseTitle = typeof document !== 'undefined' ? document.title.replace(/^\(\d+\)\s*/, '') : '';

const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };

function chime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [[880, 0], [1320, 0.16]].forEach(([f, at]) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.35);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + 0.4);
    });
    setTimeout(() => ctx.close(), 1000);
  } catch (e) { }
}

export const blLink = (it) => `/commandes/${it.orderId}?receptionner=${encodeURIComponent(it.blNumber)}`;

// Opens the order page on that BL (reception window preselected), from anywhere in the app
export function goToBl(it) {
  window.history.pushState(null, '', blLink(it));
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function announce(fresh) {
  if (!fresh.length) return;
  chime();
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const first = fresh[0];
    const n = new Notification(fresh.length > 1 ? `${fresh.length} nouveaux BL à réceptionner` : 'Nouveau BL à réceptionner', {
      body: fresh.slice(0, 4).map(it => `${/^\s*b\.?\s*l\b/i.test(it.blNumber) ? it.blNumber : `BL ${it.blNumber}`} — ${it.supplier || '—'} (BC ${it.orderNumber || '—'})`).join('\n'),
      tag: 'cami-bl-to-receive',
      renotify: true,
    });
    n.onclick = () => { window.focus(); goToBl(first); n.close(); };
  } catch (e) { }
}

function publish(next) {
  state = next;
  listeners.forEach(fn => fn(state));
  if (typeof document !== 'undefined') document.title = state.count ? `(${state.count}) ${baseTitle}` : baseTitle;
}

export function refreshBls() {
  if (inflight) return inflight;
  inflight = axios.get(`${API_URL}/orders/bls-to-receive`)
    .then(r => {
      const items = r.data?.items || [];
      // What this computer already knew: anything else is new → notify
      const seenKey = `bls_seen_${userKey}`;
      const raw = lsGet(seenKey);
      const seen = new Set(raw ? JSON.parse(raw) : []);
      if (raw !== null) announce(items.filter(it => !seen.has(it.key)));
      lsSet(seenKey, JSON.stringify(items.map(it => it.key)));
      publish({ items, count: items.length, loaded: true });
    })
    .catch(() => { })
    .finally(() => { inflight = null; });
  return inflight;
}

const onWake = () => { if (document.visibilityState !== 'hidden') refreshBls(); };
function start() {
  if (timer) return;
  refreshBls();
  timer = setInterval(refreshBls, POLL_MS);
  window.addEventListener('focus', onWake);
  document.addEventListener('visibilitychange', onWake);
}
function stop() {
  clearInterval(timer); timer = null;
  window.removeEventListener('focus', onWake);
  document.removeEventListener('visibilitychange', onWake);
  publish({ items: [], count: 0, loaded: false });
}

// enabled: the account receives goods; key: the user (seen-list per user on a shared computer)
export function useBlsToReceive(enabled, key = '') {
  const [s, setS] = useState(state);
  useEffect(() => {
    if (!enabled) return undefined;
    if (userKey !== key) { userKey = key; if (timer) { stop(); } }
    listeners.add(setS);
    setS(state);
    start();
    return () => { listeners.delete(setS); if (!listeners.size) stop(); };
  }, [enabled, key]);
  return enabled ? s : { items: [], count: 0, loaded: false };
}
