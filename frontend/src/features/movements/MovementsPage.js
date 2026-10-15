import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import {
  ArrowDownToLine, ArrowUpFromLine, FolderOutput, FolderInput, PackageCheck, PackagePlus, ClipboardPlus, ClipboardMinus,
  History, CalendarClock, ScrollText, Boxes, Search, X, ExternalLink, FileSpreadsheet, RotateCw,
  AlertTriangle, Inbox, BarChart3, GitCompareArrows, User, ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { PAGE_PATHS, getQueryParam, updateQuery, setUrl } from '../../routes';
import WorkshopTab from './WorkshopTab';
import './Movements.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
const LOCALES = { fr: 'fr-FR', it: 'it-IT', en: 'en-GB' };
const TZ = () => new Date().getTimezoneOffset();

// Movement types: direction (+1 in / −1 out), icon, label key
const TYPES = {
  entree: { sign: 1, Icon: ArrowDownToLine, label: 'mxT_entree' },
  order_reception: { sign: 1, Icon: PackageCheck, label: 'mxT_order_reception' },
  project_return: { sign: 1, Icon: FolderInput, label: 'mxT_project_return' },
  initial: { sign: 1, Icon: PackagePlus, label: 'mxT_initial' },
  correction_plus: { sign: 1, Icon: ClipboardPlus, label: 'mxT_correction_plus' },
  sortie: { sign: -1, Icon: ArrowUpFromLine, label: 'mxT_sortie' },
  project_use: { sign: -1, Icon: FolderOutput, label: 'mxT_project_use' },
  correction_moins: { sign: -1, Icon: ClipboardMinus, label: 'mxT_correction_moins' },
};
const TYPE_ORDER = Object.keys(TYPES);
const TABS = [
  { key: 'journal', Icon: ScrollText, label: 'mxTabJournal' },
  { key: 'stock', Icon: CalendarClock, label: 'mxTabStock' },
  { key: 'fiche', Icon: History, label: 'mxTabLedger' },
  { key: 'ateliers', Icon: Boxes, label: 'mvTabWorkshop' },
];
const PERIODS = ['all', 'today', '7d', '30d', 'month', 'year', 'custom'];

// ── Formatting ───────────────────────────────────────────────────────────────
const ymd = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
function periodRange(p, from, to) {
  const today = new Date();
  if (p === 'today') return { from: ymd(today), to: ymd(today) };
  if (p === '7d') return { from: ymd(addDays(today, -6)), to: ymd(today) };
  if (p === '30d') return { from: ymd(addDays(today, -29)), to: ymd(today) };
  if (p === 'month') return { from: ymd(new Date(today.getFullYear(), today.getMonth(), 1)), to: ymd(today) };
  if (p === 'year') return { from: ymd(new Date(today.getFullYear(), 0, 1)), to: ymd(today) };
  if (p === 'custom') return { from: from || '', to: to || '' };
  return { from: '', to: '' };
}
function useFmt(lang) {
  return useMemo(() => {
    const loc = LOCALES[lang] || 'fr-FR';
    const nf = new Intl.NumberFormat(loc, { maximumFractionDigits: 3 });
    const sp = (s) => s.replace(/ /g, ' '); // the app font has no narrow no-break space
    const dt = new Intl.DateTimeFormat(loc, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const d = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', year: 'numeric' });
    const dShort = new Intl.DateTimeFormat(loc, { day: '2-digit', month: '2-digit' });
    const mShort = new Intl.DateTimeFormat(loc, { month: 'short', year: '2-digit', timeZone: 'UTC' });
    return {
      n: (v) => (v == null ? '—' : sp(nf.format(v))),
      signed: (v, sign) => `${sign > 0 ? '+' : '−'}${sp(nf.format(Math.abs(v)))}`,
      dt: (v) => (v ? dt.format(new Date(v)) : '—'),
      d: (v) => (v ? d.format(new Date(v.length === 10 ? `${v}T12:00:00` : v)) : '—'),
      bucket: (key, b) => (b === 'month' ? mShort.format(new Date(`${key}-01T00:00:00Z`)) : dShort.format(new Date(`${key}T12:00:00`))),
    };
  }, [lang]);
}
const nameOf = (item, lang) => item?.designation?.[lang] || item?.designation?.fr || '—';
const goTo = (path, query) => { setUrl(path, { query }); window.dispatchEvent(new PopStateEvent('popstate')); };

function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
}

function exportSheet(rows, sheet, file) {
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = Object.keys(rows[0] || {}).map(k => ({ wch: Math.max(10, Math.min(48, k.length + 4, ...rows.slice(0, 200).map(r => String(r[k] ?? '').length + 2))) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 31));
  XLSX.writeFile(wb, file);
}

// ── Small pieces ─────────────────────────────────────────────────────────────
function TypeBadge({ type, t }) {
  const meta = TYPES[type] || { sign: 0, Icon: ArrowUpDown, label: type };
  return (
    <span className={`mx-type mx-type--${meta.sign > 0 ? 'in' : meta.sign < 0 ? 'out' : 'na'}`}>
      <meta.Icon size={13} strokeWidth={2.2} /><span className="mx-type__txt">{t(meta.label)}</span>
    </span>
  );
}
function Qty({ m, f }) {
  return <span className={`mx-qty mx-qty--${m.sign > 0 ? 'in' : 'out'}`}>{f.signed(m.quantity, m.sign)}</span>;
}
function Empty({ icon: Icon = Inbox, children }) {
  return <div className="mx-empty"><Icon size={20} strokeWidth={1.8} />{children}</div>;
}
function Origin({ m, t }) {
  if (m.projectName) return <span className="mx-origin"><FolderOutput size={12} />{m.projectName}</span>;
  if (m.orderId) return <span className="mx-origin"><PackageCheck size={12} />{t('mxOrder')}{m.note ? ` · ${m.note}` : ''}</span>;
  return <span className="mx-origin mx-origin--note">{m.note || '—'}</span>;
}

function Periods({ value, from, to, onChange, t }) {
  return (
    <div className="mx-period">
      <select className="mx-select" value={value} onChange={e => onChange(e.target.value, from, to)} aria-label={t('mxPeriod')}>
        {PERIODS.map(p => <option key={p} value={p}>{t(`mxP_${p}`)}</option>)}
      </select>
      {value === 'custom' && (
        <>
          <input type="date" className="mx-input mx-input--date" value={from} max={to || undefined} onChange={e => onChange('custom', e.target.value, to)} aria-label={t('mxFrom')} />
          <span className="mx-period__sep">→</span>
          <input type="date" className="mx-input mx-input--date" value={to} min={from || undefined} onChange={e => onChange('custom', from, e.target.value)} aria-label={t('mxTo')} />
        </>
      )}
    </div>
  );
}

function SuperCatSelect({ value, onChange, superCats, lang, t }) {
  return (
    <select className="mx-select" value={value} onChange={e => onChange(e.target.value)} aria-label={t('mxSuperCat')}>
      <option value="all">{t('mxAllSuperCats')}</option>
      {superCats.map(sc => <option key={sc.key} value={sc.key}>{sc.label?.[lang] || sc.label?.fr || sc.key}</option>)}
    </select>
  );
}

// In / out activity: two thin columns per period, one shared axis
function ActivityChart({ data, bucket, f, t }) {
  const [tip, setTip] = useState(null);
  const max = Math.max(1, ...data.map(d => Math.max(d.in, d.out)));
  const every = Math.max(1, Math.ceil(data.length / 14));
  return (
    <div className="mx-activity">
      <ul className="mx-legend">
        <li><i className="mx-sw mx-sw--in" />{t('mxIn')}<strong>{f.n(data.reduce((s, d) => s + d.in, 0))}</strong></li>
        <li><i className="mx-sw mx-sw--out" />{t('mxOut')}<strong>{f.n(data.reduce((s, d) => s + d.out, 0))}</strong></li>
        <li className="mx-legend__note">{t('mxActivityNote', { b: t(`mxB_${bucket}`) })}</li>
      </ul>
      <div className="mx-bars" onPointerLeave={() => setTip(null)}>
        {data.map((d, i) => (
          <div key={d.key} className="mx-bars__col" onPointerEnter={() => setTip(i)} tabIndex={0} onFocus={() => setTip(i)} onBlur={() => setTip(null)}>
            <div className="mx-bars__pair">
              <span className="mx-bars__bar mx-bars__bar--in" style={{ height: `${(d.in / max) * 100}%` }} />
              <span className="mx-bars__bar mx-bars__bar--out" style={{ height: `${(d.out / max) * 100}%` }} />
            </div>
            <span className="mx-bars__lab">{i % every === 0 ? f.bucket(d.key, bucket) : ''}</span>
            {tip === i && (
              <div className={`mx-tip${i > data.length / 2 ? ' mx-tip--left' : ''}`}>
                <div className="mx-tip__title">{f.bucket(d.key, bucket)}</div>
                <div><i className="mx-sw mx-sw--in" /><strong>{d.in}</strong> {t('mxIn')}</div>
                <div><i className="mx-sw mx-sw--out" /><strong>{d.out}</strong> {t('mxOut')}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══ JOURNAL ════════════════════════════════════════════════════════════════
function Journal({ t, lang, f, superCats, onOpenItem, reloadKey }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim());
  const [period, setPeriod] = useState('30d');
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [types, setTypes] = useState([]);
  const [sc, setSc] = useState('all');
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null); // total, byType, activity
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const [showChart, setShowChart] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [open, setOpen] = useState(null);
  const req = useRef(0);
  const sentinel = useRef(null);

  const range = periodRange(period, from, to);
  const params = useMemo(() => ({
    q: dq || undefined, type: types.length ? types.join(',') : undefined, superCategory: sc !== 'all' ? sc : undefined,
    from: range.from || undefined, to: range.to || undefined, tz: TZ(),
  }), [dq, types, sc, range.from, range.to]);

  // First page: whenever a filter changes (the search is sent to the server, never filtered here)
  useEffect(() => {
    const id = ++req.current;
    setLoading(true); setError('');
    axios.get(`${API}/movements`, { params: { ...params, limit: 50 } })
      .then(res => {
        if (id !== req.current) return;
        setRows(res.data.movements); setCursor(res.data.nextCursor); setMeta({ total: res.data.total, byType: res.data.byType || {}, activity: res.data.activity });
      })
      .catch(e => { if (id === req.current) setError(e.response?.data?.error || e.message); })
      .finally(() => { if (id === req.current) setLoading(false); });
  }, [params, reloadKey]);

  // Next page: same filters + the cursor
  const loadMore = useCallback(async () => {
    if (!cursor || more) return;
    const id = req.current;
    setMore(true);
    try {
      const res = await axios.get(`${API}/movements`, { params: { ...params, limit: 50, cursor } });
      if (id !== req.current) return;
      setRows(prev => [...prev, ...res.data.movements]); setCursor(res.data.nextCursor);
    } catch (e) { setError(e.response?.data?.error || e.message); }
    finally { setMore(false); }
  }, [cursor, more, params]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !cursor) return undefined;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) loadMore(); }, { rootMargin: '400px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [cursor, loadMore]);

  const toggleType = (k) => setTypes(prev => (prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]));
  const filtersOn = dq || types.length || sc !== 'all' || period !== '30d';
  const reset = () => { setQ(''); setTypes([]); setSc('all'); setPeriod('30d'); setFrom(''); setTo(''); };

  const doExport = async () => {
    setExporting(true);
    try {
      const res = await axios.get(`${API}/movements`, { params: { ...params, export: '1' } });
      const data = res.data.movements.map(m => ({
        [t('mxColDate')]: f.dt(m.createdAt), [t('mxColCode')]: m.item?.code || '', [t('mxColItem')]: nameOf(m.item, lang),
        [t('mxColType')]: t(TYPES[m.type]?.label || m.type), [t('mxColQty')]: m.sign * m.quantity, [t('mxColAfter')]: m.balanceAfter,
        [t('mxColProject')]: m.projectName, [t('mxColNote')]: m.note, [t('mxColUser')]: m.user,
      }));
      if (data.length) exportSheet(data, t('mxTabJournal'), `mouvements_${range.from || 'debut'}_${range.to || ymd(new Date())}.xlsx`);
    } catch (e) { setError(e.response?.data?.error || e.message); }
    finally { setExporting(false); }
  };

  return (
    <>
      <div className="mx-filters">
        <div className="mx-search">
          <Search size={15} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('mxSearchJournal')} aria-label={t('mxSearchJournal')} />
          {q && <button type="button" className="mx-search__clear" onClick={() => setQ('')} aria-label={t('mxClear')}><X size={14} /></button>}
        </div>
        <Periods value={period} from={from} to={to} t={t} onChange={(p, a, b) => { setPeriod(p); setFrom(a || ''); setTo(b || ''); }} />
        <SuperCatSelect value={sc} onChange={setSc} superCats={superCats} lang={lang} t={t} />
        {filtersOn ? <button type="button" className="mx-btn mx-btn--ghost" onClick={reset}><X size={14} />{t('mxClear')}</button> : null}
        <div className="mx-filters__end">
          <button type="button" className={`mx-btn${showChart ? ' is-on' : ''}`} onClick={() => setShowChart(v => !v)}><BarChart3 size={14} />{t('mxActivity')}</button>
          <button type="button" className="mx-btn" onClick={doExport} disabled={exporting || !meta?.total}><FileSpreadsheet size={14} />{exporting ? t('mxExporting') : t('mxExport')}</button>
        </div>
      </div>

      {/* Types: the counts are for the whole filter (not only the loaded rows) — click to filter */}
      <div className="mx-types">
        {TYPE_ORDER.map(k => {
          const n = meta?.byType?.[k] || 0;
          const on = types.includes(k);
          if (!n && !on) return null;
          const M = TYPES[k];
          return (
            <button key={k} type="button" className={`mx-tchip mx-tchip--${M.sign > 0 ? 'in' : 'out'}${on ? ' is-on' : ''}`} onClick={() => toggleType(k)} aria-pressed={on}>
              <M.Icon size={13} />{t(M.label)}<strong>{f.n(n)}</strong>
            </button>
          );
        })}
      </div>

      {showChart && meta?.activity && <div className="mx-card mx-card--pad"><ActivityChart data={meta.activity.series} bucket={meta.activity.bucket} f={f} t={t} /></div>}

      {error && <div className="mx-error"><AlertTriangle size={14} />{error}</div>}

      <div className={`mx-card${loading ? ' is-loading' : ''}`}>
        <div className="mx-card__head">
          <strong>{meta ? t('mxCount', { n: f.n(meta.total) }) : '—'}</strong>
          {meta && meta.total > 0 && <span>{t('mxShown', { n: f.n(rows.length), total: f.n(meta.total) })}</span>}
        </div>
        {loading && !rows.length ? <Empty icon={RotateCw}>{t('loadingShort')}</Empty>
          : !rows.length ? <Empty>{t('mxNoMovements')}</Empty> : (
            <div className="mx-table-wrap">
              <table className="mx-table">
                <thead><tr>
                  <th className="hide-sm">{t('mxColDate')}</th><th>{t('mxColItem')}</th><th>{t('mxColType')}</th>
                  <th className="num">{t('mxColQty')}</th><th className="num">{t('mxColAfter')}</th>
                  <th className="hide-md">{t('mxColOrigin')}</th><th className="hide-md">{t('mxColUser')}</th>
                </tr></thead>
                <tbody>
                  {rows.map(m => (
                    <tr key={m.id} className="is-link" tabIndex={0} onClick={() => setOpen(m)} onKeyDown={e => { if (e.key === 'Enter') setOpen(m); }}>
                      <td className="mx-nowrap mx-muted hide-sm">{f.dt(m.createdAt)}</td>
                      <td>
                        <div className="mx-item">
                          {m.item?.code && <span className="mx-code">{m.item.code}</span>}
                          <span className="mx-item__name">{m.item ? nameOf(m.item, lang) : t('mxDeletedItem')}</span>
                        </div>
                        <div className="mx-sub show-sm">{f.dt(m.createdAt)}</div>
                      </td>
                      <td><TypeBadge type={m.type} t={t} /></td>
                      <td className="num"><Qty m={m} f={f} /></td>
                      <td className="num"><strong>{f.n(m.balanceAfter)}</strong></td>
                      <td className="hide-md"><Origin m={m} t={t} /></td>
                      <td className="hide-md mx-muted">{m.user || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div ref={sentinel} className="mx-more">
                {cursor
                  ? <button type="button" className="mx-btn" onClick={loadMore} disabled={more}>{more ? t('loadingShort') : t('mxLoadMore')}</button>
                  : rows.length > 20 ? <span>{t('mxAllShown')}</span> : null}
              </div>
            </div>
          )}
      </div>

      {open && <MovementDrawer m={open} t={t} lang={lang} f={f} onClose={() => setOpen(null)} onOpenItem={(id) => { setOpen(null); onOpenItem(id); }} />}
    </>
  );
}

function MovementDrawer({ m, t, lang, f, onClose, onOpenItem }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const before = m.balanceAfter - m.sign * m.quantity;
  return (
    <div className="mx-overlay" onClick={onClose}>
      <aside className="mx-drawer" onClick={e => e.stopPropagation()} role="dialog" aria-label={t('mxDetail')}>
        <header className="mx-drawer__head">
          <TypeBadge type={m.type} t={t} />
          <button type="button" className="mx-icon" onClick={onClose} aria-label={t('close')}><X size={16} /></button>
        </header>
        <h3 className="mx-drawer__title">{m.item ? nameOf(m.item, lang) : t('mxDeletedItem')}</h3>
        {m.item?.code && <div className="mx-code mx-code--lg">{m.item.code}</div>}
        <div className="mx-flow">
          <div><span>{t('mxBefore')}</span><strong>{f.n(Math.round(before * 1000) / 1000)}</strong></div>
          <div className={`mx-flow__delta mx-qty--${m.sign > 0 ? 'in' : 'out'}`}>{m.sign > 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}{f.signed(m.quantity, m.sign)}</div>
          <div><span>{t('mxColAfter')}</span><strong>{f.n(m.balanceAfter)}</strong></div>
        </div>
        <dl className="mx-dl">
          <dt>{t('mxColDate')}</dt><dd>{f.dt(m.createdAt)}</dd>
          <dt>{t('mxColUser')}</dt><dd>{m.user ? <><User size={13} /> {m.user}</> : <span className="mx-muted">{t('mxUnknownUser')}</span>}</dd>
          {m.projectName && <><dt>{t('mxColProject')}</dt><dd>{m.projectName}</dd></>}
          {m.note && <><dt>{t('mxColNote')}</dt><dd>{m.note}</dd></>}
        </dl>
        <div className="mx-drawer__actions">
          {m.item && <button type="button" className="mx-btn" onClick={() => onOpenItem(m.item.id)}><History size={14} />{t('mxOpenLedger')}</button>}
          {m.projectId && <button type="button" className="mx-btn" onClick={() => goTo(`${PAGE_PATHS.projects}/${m.projectId}`)}><ExternalLink size={14} />{t('mxOpenProject')}</button>}
          {m.orderId && <button type="button" className="mx-btn" onClick={() => goTo(`${PAGE_PATHS.orders}/${m.orderId}`)}><ExternalLink size={14} />{t('mxOpenOrder')}</button>}
        </div>
      </aside>
    </div>
  );
}

// ═══ STOCK AT A DATE ═══════════════════════════════════════════════════════
function StockAtDate({ t, lang, f, superCats, onOpenItem, reloadKey }) {
  const today = ymd(new Date());
  const [date, setDate] = useState(() => getQueryParam('date') || today);
  const [compareOn, setCompareOn] = useState(() => !!getQueryParam('compare'));
  const [compare, setCompare] = useState(() => getQueryParam('compare') || ymd(addDays(new Date(), -30)));
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim());
  const [sc, setSc] = useState('all');
  const [cat, setCat] = useState('all');
  const [cats, setCats] = useState([]);
  const [hideZero, setHideZero] = useState(false);
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [sort, setSort] = useState({ key: 'name', dir: 1 });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [limit, setLimit] = useState(200);
  const req = useRef(0);

  useEffect(() => { updateQuery({ date: date === today ? null : date, compare: compareOn ? compare : null }); }, [date, compare, compareOn, today]);
  useEffect(() => {
    setCat('all');
    if (sc === 'all') { setCats([]); return; }
    axios.get(`${API}/categories`, { params: { superCategory: sc } }).then(r => setCats(r.data || [])).catch(() => setCats([]));
  }, [sc]);
  useEffect(() => {
    const id = ++req.current;
    setLoading(true); setError('');
    axios.get(`${API}/movements/snapshot`, { params: { date, compare: compareOn ? compare : undefined, q: dq || undefined, superCategory: sc !== 'all' ? sc : undefined, categoryId: cat !== 'all' ? cat : undefined, tz: TZ() } })
      .then(r => { if (id === req.current) { setData(r.data); setLimit(200); } })
      .catch(e => { if (id === req.current) setError(e.response?.data?.error || e.message); })
      .finally(() => { if (id === req.current) setLoading(false); });
  }, [date, compare, compareOn, dq, sc, cat, reloadKey]);

  const rows = useMemo(() => {
    if (!data) return [];
    let r = data.rows.filter(x => x.atDate !== null); // articles created after the date are not part of that stock
    if (hideZero) r = r.filter(x => x.atDate > 0 || (compareOn && x.atCompare > 0));
    if (compareOn && onlyChanged) r = r.filter(x => (x.atDate ?? 0) !== (x.atCompare ?? 0));
    const val = (x) => {
      if (sort.key === 'name') return nameOf(x, lang).toLowerCase();
      if (sort.key === 'diff') return (x.atDate ?? 0) - (x.atCompare ?? 0);
      return x[sort.key] ?? -Infinity;
    };
    return [...r].sort((a, b) => { const va = val(a), vb = val(b); return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir; });
  }, [data, hideZero, onlyChanged, compareOn, sort, lang]);

  const stats = useMemo(() => {
    const all = (data?.rows || []).filter(x => x.atDate !== null);
    return {
      items: all.length,
      inStock: all.filter(x => x.atDate > 0).length,
      out: all.filter(x => x.atDate <= 0).length,
      low: all.filter(x => x.threshold > 0 && x.atDate > 0 && x.atDate < x.threshold).length,
      up: compareOn ? all.filter(x => (x.atDate ?? 0) > (x.atCompare ?? 0)).length : 0,
      down: compareOn ? all.filter(x => (x.atDate ?? 0) < (x.atCompare ?? 0)).length : 0,
      untracked: all.filter(x => x.untracked).length,
    };
  }, [data, compareOn]);

  const th = (key, label, num) => (
    <th className={`${num ? 'num ' : ''}mx-sort${sort.key === key ? ' is-on' : ''}`} onClick={() => setSort(s => ({ key, dir: s.key === key ? -s.dir : (key === 'name' ? 1 : -1) }))}
      aria-sort={sort.key === key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
      {label}{sort.key === key && (sort.dir > 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
    </th>
  );
  const scName = (k) => { const s = superCats.find(x => x.key === k); return s?.label?.[lang] || s?.label?.fr || k; };

  const doExport = () => {
    const data2 = rows.map(x => ({
      [t('mxColCode')]: x.code, [t('mxColItem')]: nameOf(x, lang), [t('mxSuperCat')]: scName(x.superCategory),
      [t('mxColCategory')]: x.category ? (x.category.name?.[lang] || x.category.name?.fr) : '',
      [t('mxStockOn', { d: f.d(date) })]: x.atDate,
      ...(compareOn ? { [t('mxStockOn', { d: f.d(compare) })]: x.atCompare ?? '', [t('mxColDiff')]: (x.atDate ?? 0) - (x.atCompare ?? 0) } : {}),
      [t('mxColThreshold')]: x.threshold, [t('mxColCurrent')]: x.current,
    }));
    if (data2.length) exportSheet(data2, t('mxTabStock'), `stock_${date}${compareOn ? `_vs_${compare}` : ''}.xlsx`);
  };

  return (
    <>
      <div className="mx-filters">
        <label className="mx-field">
          <span>{t('mxStockDate')}</span>
          <input type="date" className="mx-input mx-input--date" value={date} max={today} onChange={e => setDate(e.target.value || today)} />
        </label>
        <button type="button" className={`mx-btn${compareOn ? ' is-on' : ''}`} onClick={() => setCompareOn(v => !v)} aria-pressed={compareOn}>
          <GitCompareArrows size={14} />{t('mxCompare')}
        </button>
        {compareOn && (
          <label className="mx-field">
            <span>{t('mxCompareWith')}</span>
            <input type="date" className="mx-input mx-input--date" value={compare} max={today} onChange={e => setCompare(e.target.value || compare)} />
          </label>
        )}
        <div className="mx-quick">
          {[['mxQ_today', 0], ['mxQ_monthEnd', 'm'], ['mxQ_yearEnd', 'y']].map(([k, v]) => {
            const d = v === 0 ? today : v === 'm' ? ymd(new Date(new Date().getFullYear(), new Date().getMonth(), 0)) : ymd(new Date(new Date().getFullYear() - 1, 11, 31));
            return <button key={k} type="button" className={`mx-chipbtn${date === d ? ' is-on' : ''}`} onClick={() => setDate(d)}>{t(k)}</button>;
          })}
        </div>
      </div>
      <div className="mx-filters">
        <div className="mx-search">
          <Search size={15} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('mxSearchItem')} aria-label={t('mxSearchItem')} />
          {q && <button type="button" className="mx-search__clear" onClick={() => setQ('')} aria-label={t('mxClear')}><X size={14} /></button>}
        </div>
        <SuperCatSelect value={sc} onChange={setSc} superCats={superCats} lang={lang} t={t} />
        {cats.length > 0 && (
          <select className="mx-select" value={cat} onChange={e => setCat(e.target.value)} aria-label={t('mxColCategory')}>
            <option value="all">{t('mxAllCats')}</option>
            {cats.map(c => <option key={c.id || c._id} value={c.id || c._id}>{c.name?.[lang] || c.name?.fr}</option>)}
          </select>
        )}
        <label className="mx-check"><input type="checkbox" checked={hideZero} onChange={e => setHideZero(e.target.checked)} />{t('mxHideZero')}</label>
        {compareOn && <label className="mx-check"><input type="checkbox" checked={onlyChanged} onChange={e => setOnlyChanged(e.target.checked)} />{t('mxOnlyChanged')}</label>}
        <div className="mx-filters__end">
          <button type="button" className="mx-btn" onClick={doExport} disabled={!rows.length}><FileSpreadsheet size={14} />{t('mxExport')}</button>
        </div>
      </div>

      <div className="mx-stats">
        <div className="mx-stat"><span>{t('mxStItems')}</span><strong>{f.n(stats.items)}</strong></div>
        <div className="mx-stat"><span>{t('mxStInStock')}</span><strong>{f.n(stats.inStock)}</strong></div>
        <div className="mx-stat mx-stat--warn"><span>{t('mxStLow')}</span><strong>{f.n(stats.low)}</strong></div>
        <div className="mx-stat mx-stat--bad"><span>{t('mxStOut')}</span><strong>{f.n(stats.out)}</strong></div>
        {compareOn && <div className="mx-stat"><span>{t('mxStUp')}</span><strong className="mx-qty--in">{f.n(stats.up)}</strong></div>}
        {compareOn && <div className="mx-stat"><span>{t('mxStDown')}</span><strong className="mx-qty--out">{f.n(stats.down)}</strong></div>}
      </div>

      {error && <div className="mx-error"><AlertTriangle size={14} />{error}</div>}

      <div className={`mx-card${loading ? ' is-loading' : ''}`}>
        <div className="mx-card__head">
          <strong>{t('mxStockTitle', { d: f.d(date) })}</strong>
          <span>{t('mxArticles', { n: f.n(rows.length) })}</span>
        </div>
        {loading && !data ? <Empty icon={RotateCw}>{t('loadingShort')}</Empty> : !rows.length ? <Empty>{t('mxNoItems')}</Empty> : (
          <div className="mx-table-wrap">
            <table className="mx-table">
              <thead><tr>
                {th('name', t('mxColItem'))}
                <th className="hide-md">{t('mxColCategory')}</th>
                {th('atDate', t('mxStockOn', { d: f.d(date) }), true)}
                {compareOn && th('atCompare', t('mxStockOn', { d: f.d(compare) }), true)}
                {compareOn && th('diff', t('mxColDiff'), true)}
                {th('threshold', t('mxColThreshold'), true)}
                {th('current', t('mxColCurrent'), true)}
              </tr></thead>
              <tbody>
                {rows.slice(0, limit).map(x => {
                  const diff = (x.atDate ?? 0) - (x.atCompare ?? 0);
                  const low = x.threshold > 0 && x.atDate < x.threshold;
                  return (
                    <tr key={x.id} className="is-link" tabIndex={0} onClick={() => onOpenItem(x.id, compareOn ? [compare < date ? compare : date, compare < date ? date : compare] : [ymd(addDays(new Date(`${date}T12:00:00`), -30)), date])}
                      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.click(); }}>
                      <td>
                        <div className="mx-item">
                          {x.code && <span className="mx-code">{x.code}</span>}
                          <span className="mx-item__name">{nameOf(x, lang)}</span>
                          {x.untracked && <span className="mx-warn" title={t('mxUntrackedTip')}><AlertTriangle size={13} /></span>}
                        </div>
                      </td>
                      <td className="hide-md mx-muted">
                        {scName(x.superCategory)}{x.category && <> › {x.category.name?.[lang] || x.category.name?.fr}</>}
                      </td>
                      <td className={`num${x.atDate <= 0 ? ' mx-zero' : low ? ' mx-low' : ''}`}><strong>{f.n(x.atDate)}</strong></td>
                      {compareOn && <td className="num mx-muted">{x.atCompare === null ? '—' : f.n(x.atCompare)}</td>}
                      {compareOn && <td className="num">{diff === 0 ? <span className="mx-muted">0</span> : <span className={`mx-qty mx-qty--${diff > 0 ? 'in' : 'out'}`}>{f.signed(diff, diff > 0 ? 1 : -1)}</span>}</td>}
                      <td className="num mx-muted">{f.n(x.threshold)}</td>
                      <td className="num">{f.n(x.current)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length > limit && <div className="mx-more"><button type="button" className="mx-btn" onClick={() => setLimit(l => l + 300)}>{t('mxShowMore', { n: f.n(rows.length - limit) })}</button></div>}
          </div>
        )}
      </div>
      <p className="mx-note">
        {t('mxStockNote')}
        {stats.untracked > 0 && <> <AlertTriangle size={12} /> {t('mxUntrackedCount', { n: stats.untracked })}</>}
      </p>
    </>
  );
}

// ═══ ARTICLE LEDGER ═════════════════════════════════════════════════════════
function ItemPicker({ t, lang, onPick }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 250);
  const [res, setRes] = useState([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (dq.length < 2) { setRes([]); return; }
    let live = true;
    axios.get(`${API}/inventory/lookup`, { params: { q: dq, limit: 12 } }).then(r => { if (live) setRes(r.data.items || []); }).catch(() => {});
    return () => { live = false; };
  }, [dq]);
  return (
    <div className="mx-picker">
      <div className="mx-search mx-search--lg">
        <Search size={16} />
        <input value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder={t('mxPickItem')} aria-label={t('mxPickItem')} />
      </div>
      {open && res.length > 0 && (
        <ul className="mx-picker__list" role="listbox">
          {res.map(it => (
            <li key={it.id}>
              <button type="button" onClick={() => { onPick(it.id); setOpen(false); setQ(''); }}>
                {it.codeInterne && <span className="mx-code">{it.codeInterne}</span>}
                <span className="mx-item__name">{nameOf(it, lang)}</span>
                <span className="mx-muted">{f2(it.quantity)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
const f2 = (v) => (v == null ? '' : String(Math.round(v * 1000) / 1000));

// Stock level over the period: one step line (the stock holds until the next movement), threshold as a reference
function StockChart({ points, threshold, from, to, f, t }) {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  const [hover, setHover] = useState(null);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const H = 220, padL = 44, padR = 12, padT = 12, padB = 26;
  const t0 = from.getTime(), t1 = Math.max(to.getTime(), t0 + 1);
  const maxV = Math.max(1, threshold || 0, ...points.map(p => p.v)) * 1.1;
  const x = (tt) => padL + ((tt - t0) / (t1 - t0)) * (w - padL - padR);
  const y = (v) => padT + (1 - v / maxV) * (H - padT - padB);
  let d = '';
  points.forEach((p, i) => { const px = x(p.t), py = y(p.v); d += i === 0 ? `M${px},${py}` : ` H${px} V${py}`; });
  if (points.length) d += ` H${x(t1)}`;
  const ticks = [0, maxV / 2, maxV].map(v => Math.round(v));
  const nearest = (clientX) => {
    const r = ref.current.getBoundingClientRect();
    const tt = t0 + ((clientX - r.left - padL) / (w - padL - padR)) * (t1 - t0);
    let best = 0;
    points.forEach((p, i) => { if (p.t <= tt) best = i; });
    setHover(best);
  };
  return (
    <div ref={ref} className="mx-chart" style={{ height: H }} onPointerMove={e => points.length && nearest(e.clientX)} onPointerLeave={() => setHover(null)}>
      {w > 0 && (
        <svg width={w} height={H} role="img" aria-label={t('mxChartAria')}>
          {ticks.map((v, i) => (
            <g key={i}>
              <line x1={padL} x2={w - padR} y1={y(v)} y2={y(v)} className={i === 0 ? 'mx-axis' : 'mx-grid'} />
              <text x={padL - 8} y={y(v)} className="mx-tick" textAnchor="end" dominantBaseline="middle">{f.n(v)}</text>
            </g>
          ))}
          {threshold > 0 && (
            <g>
              <line x1={padL} x2={w - padR} y1={y(threshold)} y2={y(threshold)} className="mx-threshold" />
              <text x={w - padR} y={y(threshold) - 5} className="mx-tick" textAnchor="end">{t('mxColThreshold')} {f.n(threshold)}</text>
            </g>
          )}
          <path d={`${d} V${y(0)} H${x(points[0]?.t ?? t0)} Z`} className="mx-area" />
          <path d={d} className="mx-line" />
          <text x={padL} y={H - 6} className="mx-tick">{f.d(from)}</text>
          <text x={w - padR} y={H - 6} className="mx-tick" textAnchor="end">{f.d(to)}</text>
          {hover != null && points[hover] && (
            <g>
              <line x1={x(points[hover].t)} x2={x(points[hover].t)} y1={padT} y2={H - padB} className="mx-cross" />
              <circle cx={x(points[hover].t)} cy={y(points[hover].v)} r="4.5" className="mx-dot" />
            </g>
          )}
        </svg>
      )}
      {hover != null && points[hover] && (
        <div className="mx-tip mx-tip--chart" style={{ left: Math.min(x(points[hover].t) + 12, w - 190) }}>
          <div className="mx-tip__title">{points[hover].label}</div>
          <div><strong>{f.n(points[hover].v)}</strong> {t('mxInStockShort')}</div>
        </div>
      )}
    </div>
  );
}

function Ledger({ t, lang, f, itemId, initialRange, onPick, reloadKey }) {
  const [period, setPeriod] = useState(initialRange ? 'custom' : '30d');
  const [from, setFrom] = useState(initialRange?.[0] || ''); const [to, setTo] = useState(initialRange?.[1] || '');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (initialRange) { setPeriod('custom'); setFrom(initialRange[0]); setTo(initialRange[1]); } }, [initialRange]);
  const range = periodRange(period, from, to);
  useEffect(() => {
    if (!itemId) { setData(null); return; }
    let live = true;
    setLoading(true); setError('');
    axios.get(`${API}/movements/item/${itemId}`, { params: { from: range.from || undefined, to: range.to || undefined, tz: TZ() } })
      .then(r => { if (live) setData(r.data); })
      .catch(e => { if (live) { setError(e.response?.data?.error || e.message); setData(null); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [itemId, range.from, range.to, reloadKey]);

  const chart = useMemo(() => {
    if (!data) return null;
    const ms = data.movements;
    const start = range.from ? new Date(`${range.from}T00:00:00`) : (ms[0] ? new Date(ms[0].createdAt) : new Date(data.item.createdAt));
    const end = range.to ? new Date(`${range.to}T23:59:59`) : new Date();
    const pts = [{ t: start.getTime(), v: data.opening, label: `${f.d(start)} — ${t('mxOpening')}` }];
    ms.forEach(m => pts.push({ t: new Date(m.createdAt).getTime(), v: m.balanceAfter, label: `${f.dt(m.createdAt)} · ${t(TYPES[m.type]?.label || m.type)} ${f.signed(m.quantity, m.sign)}` }));
    return { pts, start, end: new Date(Math.min(end.getTime(), Date.now())) };
  }, [data, range.from, range.to, f, t]);

  const doExport = () => {
    if (!data) return;
    const rows = [
      { [t('mxColDate')]: range.from ? f.d(range.from) : '', [t('mxColType')]: t('mxOpening'), [t('mxColQty')]: '', [t('mxColAfter')]: data.opening },
      ...data.movements.map(m => ({ [t('mxColDate')]: f.dt(m.createdAt), [t('mxColType')]: t(TYPES[m.type]?.label || m.type), [t('mxColQty')]: m.sign * m.quantity, [t('mxColAfter')]: m.balanceAfter, [t('mxColProject')]: m.projectName, [t('mxColNote')]: m.note, [t('mxColUser')]: m.user })),
    ];
    exportSheet(rows, t('mxTabLedger'), `fiche_${data.item.code || 'article'}_${range.from || 'debut'}_${range.to || ymd(new Date())}.xlsx`);
  };

  return (
    <>
      <div className="mx-filters">
        <ItemPicker t={t} lang={lang} onPick={onPick} />
        <Periods value={period} from={from} to={to} t={t} onChange={(p, a, b) => { setPeriod(p); setFrom(a || ''); setTo(b || ''); }} />
        {data && <div className="mx-filters__end"><button type="button" className="mx-btn" onClick={doExport}><FileSpreadsheet size={14} />{t('mxExport')}</button></div>}
      </div>
      {error && <div className="mx-error"><AlertTriangle size={14} />{error}</div>}
      {!itemId ? <div className="mx-card"><Empty icon={History}>{t('mxPickHint')}</Empty></div> : !data ? (
        <div className="mx-card"><Empty icon={RotateCw}>{loading ? t('loadingShort') : '—'}</Empty></div>
      ) : (
        <div className={loading ? 'is-loading' : ''}>
          <div className="mx-card mx-card--pad mx-art">
            <div className="mx-art__id">
              {data.item.image
                ? <img src={data.item.image} alt="" onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'inline-flex'; }} />
                : null}
              <span className="mx-art__ph" style={{ display: data.item.image ? 'none' : 'inline-flex' }}><Boxes size={20} /></span>
              <div>
                <h3>{nameOf(data.item, lang)}</h3>
                <div className="mx-muted">
                  {data.item.code && <span className="mx-code">{data.item.code}</span>}
                  {data.item.category ? (data.item.category.name?.[lang] || data.item.category.name?.fr) : data.item.superCategory}
                </div>
              </div>
            </div>
            <div className="mx-art__now">
              <div><span>{t('mxColCurrent')}</span><strong>{f.n(data.item.quantity)}</strong></div>
              <div><span>{t('mxColThreshold')}</span><strong>{f.n(data.item.threshold)}</strong></div>
              <div><span>{t('mxOrdered')}</span><strong>{f.n(data.item.ordered)}</strong></div>
            </div>
          </div>
          <div className="mx-stats">
            <div className="mx-stat"><span>{t('mxOpening')}</span><strong>{f.n(data.opening)}</strong></div>
            <div className="mx-stat"><span>{t('mxIn')}</span><strong className="mx-qty--in">{f.signed(data.totalIn, 1)}</strong></div>
            <div className="mx-stat"><span>{t('mxOut')}</span><strong className="mx-qty--out">{f.signed(data.totalOut, -1)}</strong></div>
            <div className="mx-stat"><span>{t('mxClosing')}</span><strong>{f.n(data.closing)}</strong></div>
            <div className="mx-stat"><span>{t('mxMovements')}</span><strong>{f.n(data.movements.length)}</strong></div>
          </div>
          {data.untracked && <div className="mx-error mx-error--warn"><AlertTriangle size={14} />{t('mxUntrackedTip')}</div>}
          <div className="mx-card mx-card--pad">
            <div className="mx-card__head mx-card__head--flat"><strong>{t('mxChartTitle')}</strong><span>{range.from ? `${f.d(range.from)} → ${f.d(range.to || ymd(new Date()))}` : t('mxP_all')}</span></div>
            {chart && <StockChart points={chart.pts} threshold={data.item.threshold} from={chart.start} to={chart.end} f={f} t={t} />}
          </div>
          <div className="mx-card">
            <div className="mx-card__head"><strong>{t('mxLedgerTitle')}</strong><span>{t('mxCount', { n: f.n(data.movements.length) })}</span></div>
            {!data.movements.length ? <Empty>{t('mxNoMovementsItem')}</Empty> : (
              <div className="mx-table-wrap">
                <table className="mx-table">
                  <thead><tr><th>{t('mxColDate')}</th><th>{t('mxColType')}</th><th className="num">{t('mxColQty')}</th><th className="num">{t('mxColAfter')}</th><th className="hide-md">{t('mxColOrigin')}</th><th className="hide-md">{t('mxColUser')}</th></tr></thead>
                  <tbody>
                    {[...data.movements].reverse().map(m => (
                      <tr key={m.id}>
                        <td className="mx-nowrap mx-muted">{f.dt(m.createdAt)}</td>
                        <td><TypeBadge type={m.type} t={t} /></td>
                        <td className="num"><Qty m={m} f={f} /></td>
                        <td className="num"><strong>{f.n(m.balanceAfter)}</strong></td>
                        <td className="hide-md"><Origin m={m} t={t} /></td>
                        <td className="hide-md mx-muted">{m.user || '—'}</td>
                      </tr>
                    ))}
                    <tr className="mx-row-open"><td colSpan={3}>{t('mxOpening')}{range.from ? ` — ${f.d(range.from)}` : ''}</td><td className="num"><strong>{f.n(data.opening)}</strong></td><td className="hide-md" colSpan={2} /></tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
export default function MovementsPage() {
  const { t, currentLanguage: lang } = useLanguage();
  const f = useFmt(lang);
  const [tab, setTab] = useState(() => { const o = getQueryParam('onglet'); return TABS.some(x => x.key === o) ? o : 'journal'; });
  const [itemId, setItemId] = useState(() => getQueryParam('article') || null);
  const [ledgerRange, setLedgerRange] = useState(null);
  const [superCats, setSuperCats] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => { axios.get(`${API}/super-categories`).then(r => setSuperCats(r.data || [])).catch(() => {}); }, []);
  // Tab and article in the URL: a refresh stays on the same view
  const changeTab = (k) => { setTab(k); updateQuery({ onglet: k === 'journal' ? null : k, article: k === 'fiche' ? itemId : null, date: null, compare: null }); };
  const openItem = (id, range = null) => {
    setItemId(id); setLedgerRange(range); setTab('fiche');
    updateQuery({ onglet: 'fiche', article: id, date: null, compare: null }, { replace: false });
  };

  return (
    <div className="mx">
      <div className="mx-head">
        <div>
          <h1 className="mx-head__title">{t('mxTitle')}</h1>
          <div className="mx-head__sub">{t('mxSubtitle')}</div>
        </div>
        <button type="button" className="mx-btn" onClick={() => setReloadKey(k => k + 1)}><RotateCw size={14} />{t('refresh')}</button>
      </div>

      <div className="mx-tabs" role="tablist">
        {TABS.map(x => (
          <button key={x.key} type="button" role="tab" aria-selected={tab === x.key} className={`mx-tab${tab === x.key ? ' is-on' : ''}`} onClick={() => changeTab(x.key)}>
            <x.Icon size={15} />{t(x.label)}
          </button>
        ))}
      </div>

      {tab === 'journal' && <Journal t={t} lang={lang} f={f} superCats={superCats} onOpenItem={(id) => openItem(id)} reloadKey={reloadKey} />}
      {tab === 'stock' && <StockAtDate t={t} lang={lang} f={f} superCats={superCats} onOpenItem={openItem} reloadKey={reloadKey} />}
      {tab === 'fiche' && <Ledger t={t} lang={lang} f={f} itemId={itemId} initialRange={ledgerRange} reloadKey={reloadKey}
        onPick={(id) => { setItemId(id); setLedgerRange(null); updateQuery({ article: id }); }} />}
      {tab === 'ateliers' && <WorkshopTab reloadKey={reloadKey} />}
    </div>
  );
}

