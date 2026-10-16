import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import {
  Search, X, Plus, Pencil, Trash2, Phone, Mail, MapPin, Building2, FilePlus, ExternalLink, Clock,
  FileSpreadsheet, Truck, Package, AlertTriangle, ArrowUp, ArrowDown, StickyNote, UserRound,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { dialog, errorMessage } from '../../components/common/dialog';
import './SuppliersPanel.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
const LOCALES = { fr: 'fr-FR', it: 'it-IT', en: 'en-GB' };
const EMPTY = { name: '', code: '', contact: '', phone: '', email: '', address: '', city: '', ice: '', rc: '', notes: '' };
const TERM_PRESETS = [0, 30, 45, 60, 90, 120];

/** "60 j fin de mois" / "Comptant" / "—" */
export function termLabel(delai, finDeMois, t) {
  if (delai == null) return '—';
  if (delai === 0 && !finDeMois) return t('acTermCash');
  return t(finDeMois ? 'acTermDaysEom' : 'acTermDays', { n: delai });
}

function TermFields({ value, onChange, t }) {
  const preset = value.delaiPaiement === '' || value.delaiPaiement == null ? '' : TERM_PRESETS.includes(Number(value.delaiPaiement)) ? String(value.delaiPaiement) : 'custom';
  const [custom, setCustom] = useState(preset === 'custom');
  return (
    <div className="form-grid-2">
      <div className="form-group">
        <label>{t('acTerm')}</label>
        <select value={custom ? 'custom' : preset} onChange={e => {
          const v = e.target.value;
          if (v === 'custom') { setCustom(true); return; }
          setCustom(false); onChange({ delaiPaiement: v === '' ? '' : Number(v) });
        }}>
          <option value="">{t('acTermUnset')}</option>
          {TERM_PRESETS.map(n => <option key={n} value={n}>{n === 0 ? t('acTermCash') : t('acTermDays', { n })}</option>)}
          <option value="custom">{t('acTermOther')}</option>
        </select>
        {custom && (
          <input type="number" min="0" max="365" style={{ marginTop: 6 }} value={value.delaiPaiement ?? ''} placeholder={t('acTermDaysPh')}
            onChange={e => onChange({ delaiPaiement: e.target.value === '' ? '' : Number(e.target.value) })} />
        )}
      </div>
      <div className="form-group">
        <label>&nbsp;</label>
        <label className="sp-check"><input type="checkbox" checked={!!value.finDeMois} onChange={e => onChange({ finDeMois: e.target.checked })} />{t('acEom')}</label>
        <span className="sp-hint">{t('acEomHint')}</span>
      </div>
    </div>
  );
}

function useFmt(lang) {
  return useMemo(() => {
    const loc = LOCALES[lang] || 'fr-FR';
    const sp = (s) => s.replace(/ /g, ' '); // the app font has no narrow no-break space
    const money = new Intl.NumberFormat(loc, { style: 'currency', currency: 'MAD', maximumFractionDigits: 0 });
    const n = new Intl.NumberFormat(loc, { maximumFractionDigits: 2 });
    const d = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', year: 'numeric' });
    return { money: (v) => sp(money.format(v || 0)), n: (v) => sp(n.format(v || 0)), d: (v) => (v ? d.format(new Date(v)) : '—') };
  }, [lang]);
}

/* ── Create / edit form ────────────────────────────────────────────────── */
export function SupplierFormModal({ supplier, onClose, onSaved, paymentOnly = false }) {
  const { t } = useLanguage();
  const [form, setForm] = useState(() => ({ ...EMPTY, delaiPaiement: '', finDeMois: false, ...(supplier || {}), ...(supplier?.delaiPaiement == null ? { delaiPaiement: '' } : {}) }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!paymentOnly && !form.name.trim()) { setError(t('orNameRequired')); return; }
    if (!paymentOnly && form.email && !/^\S+@\S+\.\S+$/.test(form.email.trim())) { setError(t('spEmailInvalid')); return; }
    if (form.delaiPaiement !== '' && (!Number.isFinite(Number(form.delaiPaiement)) || form.delaiPaiement < 0 || form.delaiPaiement > 365)) { setError(t('acTermInvalid')); return; }
    setSaving(true); setError('');
    const terms = { delaiPaiement: form.delaiPaiement === '' ? null : Number(form.delaiPaiement), finDeMois: !!form.finDeMois };
    const body = paymentOnly ? terms : { ...Object.fromEntries(Object.keys(EMPTY).map(k => [k, (form[k] || '').trim()])), ...terms };
    try {
      const r = supplier?.id
        ? await axios.put(`${API_URL}/fournisseurs/${supplier.id}`, body)
        : await axios.post(`${API_URL}/fournisseurs`, body);
      onSaved(r.data);
    } catch (err) { setError(errorMessage(err, t('dlgError'))); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay modal-overlay--top" onClick={onClose}>
      <div className="modal modal--supplier" onClick={e => e.stopPropagation()}>
        <h2>{paymentOnly ? t('acTermTitle', { name: supplier?.name }) : supplier?.id ? t('spEditTitle', { name: supplier.name }) : t('orNewSupplier')}</h2>
        <form onSubmit={submit}>
          {paymentOnly ? null : <>
          <div className="form-grid-2">
            <div className="form-group"><label>{t('orNameReq')}</label><input value={form.name} onChange={set('name')} autoFocus /></div>
            <div className="form-group"><label>{t('orSupplierCode')}</label><input value={form.code} onChange={set('code')} /></div>
            <div className="form-group"><label>{t('orContact')}</label><input value={form.contact} onChange={set('contact')} /></div>
            <div className="form-group"><label>{t('orPhone')}</label><input type="tel" value={form.phone} onChange={set('phone')} /></div>
            <div className="form-group"><label>{t('orEmail')}</label><input type="email" value={form.email} onChange={set('email')} /></div>
            <div className="form-group"><label>{t('orCity')}</label><input value={form.city} onChange={set('city')} /></div>
            <div className="form-group"><label>ICE</label><input value={form.ice} onChange={set('ice')} /></div>
            <div className="form-group"><label>RC</label><input value={form.rc} onChange={set('rc')} /></div>
          </div>
          <div className="form-group"><label>{t('orAddress')}</label><input value={form.address} onChange={set('address')} /></div>
          <div className="form-group"><label>{t('orNotes')}</label><textarea rows={2} value={form.notes} onChange={set('notes')} /></div>
          </>}
          <TermFields value={form} onChange={(patch) => setForm(f => ({ ...f, ...patch }))} t={t} />
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" onClick={onClose}>{t('cancel')}</button>
            <button type="submit" className="primary" disabled={saving}>{saving ? '…' : supplier?.id ? t('save') : t('orCreateSupplier')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Supplier detail (drawer) ──────────────────────────────────────────── */
function SupplierDrawer({ supplierId, stats, statusColors, lang, isAdmin, fullEdit, onClose, onEdit, onDelete, onNewOrder, onOpenOrder }) {
  const { t } = useLanguage();
  const f = useFmt(lang);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('orders');

  useEffect(() => {
    let live = true;
    setData(null); setError('');
    axios.get(`${API_URL}/fournisseurs/${supplierId}/details`)
      .then(r => { if (live) setData(r.data); })
      .catch(e => { if (live) setError(errorMessage(e, t('dlgError'))); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId]);
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const s = data?.supplier;
  const st = stats || {};
  return (
    <div className="sp-overlay" onClick={onClose}>
      <aside className="sp-drawer" onClick={e => e.stopPropagation()} role="dialog" aria-label={s?.name || t('orSupplier')}>
        <header className="sp-drawer__head">
          <div className="sp-avatar sp-avatar--lg">{(s?.name || '?').trim().charAt(0).toUpperCase()}</div>
          <div className="sp-drawer__title">
            <h3>{s?.name || '…'}</h3>
            {s?.code && <span className="sp-code">{s.code}</span>}
          </div>
          <button type="button" className="sp-icon" onClick={onClose} aria-label={t('close')}><X size={16} /></button>
        </header>

        {error && <div className="sp-error"><AlertTriangle size={14} />{error}</div>}
        {!data && !error && <div className="sp-empty">{t('loadingShort')}</div>}

        {s && (
          <>
            <div className="sp-actions">
              {fullEdit && <button type="button" className="sp-btn sp-btn--primary" onClick={() => onNewOrder(s)}><FilePlus size={14} />{t('spNewOrder')}</button>}
              <button type="button" className="sp-btn" onClick={() => onEdit(s)}><Pencil size={14} />{fullEdit ? t('edit') : t('acEditTerm')}</button>
              {isAdmin && <button type="button" className="sp-btn sp-btn--danger" onClick={() => onDelete(s)}><Trash2 size={14} />{t('deleteAction')}</button>}
            </div>
            <div className="sp-term">
              <Clock size={14} /><span>{t('acTerm')} : <strong>{termLabel(s.delaiPaiement, s.finDeMois, t)}</strong></span>
            </div>

            <div className="sp-contact">
              {s.contact && <div><UserRound size={14} /><span>{s.contact}</span></div>}
              {s.phone && <div><Phone size={14} /><a href={`tel:${s.phone.replace(/\s/g, '')}`}>{s.phone}</a></div>}
              {s.email && <div><Mail size={14} /><a href={`mailto:${s.email}`}>{s.email}</a></div>}
              {(s.address || s.city) && <div><MapPin size={14} /><span>{[s.address, s.city].filter(Boolean).join(', ')}</span></div>}
              {(s.ice || s.rc) && <div><Building2 size={14} /><span>{[s.ice && `ICE ${s.ice}`, s.rc && `RC ${s.rc}`].filter(Boolean).join(' · ')}</span></div>}
              {s.notes && <div><StickyNote size={14} /><span className="sp-pre">{s.notes}</span></div>}
              {!s.contact && !s.phone && !s.email && !s.address && !s.city && !s.ice && !s.rc && !s.notes && <div className="sp-muted">{t('spNoContact')}</div>}
            </div>

            <div className="sp-kpis">
              <div><span>{t('spOrders')}</span><strong>{f.n(st.orders)}</strong></div>
              <div><span>{t('spOpen')}</span><strong>{f.n(st.open)}</strong></div>
              <div><span>{t('spLate')}</span><strong className={st.late ? 'is-bad' : ''}>{f.n(st.late)}</strong></div>
              <div><span>{t('spAmount')}</span><strong>{f.money(st.amount)}</strong></div>
              <div className="sp-kpi--pay"><span>{t('acToPay')}</span><strong>{f.money(st.toPay)}{st.payLate > 0 && <em className="is-bad"> · {t('acLateCount', { n: st.payLate, amount: f.money(st.payLateAmount) })}</em>}</strong></div>
            </div>

            <div className="sp-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === 'orders'} className={`sp-tab${tab === 'orders' ? ' is-on' : ''}`} onClick={() => setTab('orders')}>
                <Truck size={14} />{t('spTabOrders')}<span>{data.orders.length}</span>
              </button>
              <button type="button" role="tab" aria-selected={tab === 'items'} className={`sp-tab${tab === 'items' ? ' is-on' : ''}`} onClick={() => setTab('items')}>
                <Package size={14} />{t('spTabItems')}<span>{data.items.length}</span>
              </button>
            </div>

            {tab === 'orders' && (data.orders.length === 0 ? <div className="sp-empty">{t('spNoOrders')}</div> : (
              <ul className="sp-list">
                {data.orders.map(o => {
                  const c = statusColors[o.status] || statusColors.brouillon;
                  return (
                    <li key={o.id}>
                      <button type="button" className="sp-row" onClick={() => onOpenOrder(o.id)}>
                        <div className="sp-row__main">
                          <strong>{o.number || o.reference || t('orDraft')}</strong>
                          <span className="sp-muted">{f.d(o.sentAt || o.orderDate)}{o.company ? ` · ${o.company.name}` : ''} · {t('spLines', { n: o.lines })}</span>
                        </div>
                        <div className="sp-row__side">
                          <span className="sp-status" style={{ background: c.bg, color: c.text, borderColor: c.bd }}>{c.label[lang] || c.label.fr}</span>
                          <span className="sp-row__amount">{f.money(o.amount)}</span>
                          {o.late
                            ? <span className="sp-late"><Clock size={11} />{t('spLateSince', { date: f.d(o.expectedDate) })}</span>
                            : (o.status === 'envoye' || o.status === 'partielle') ? <span className="sp-muted sp-small">{t('spReceivedPct', { n: o.receivedPct })}</span> : null}
                        </div>
                        <ExternalLink size={13} className="sp-row__go" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ))}

            {tab === 'items' && (data.items.length === 0 ? <div className="sp-empty">{t('spNoItems')}</div> : (
              <ul className="sp-list">
                {data.items.map(it => (
                  <li key={it.id} className="sp-item">
                    <div className="sp-row__main">
                      <strong>{it.designation?.[lang] || it.designation?.fr}</strong>
                      <span className="sp-muted">
                        {it.code && <span className="sp-code">{it.code}</span>}
                        {it.supplierCode ? t('spTheirCode', { code: it.supplierCode }) : t('spNoTheirCode')}
                      </span>
                    </div>
                    <div className={`sp-stock${it.threshold > 0 && it.quantity < it.threshold ? ' is-low' : ''}`}>{f.n(it.quantity)}</div>
                  </li>
                ))}
              </ul>
            ))}
          </>
        )}
      </aside>
    </div>
  );
}

/* ── Tab: list of suppliers ────────────────────────────────────────────── */
export default function SuppliersPanel({ suppliers, onChanged, onNewOrder, onOpenOrder, statusColors, isAdmin, fullEdit = true }) {
  const { t, currentLanguage: lang } = useLanguage();
  const f = useFmt(lang);
  const [stats, setStats] = useState({});
  const [q, setQ] = useState('');
  const [sort, setSort] = useState({ key: 'name', dir: 1 });
  const [editing, setEditing] = useState(null);   // {} = new, supplier = edit
  const [openId, setOpenId] = useState(null);
  const [detailKey, setDetailKey] = useState(0);

  const loadStats = useCallback(() => {
    axios.get(`${API_URL}/fournisseurs/stats`).then(r => setStats(r.data || {})).catch(() => {});
  }, []);
  useEffect(() => { loadStats(); }, [loadStats, suppliers]);

  const rows = useMemo(() => {
    const words = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter(Boolean);
    const text = (s) => [s.name, s.code, s.contact, s.phone, s.email, s.city, s.ice, s.rc].join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const list = suppliers.filter(s => words.every(w => text(s).includes(w)));
    const val = (s) => {
      if (sort.key === 'name') return (s.name || '').toLowerCase();
      if (sort.key === 'lastOrder') return stats[s.id]?.lastOrder ? new Date(stats[s.id].lastOrder).getTime() : 0;
      return stats[s.id]?.[sort.key] || 0;
    };
    return [...list].sort((a, b) => { const va = val(a), vb = val(b); return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir; });
  }, [suppliers, q, sort, stats]);

  const totals = useMemo(() => Object.values(stats).reduce((a, s) => ({
    open: a.open + s.open, late: a.late + s.late, toPay: a.toPay + (s.toPay || 0), payLateAmount: a.payLateAmount + (s.payLateAmount || 0),
  }), { open: 0, late: 0, toPay: 0, payLateAmount: 0 }), [stats]);
  const withOrders = Object.values(stats).filter(s => s.orders > 0).length;

  const th = (key, label, num) => (
    <th className={`${num ? 'num ' : ''}sp-sort${sort.key === key ? ' is-on' : ''}`}
      onClick={() => setSort(s => ({ key, dir: s.key === key ? -s.dir : (key === 'name' ? 1 : -1) }))}
      aria-sort={sort.key === key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
      {label}{sort.key === key && (sort.dir > 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
    </th>
  );

  const remove = async (s) => {
    if (!(await dialog.confirm({ title: t('deleteTitle'), message: t('spDeleteConfirm', { name: s.name }), danger: true, confirmLabel: t('deleteAction') }))) return;
    try {
      await axios.delete(`${API_URL}/fournisseurs/${s.id}`);
    } catch (e) {
      if (e.response?.status === 409 && e.response.data?.items) {
        const ok = await dialog.confirm({ title: t('deleteTitle'), message: t('spDeleteItems', { n: e.response.data.items, name: s.name }), danger: true, confirmLabel: t('deleteAction') });
        if (!ok) return;
        try { await axios.delete(`${API_URL}/fournisseurs/${s.id}`, { params: { force: 1 } }); }
        catch (e2) { await dialog.alert(errorMessage(e2, t('dlgError'))); return; }
      } else { await dialog.alert(errorMessage(e, t('dlgError'))); return; }
    }
    setOpenId(null);
    onChanged();
  };

  const exportXlsx = () => {
    const data = rows.map(s => ({
      [t('orSupplier')]: s.name, [t('orSupplierCode')]: s.code, [t('orContact')]: s.contact, [t('orPhone')]: s.phone, [t('orEmail')]: s.email,
      [t('orCity')]: s.city, [t('orAddress')]: s.address, ICE: s.ice, RC: s.rc,
      [t('spOrders')]: stats[s.id]?.orders || 0, [t('spOpen')]: stats[s.id]?.open || 0, [t('spLate')]: stats[s.id]?.late || 0,
      [t('spAmount')]: stats[s.id]?.amount || 0, [t('spLastOrder')]: stats[s.id]?.lastOrder ? f.d(stats[s.id].lastOrder) : '',
      [t('spTabItems')]: stats[s.id]?.items || 0, [t('acTerm')]: termLabel(s.delaiPaiement, s.finDeMois, t),
      [t('acToPay')]: stats[s.id]?.toPay || 0, [t('orNotes')]: s.notes,
    }));
    if (!data.length) return;
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, t('spTitle').slice(0, 31));
    XLSX.writeFile(wb, 'fournisseurs.xlsx');
  };

  return (
    <div className="sp">
      <div className="sp-summary">
        <div><span>{t('spTitle')}</span><strong>{f.n(suppliers.length)}</strong></div>
        <div><span>{t('spActive')}</span><strong>{f.n(withOrders)}</strong></div>
        <div><span>{t('spOpenAll')}</span><strong>{f.n(totals.open)}</strong></div>
        <div><span>{t('spLateAll')}</span><strong className={totals.late ? 'is-bad' : ''}>{f.n(totals.late)}</strong></div>
        <div><span>{t('acToPayAll')}</span><strong>{f.money(totals.toPay)}</strong></div>
        <div><span>{t('acPayLateAll')}</span><strong className={totals.payLateAmount ? 'is-bad' : ''}>{f.money(totals.payLateAmount)}</strong></div>
      </div>

      <div className="sp-toolbar">
        <div className="sp-search">
          <Search size={15} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('spSearch')} aria-label={t('spSearch')} />
          {q && <button type="button" className="sp-search__clear" onClick={() => setQ('')} aria-label={t('close')}><X size={14} /></button>}
        </div>
        <div className="sp-toolbar__end">
          <button type="button" className="sp-btn" onClick={exportXlsx} disabled={!rows.length}><FileSpreadsheet size={14} />Excel</button>
          {fullEdit && <button type="button" className="sp-btn sp-btn--primary" onClick={() => setEditing({})}><Plus size={14} />{t('orNewSupplier')}</button>}
        </div>
      </div>

      <div className="sp-card">
        {rows.length === 0 ? (
          <div className="sp-empty">{suppliers.length ? t('spNoMatch') : t('spNone')}</div>
        ) : (
          <div className="sp-table-wrap">
            <table className="sp-table">
              <thead><tr>
                {th('name', t('orSupplier'))}
                <th className="hide-md">{t('spColContact')}</th>
                {th('orders', t('spOrders'), true)}
                {th('open', t('spOpen'), true)}
                {th('amount', t('spAmount'), true)}
                {th('lastOrder', t('spLastOrder'), true)}
                {th('items', t('spTabItems'), true)}
                <th className="num">{t('acTermShort')}</th>
                {th('toPay', t('acToPay'), true)}
                <th />
              </tr></thead>
              <tbody>
                {rows.map(s => {
                  const st = stats[s.id] || {};
                  return (
                    <tr key={s.id} tabIndex={0} className="is-link" onClick={() => setOpenId(s.id)} onKeyDown={e => { if (e.key === 'Enter') setOpenId(s.id); }}>
                      <td>
                        <div className="sp-name">
                          <span className="sp-avatar">{(s.name || '?').trim().charAt(0).toUpperCase()}</span>
                          <div>
                            <strong>{s.name}</strong>
                            <span className="sp-muted">{[s.code, s.city].filter(Boolean).join(' · ') || '—'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="hide-md">
                        <div className="sp-contactcell">
                          {s.contact && <span>{s.contact}</span>}
                          {s.phone && <a href={`tel:${s.phone.replace(/\s/g, '')}`} onClick={e => e.stopPropagation()}><Phone size={12} />{s.phone}</a>}
                          {s.email && <a href={`mailto:${s.email}`} onClick={e => e.stopPropagation()}><Mail size={12} />{s.email}</a>}
                          {!s.contact && !s.phone && !s.email && <span className="sp-muted">—</span>}
                        </div>
                      </td>
                      <td className="num">{f.n(st.orders)}</td>
                      <td className="num">
                        {f.n(st.open)}
                        {st.late > 0 && <span className="sp-late sp-late--inline" title={t('spLate')}><Clock size={11} />{st.late}</span>}
                      </td>
                      <td className="num">{st.amount ? f.money(st.amount) : <span className="sp-muted">—</span>}</td>
                      <td className="num sp-muted">{f.d(st.lastOrder)}</td>
                      <td className="num">{f.n(st.items)}</td>
                      <td className="num">{s.delaiPaiement == null ? <span className="sp-muted">—</span> : termLabel(s.delaiPaiement, s.finDeMois, t)}</td>
                      <td className="num">
                        {st.toPay ? f.money(st.toPay) : <span className="sp-muted">—</span>}
                        {st.payLate > 0 && <span className="sp-late sp-late--inline" title={t('acFilterLate')}><Clock size={11} />{st.payLate}</span>}
                      </td>
                      <td className="sp-rowact">
                        {fullEdit && <button type="button" className="sp-icon" title={t('spNewOrder')} aria-label={t('spNewOrder')} onClick={e => { e.stopPropagation(); onNewOrder(s); }}><FilePlus size={14} /></button>}
                        <button type="button" className="sp-icon" title={t('edit')} aria-label={t('edit')} onClick={e => { e.stopPropagation(); setEditing(s); }}><Pencil size={14} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <SupplierFormModal
          supplier={editing.id ? editing : null}
          paymentOnly={!fullEdit}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setDetailKey(k => k + 1); onChanged(); }}
        />
      )}
      {openId && (
        <SupplierDrawer
          key={`${openId}-${detailKey}`}
          supplierId={openId} stats={stats[openId]} statusColors={statusColors} lang={lang} isAdmin={isAdmin} fullEdit={fullEdit}
          onClose={() => setOpenId(null)}
          onEdit={(s) => setEditing({ ...s, id: s.id || s._id })}
          onDelete={(s) => remove({ ...s, id: s.id || s._id })}
          onNewOrder={(s) => { setOpenId(null); onNewOrder({ ...s, id: s.id || s._id }); }}
          onOpenOrder={(id) => { setOpenId(null); onOpenOrder(id); }}
        />
      )}
    </div>
  );
}
