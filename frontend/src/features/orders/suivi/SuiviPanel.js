// Suivi des commandes (Achats): three views of the same purchases, because one invoice can cover several
// purchase orders, one BL can cover several purchase orders, and one purchase order can have several BL.
//   • Factures           — one row per supplier invoice: what it covers, paid / left, due date, files
//   • Bons de livraison  — one row per BL: the purchase orders it covers, reception, invoiced or not
//   • Bons de commande   — one row per purchase order: its BL, its invoices, what is left to invoice
// Buttons: « Ajouter une facture », « Ajouter un BL » (for one or several purchase orders), « Payer une facture ».
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  Receipt, Truck, ClipboardList, Plus, Wallet, RefreshCw, LoaderCircle, Search, X, Pencil, Trash2,
  ChevronDown, ChevronRight, ChevronLeft, AlertTriangle, FileText, FileImage, Paperclip, Check, Mail, Download, Sheet, MailCheck, Undo2,
} from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import { useCompany } from '../../../context/CompanyContext';
import { dialog, errorMessage } from '../../../components/common/dialog';
import { showDocument } from '../../../components/common/docViewerBus';
import { PAGE_PATHS, setUrl } from '../../../routes';
import CompanyFilter, { CompanyTag } from '../CompanyFilter';
import { StorageGauge, compressImage, fileBase } from '../TrackingDocuments';
import './SuiviPanel.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
const PAGE_SIZE = 25;
const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp';
const okType = (f) => /^(application\/pdf|image\/(jpeg|png|webp))$/.test(f.type) || /\.(pdf|jpe?g|png|webp)$/i.test(f.name);
const PAY_MODES = [
  { value: '', label: '—' }, { value: 'espece', label: 'orPayCash' }, { value: 'virement', label: 'orPayTransfer' },
  { value: 'cheque', label: 'orPayCheque' }, { value: 'effet', label: 'orPayBill' },
];
const FACTURE_TYPES = [
  { value: 'facture', label: 'orTypeInvoice' }, { value: 'situation', label: 'orTypeSituation' },
  { value: 'bl', label: 'svTypeBl' }, { value: 'avoir', label: 'svTypeAvoir' },
];
const VIEW_KEY = 'cami_suivi_view';

const money = (v) => Number(v || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const ymd = (d) => { if (!d) return ''; const x = new Date(d); return isNaN(x) ? '' : `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const openOrder = (id) => { setUrl(`${PAGE_PATHS.orders}/${id}`); window.dispatchEvent(new PopStateEvent('popstate')); };
const viewDoc = (doc) => showDocument(doc, doc.kind === 'facture' ? 'factures/documents' : 'order-tracking/documents');

// One file (photo compressed first) sent as the raw body
async function sendFile(url, original, params = {}) {
  const file = await compressImage(original);
  return axios.post(url, file, { params: { ...params, name: file.name }, headers: { 'Content-Type': file.type || 'application/octet-stream' } });
}

// List fetched from the server (search debounced), reloaded on demand
// (rows of another view are never shown: each view has its own columns)
function useList(url, params, debounceMs) {
  const key = url + '?' + new URLSearchParams(params).toString();
  const [state, setState] = useState({ url: null, data: null });
  const [loading, setLoading] = useState(true);
  const reqId = useRef(0);
  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    try { const r = await axios.get(url, { params }); if (id === reqId.current) setState({ url, data: r.data }); }
    catch (e) { if (id === reqId.current) setState({ url, data: { rows: [], total: 0, page: 1, pages: 1, error: errorMessage(e, 'Erreur') } }); }
    finally { if (id === reqId.current) setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => { const timer = setTimeout(load, debounceMs); return () => clearTimeout(timer); }, [load, debounceMs]);
  return { data: state.url === url ? state.data : null, loading, reload: load };
}

function Pager({ data, onPage }) {
  const { t } = useLanguage();
  if (!data || data.pages <= 1) return null;
  const from = (data.page - 1) * data.limit + 1;
  const to = Math.min(data.page * data.limit, data.total);
  return (
    <div className="pr-pager">
      <span className="pr-pager__info">{t('orRowsRange', { from, to, total: data.total })}</span>
      <div className="pr-pager__btns">
        <button type="button" className="pr-pager__btn" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}><ChevronLeft size={15} /></button>
        <span className="pr-pager__page">{t('orPageOf', { page: data.page, pages: data.pages })}</span>
        <button type="button" className="pr-pager__btn" disabled={data.page >= data.pages} onClick={() => onPage(data.page + 1)}><ChevronRight size={15} /></button>
      </div>
    </div>
  );
}

const DocLink = ({ doc }) => {
  const Icon = doc.contentType === 'application/pdf' ? FileText : FileImage;
  return (
    <button type="button" className="sv-doc" title={doc.name} onClick={(e) => { e.stopPropagation(); viewDoc(doc); }}>
      <Icon size={13} /><span>{doc.name}</span>
    </button>
  );
};
// « Télécharger »: the private file, through a short-lived link
const DocDownload = ({ doc }) => {
  const { t } = useLanguage();
  const go = async (e) => {
    e.stopPropagation();
    try {
      const r = await axios.get(`${API_URL}/${doc.kind === 'facture' ? 'factures/documents' : 'order-tracking/documents'}/${doc.id}/url`, { params: { download: 1 } });
      window.location.href = r.data.url;
    } catch (err) { dialog.alert(errorMessage(err, t('dlgError'))); }
  };
  return <button type="button" className="sv-mini" onClick={go} title={`${t('tdDownload')} — ${doc.name}`} aria-label={t('tdDownload')}><Download size={13} /></button>;
};
const OrderChip = ({ number, id, sub, tone, noLink = false }) => (
  <button type="button" className={`sv-chip sv-chip--bc${tone ? ` sv-chip--${tone}` : ''}${noLink ? ' sv-chip--static' : ''}`} title={number}
    onClick={(e) => { e.stopPropagation(); if (id && !noLink) openOrder(id); }}>
    {number || '—'}{sub ? <em>{sub}</em> : null}
  </button>
);
function PayStatus({ v }) {
  const { t } = useLanguage();
  if (v.typeFacture === 'avoir') return <span className="sv-status sv-status--avoir">{t('svTypeAvoir')}</span>;
  if (v.statut === 'paye') return <span className="sv-status sv-status--paid"><Check size={12} /> {t('acPayDone')}</span>;
  return (
    <span className={`sv-status ${v.retardJours > 0 ? 'sv-status--late' : v.statut === 'partiel' ? 'sv-status--partial' : 'sv-status--open'}`}>
      {v.retardJours > 0 ? t('svLateDays', { n: v.retardJours }) : t(v.statut === 'partiel' ? 'acPayPartial' : 'acPayNone')}
    </span>
  );
}

/* ═══════════════════════════════ Panel ═══════════════════════════════ */
// readOnly: the accountant — invoices + purchase orders only, files opened / downloaded, payments recorded;
// nothing else changed and no due date (échéance) shown
export default function SuiviPanel({ readOnly = false }) {
  const { t } = useLanguage();
  const { selectedCompany } = useCompany();
  const VIEWS = readOnly ? ['factures', 'bcs'] : ['factures', 'bls', 'bcs'];
  const [view, setViewState] = useState(() => { try { const v = localStorage.getItem(VIEW_KEY); return v && (readOnly ? v !== 'bls' : true) ? v : 'factures'; } catch { return 'factures'; } });
  const setView = setViewState;
  const [company, setCompany] = useState(selectedCompany || 'all');
  useEffect(() => { setCompany(selectedCompany || 'all'); }, [selectedCompany]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState({ factures: 'all', bls: 'all', bcs: 'all' });
  const [page, setPage] = useState(1);
  const [storage, setStorage] = useState(null);
  const [modal, setModal] = useState(null); // { kind: 'facture'|'bl'|'pay', ... }
  const [open, setOpen] = useState(null);   // expanded invoice id

  useEffect(() => { axios.get(`${API_URL}/order-tracking/storage`).then(r => setStorage(r.data)).catch(() => {}); }, []);
  const changeView = (v) => { setView(v); setPage(1); setOpen(null); try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode */ } };
  const url = view === 'factures' ? `${API_URL}/factures` : view === 'bls' ? `${API_URL}/order-tracking/bl-list` : `${API_URL}/order-tracking/bc-list`;
  const params = { page, limit: PAGE_SIZE, q: q.trim(), status: status[view], company: company === 'all' ? '' : company };
  const { data, loading, reload } = useList(url, params, q ? 300 : 0);
  const rows = data?.rows || [];
  const setFilter = (v) => { setStatus(s => ({ ...s, [view]: v })); setPage(1); };
  const done = () => { setModal(null); reload(); axios.get(`${API_URL}/order-tracking/storage`).then(r => setStorage(r.data)).catch(() => {}); };

  const FILTERS = {
    factures: [['all', 'orAll'], ['a_payer', 'acFilterToPay'], ['retard', 'acFilterLate'], ['payee', 'svPaid'], ['sans_pdf', 'tdFilterNoPdf']],
    bls: [['all', 'orAll'], ['a_receptionner', 'svToReceive'], ['recu', 'svReceived'], ['non_facture', 'svNotInvoiced']],
    bcs: [['all', 'orAll'], ['a_facturer', 'svToInvoice'], ['facture', 'svInvoiced'], ['en_cours', 'svOpenOrders']],
  };

  return (
    <div className="pr-panel sv">
      <div className="pr-panel__header sv-head">
        <div className="sv-views" role="tablist">
          {[['factures', Receipt, 'svViewInvoices'], ['bls', Truck, 'svViewBls'], ['bcs', ClipboardList, 'svViewOrders']].filter(([k]) => VIEWS.includes(k)).map(([k, Icon, label]) => (
            <button key={k} type="button" role="tab" aria-selected={view === k} className={`sv-view${view === k ? ' is-on' : ''}`} onClick={() => changeView(k)}>
              <Icon size={15} /> {t(label)}
            </button>
          ))}
        </div>
        <div className="sv-actions">
          {readOnly ? (
            <button type="button" className="sv-btn sv-btn--pay" onClick={() => setModal({ kind: 'pay' })}><Wallet size={15} /> {t('svPayInvoice')}</button>
          ) : (
            <>
              <button type="button" className="sv-btn sv-btn--primary" onClick={() => setModal({ kind: 'facture' })}><Plus size={15} /> {t('svAddInvoice')}</button>
              <button type="button" className="sv-btn" onClick={() => setModal({ kind: 'bl' })}><Truck size={15} /> {t('svAddBl')}</button>
              <button type="button" className="sv-btn sv-btn--pay" onClick={() => setModal({ kind: 'pay' })}><Wallet size={15} /> {t('svPayInvoice')}</button>
              <button type="button" className="sv-btn sv-btn--mail" onClick={() => setModal({ kind: 'mail' })}><Mail size={15} /> {t('svMail')}</button>
            </>
          )}
          <StorageGauge storage={storage} compact />
          <button type="button" className="pr-refresh-btn orders-icon-btn orders-icon-btn--sm" onClick={reload} title={t('orRefresh')}>
            <RefreshCw size={14} className={loading ? 'spin' : undefined} />
          </button>
        </div>
      </div>

      <div className="sv-tools">
        <CompanyFilter value={company} onChange={(c) => { setCompany(c); setPage(1); }} />
        <div className="sv-tools__row">
          <div className="sv-search">
            <Search size={15} />
            <input value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder={t(view === 'factures' ? 'svSearchInvoices' : view === 'bls' ? 'svSearchBls' : 'svSearchOrders')} />
            {q && <button type="button" onClick={() => setQ('')} aria-label={t('close')}><X size={14} /></button>}
          </div>
          <div className="pr-filter-tabs">
            {FILTERS[view].map(([k, label]) => (
              <button key={k} type="button" className={`pr-filter-tab ${status[view] === k ? 'active' : ''}`} onClick={() => setFilter(k)}>{t(label)}</button>
            ))}
          </div>
        </div>
      </div>

      {view === 'factures' && data?.overview && (
        <div className="sv-cards">
          <div><span>{t('svCardInvoiced')}</span><strong>{money(data.overview.montant)}</strong></div>
          <div><span>{t('svCardPaid')}</span><strong className="is-ok">{money(data.overview.paye)}</strong></div>
          <div><span>{t('acToPayAll')}</span><strong>{money(data.overview.reste)}</strong></div>
          <div><span>{t('acRemainingLate')}</span><strong className={data.overview.retard > 0 ? 'is-bad' : ''}>{money(data.overview.retard)}</strong></div>
        </div>
      )}

      {loading && !data ? (
        <div className="orders-loading"><LoaderCircle size={22} /><p>{t('orLoadingTracking')}</p></div>
      ) : data?.error ? (
        <div className="pr-empty"><AlertTriangle size={18} /><p>{data.error}</p></div>
      ) : rows.length === 0 ? (
        <div className="pr-empty">
          <span className="pr-empty__icon">{view === 'factures' ? <Receipt size={20} /> : view === 'bls' ? <Truck size={20} /> : <ClipboardList size={20} />}</span>
          <p>{t(view === 'factures' ? 'svNoInvoices' : 'orNoOrdersToShow')}</p>
          {view === 'factures' && !readOnly && <button type="button" className="sv-btn sv-btn--primary" onClick={() => setModal({ kind: 'facture' })}><Plus size={15} /> {t('svAddInvoice')}</button>}
        </div>
      ) : (
        <div className={`pr-table-wrap${loading ? ' pr-table-wrap--loading' : ''}`}>
          {view === 'factures' && <InvoicesTable rows={rows} data={data} open={open} setOpen={setOpen} onChanged={reload} setModal={setModal} readOnly={readOnly} />}
          {view === 'bls' && !readOnly && <BlsTable rows={rows} data={data} setModal={setModal} />}
          {view === 'bcs' && <OrdersTable rows={rows} data={data} setModal={setModal} onChanged={reload} readOnly={readOnly} />}
          <Pager data={data} onPage={setPage} />
        </div>
      )}

      {modal?.kind === 'facture' && <FactureModal facture={modal.facture} preset={modal.preset} onClose={() => setModal(null)} onSaved={done} />}
      {modal?.kind === 'bl' && <BlModal preset={modal.preset} onClose={() => setModal(null)} onSaved={done} />}
      {modal?.kind === 'pay' && <PayModal factureId={modal.factureId} onClose={() => setModal(null)} onSaved={done} />}
      {modal?.kind === 'mail' && <MailModal onClose={() => setModal(null)} />}
    </div>
  );
}

/* ═══════════════════════════════ Factures ═══════════════════════════════ */
function InvoicesTable({ rows, data, open, setOpen, onChanged, setModal, readOnly }) {
  const { t } = useLanguage();
  const del = async (v) => {
    if (!(await dialog.confirm({ title: t('svDeleteInvoice'), message: t('svDeleteInvoiceMsg', { n: v.number || t('svNoNumber') }), danger: true, confirmLabel: t('deleteAction') }))) return;
    try { await axios.delete(`${API_URL}/factures/${v.id}`); onChanged(); } catch (e) { dialog.alert(errorMessage(e, t('dlgError'))); }
  };
  return (
    <table className="pr-table sv-table">
      <thead>
        <tr>
          <th style={{ width: 28 }} /><th>{t('orDate')}</th><th>{t('ocfCompany')}</th><th>{t('orSupplier')}</th><th>{t('acInvoiceNo')}</th>
          <th>{t('svCovers')}</th><th className="sv-num">{t('svAmount')}</th><th className="sv-num">{t('svPaidCol')}</th><th className="sv-num">{t('svLeft')}</th>
          {!readOnly && <th>{t('acDueDate')}</th>}<th>{t('acPayment')}</th><th>{t('tdColumn')}</th><th />
        </tr>
      </thead>
      <tbody>
        {rows.map(v => (
          <React.Fragment key={v.id}>
            <tr className={`sv-row${open === v.id ? ' is-open' : ''}`} onClick={() => setOpen(open === v.id ? null : v.id)}>
              <td className="sv-caret">{open === v.id ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
              <td className="pr-date">{fmtDate(v.date)}</td>
              <td><CompanyTag name={v.companyName} color={v.companyColor} /></td>
              <td className="pr-strong">{v.supplierName || '—'}</td>
              <td className="pr-num"><strong>{v.number || <span className="pr-faint">{t('svNoNumber')}</span>}</strong>{v.typeFacture && v.typeFacture !== 'facture' && <span className="sv-type">{t(FACTURE_TYPES.find(x => x.value === v.typeFacture)?.label || '')}</span>}{v.releve && <span className="sv-sent" title={t('svSentTitle', { d: fmtDate(v.releve.sentAt), p: v.releve.span })}><MailCheck size={12} /></span>}</td>
              <td className="sv-links">
                {v.links.map(l => <OrderChip key={l.orderId} id={l.orderId} number={l.orderNumber} noLink={readOnly} sub={l.blNumbers.length ? `BL ${l.blNumbers.join(', ')}` : ''} />)}
              </td>
              <td className="sv-num pr-strong">{money(v.montant)}</td>
              <td className="sv-num">{money(v.paye)}</td>
              <td className={`sv-num pr-strong${v.reste > 0 && v.retardJours > 0 ? ' sv-late' : ''}`}>{money(v.reste)}</td>
              {!readOnly && <td className="pr-date">{v.echeance ? fmtDate(v.echeance) : <span className="pr-faint" title={t('acNoTermTip')}>—</span>}</td>}
              <td><PayStatus v={v} /></td>
              <td>{v.documents.length ? <span className="sv-count"><Paperclip size={12} /> {v.documents.length}</span> : <span className="sv-missing">{t('svNoFile')}</span>}</td>
              <td className="sv-row-actions" onClick={e => e.stopPropagation()}>
                {readOnly ? <>
                  {v.reste > 0 && v.typeFacture !== 'avoir' && <button type="button" className="sv-mini sv-mini--pay" onClick={() => setModal({ kind: 'pay', factureId: v.id })} title={t('svPayInvoice')}><Wallet size={14} /></button>}
                  {v.documents.map(d => <DocDownload key={d.id} doc={d} />)}
                </> : <>
                {v.reste > 0 && v.typeFacture !== 'avoir' && <button type="button" className="sv-mini sv-mini--pay" onClick={() => setModal({ kind: 'pay', factureId: v.id })} title={t('svPayInvoice')}><Wallet size={14} /></button>}
                <button type="button" className="sv-mini" onClick={() => setModal({ kind: 'facture', facture: v })} title={t('edit')}><Pencil size={14} /></button>
                <button type="button" className="sv-mini sv-mini--del" onClick={() => del(v)} title={t('deleteAction')}><Trash2 size={14} /></button>
                </>}
              </td>
            </tr>
            {open === v.id && (
              <tr className="sv-detail-row"><td colSpan={readOnly ? 12 : 13}><InvoiceDetail v={v} onChanged={onChanged} setModal={setModal} readOnly={readOnly} /></td></tr>
            )}
          </React.Fragment>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={6} className="pr-totals-label">{t('orTotalsShown')}</td>
          <td className="sv-num">{money(data.totals?.montant)}</td><td className="sv-num">{money(data.totals?.paye)}</td><td className="sv-num"><strong>{money(data.totals?.reste)}</strong></td>
          <td colSpan={readOnly ? 3 : 4} className="pr-totals-pay">{data.totals?.retard > 0 && <span className="pr-late">{t('acRemainingLate')} <strong>{money(data.totals.retard)}</strong></span>}</td>
        </tr>
        {(data.byCompany || []).length > 1 && data.byCompany.map(c => (
          <tr key={c.companyId || 'none'} className="pr-totals-company">
            <td colSpan={6} className="pr-totals-label"><CompanyTag name={c.name || t('ocfNoCompany')} color={c.color} /></td>
            <td className="sv-num">{money(c.montant)}</td><td className="sv-num">{money(c.paye)}</td><td className="sv-num"><strong>{money(c.reste)}</strong></td>
            <td colSpan={readOnly ? 3 : 4} className="pr-totals-pay">{c.retard > 0 && <span className="pr-late">{t('acRemainingLate')} <strong>{money(c.retard)}</strong></span>}</td>
          </tr>
        ))}
      </tfoot>
    </table>
  );
}

function InvoiceDetail({ v, onChanged, setModal, readOnly }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const delPayment = async (p) => {
    if (!(await dialog.confirm({ title: t('svDeletePayment'), message: t('svDeletePaymentMsg', { m: money(p.montant), d: fmtDate(p.date) }), danger: true, confirmLabel: t('deleteAction') }))) return;
    try { await axios.delete(`${API_URL}/factures/${v.id}/payments/${p.id}`); onChanged(); } catch (e) { dialog.alert(errorMessage(e, t('dlgError'))); }
  };
  const delDoc = async (d) => {
    if (!(await dialog.confirm({ title: t('deleteTitle'), message: d.name, danger: true, confirmLabel: t('deleteAction') }))) return;
    try { await axios.delete(`${API_URL}/factures/${v.id}/documents/${d.id}`); onChanged(); } catch (e) { dialog.alert(errorMessage(e, t('dlgError'))); }
  };
  const addFiles = async (files) => {
    setBusy(true);
    try { for (const f of Array.from(files || [])) { if (!okType(f)) { dialog.alert(t('tdBadType', { name: f.name })); continue; } await sendFile(`${API_URL}/factures/${v.id}/documents`, f); } onChanged(); }
    catch (e) { dialog.alert(errorMessage(e, t('dlgError'))); }
    finally { setBusy(false); }
  };
  const modeLabel = (m) => t(PAY_MODES.find(x => x.value === m)?.label || '—');
  return (
    <div className="sv-detail">
      <section>
        <h4>{t('svCoveredOrders')}</h4>
        <table className="sv-mini-table">
          <tbody>
            {v.links.map(l => (
              <tr key={l.orderId}>
                <td><OrderChip id={l.orderId} number={l.orderNumber} noLink={readOnly} /></td>
                <td>{l.blNumbers.length ? l.blNumbers.map(b => <span key={b} className="sv-chip sv-chip--bl">BL {b}</span>) : <span className="pr-faint">{t('svWholeOrder')}</span>}</td>
                <td className="sv-num">{money(l.montant)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {v.remarque && <p className="sv-note">{v.remarque}</p>}
      </section>
      <section>
        <h4>{t('svPayments')} {v.reste > 0 && v.typeFacture !== 'avoir' && <button type="button" className="sv-link" onClick={() => setModal({ kind: 'pay', factureId: v.id })}><Plus size={13} /> {t('svPayInvoice')}</button>}</h4>
        {v.payments.length === 0 ? <p className="pr-faint">{t('svNoPayment')}</p> : (
          <table className="sv-mini-table">
            <tbody>
              {v.payments.map(p => (
                <tr key={p.id}>
                  <td className="pr-date">{fmtDate(p.date)}</td>
                  <td className="sv-num pr-strong">{money(p.montant)}</td>
                  <td>{modeLabel(p.mode)}{p.reference ? ` · ${p.reference}` : ''}</td>
                  <td className="pr-faint">{p.note}{p.by ? ` — ${p.by}` : ''}</td>
                  <td><button type="button" className="sv-mini sv-mini--del" onClick={() => delPayment(p)} title={t('deleteAction')}><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section>
        <h4>{t('tdColumn')}
          {!readOnly && <>
            <button type="button" className="sv-link" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? <LoaderCircle size={13} className="spin" /> : <Plus size={13} />} {t('svAddFile')}</button>
            <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
          </>}
        </h4>
        {v.documents.length === 0 ? <p className="sv-missing">{t('svNoFile')}</p> : (
          <div className="sv-docs">
            {v.documents.map(d => (
              <span key={d.id} className="sv-doc-wrap"><DocLink doc={d} /><DocDownload doc={d} />{!readOnly && <button type="button" className="sv-mini sv-mini--del" onClick={() => delDoc(d)} title={t('deleteAction')}><Trash2 size={12} /></button>}</span>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ═══════════════════════════════ Bons de livraison ═══════════════════════════════ */
function BlsTable({ rows, data, setModal }) {
  const { t } = useLanguage();
  const invoiceIt = (r) => setModal({ kind: 'facture', preset: { supplierId: r.supplierId, links: r.orders.map(o => ({ orderId: o.orderId, blNumbers: [r.blNumber] })) } });
  return (
    <table className="pr-table sv-table">
      <thead>
        <tr>
          <th>{t('orDate')}</th><th>{t('ocfCompany')}</th><th>{t('orSupplier')}</th><th>{t('svBlNo')}</th><th>{t('svOrders')}</th>
          <th className="sv-num">{t('svReceivedAmount')}</th><th>{t('svReception')}</th><th>{t('svInvoice')}</th><th>{t('tdColumn')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.key} className="sv-row">
            <td className="pr-date">{fmtDate(r.date)}</td>
            <td><CompanyTag name={r.companyName} color={r.companyColor} /></td>
            <td className="pr-strong">{r.supplierName || '—'}</td>
            <td className="pr-num"><strong>{r.blNumber}</strong></td>
            <td className="sv-links">{r.orders.map(o => <OrderChip key={o.orderId} id={o.orderId} number={o.number} tone={o.pending ? 'pending' : ''} />)}</td>
            <td className="sv-num pr-strong">{r.received ? money(r.montant) : <span className="pr-faint">—</span>}</td>
            <td>{r.pending ? <span className="pr-bl-pending">{t('rbPendingChip')}</span> : <span className="sv-status sv-status--paid"><Check size={12} /> {t('svReceivedShort')}</span>}</td>
            <td>
              {r.factures.length
                ? r.factures.map(f => <span key={f.id} className={`sv-chip sv-chip--inv${f.statut === 'paye' ? ' is-paid' : ''}`}>{f.number || t('svNoNumber')}</span>)
                : <button type="button" className="sv-link" onClick={() => invoiceIt(r)}><Plus size={13} /> {t('svInvoiceIt')}</button>}
            </td>
            <td><div className="sv-docs">{r.docs.length ? r.docs.map(d => <DocLink key={d.id} doc={d} />) : <span className="pr-faint">—</span>}</div></td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={5} className="pr-totals-label">{t('orTotalsShown')}</td>
          <td className="sv-num"><strong>{money(data.totals?.montant)}</strong></td>
          <td colSpan={3} className="pr-totals-pay">{t('svNotInvoicedTotal')} <strong>{money(data.totals?.nonFacture)}</strong></td>
        </tr>
      </tfoot>
    </table>
  );
}

/* ═══════════════════════════════ Bons de commande ═══════════════════════════════ */
const ORDER_STATUS = { envoye: 'svStSent', partielle: 'svStPartial', recue: 'svStReceived', annulee: 'svStCancelled' };
function OrdersTable({ rows, data, setModal, onChanged, readOnly }) {
  const { t } = useLanguage();
  const saveNote = async (r, value) => {
    if (value === r.remarque) return;
    try { await axios.patch(`${API_URL}/order-tracking`, { orderId: r.orderId, blNumber: '', remarque: value }); onChanged(); }
    catch (e) { dialog.alert(errorMessage(e, t('errSave'))); }
  };
  const invoiceIt = (r) => setModal({ kind: 'facture', preset: { supplierId: r.supplierId, links: [{ orderId: r.orderId, blNumbers: r.bls.filter(b => b.received && !b.invoiced).map(b => b.blNumber) }] } });
  return (
    <table className="pr-table sv-table">
      <thead>
        <tr>
          <th>{t('orDate')}</th><th>{t('ocfCompany')}</th><th>{t('orSupplier')}</th><th>{t('orBcNo')}</th><th>{t('orOrderState')}</th>
          <th className="sv-num">{t('orAmountBC')}</th><th className="sv-num">{t('svReceivedCol')}</th><th className="sv-num">{t('svInvoicedCol')}</th><th className="sv-num">{t('svToInvoiceCol')}</th>
          <th>BL</th><th>{t('svInvoices')}</th><th style={{ minWidth: 160 }}>{t('orRemark')}</th><th />
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.orderId} className="sv-row">
            <td className="pr-date">{fmtDate(r.date)}</td>
            <td><CompanyTag name={r.companyName} color={r.companyColor} /></td>
            <td className="pr-strong">{r.supplierName || '—'}</td>
            <td><OrderChip id={r.orderId} number={r.number} noLink={readOnly} /></td>
            <td><span className={`sv-st sv-st--${r.status}`}>{t(ORDER_STATUS[r.status] || 'svStSent')}</span></td>
            <td className="sv-num">{money(r.montantBC)}</td>
            <td className="sv-num">{money(r.montantRecu)}</td>
            <td className="sv-num">{money(r.montantFacture)}</td>
            <td className={`sv-num pr-strong${r.resteAFacturer > 0 && r.status !== 'annulee' ? ' sv-warn' : ''}`}>{money(r.resteAFacturer)}</td>
            <td className="sv-links">
              {r.bls.length ? r.bls.map(b => (
                <span key={b.blNumber} className={`sv-chip sv-chip--bl${b.pending ? ' sv-chip--pending' : ''}${b.invoiced ? ' is-invoiced' : ''}`}
                  title={b.pending ? t('rbPendingHint') : `${money(b.montant)}${b.invoiced ? ` · ${t('svInvoiced')}` : ''}`}
                  onClick={() => b.docs[0] && viewDoc(b.docs[0])} role={b.docs[0] ? 'button' : undefined}>
                  {b.blNumber}{b.docs.length > 0 && <Paperclip size={10} />}
                </span>
              )) : <span className="pr-faint">—</span>}
            </td>
            <td className="sv-links">{r.factures.length ? r.factures.map(f => <span key={f.id} className={`sv-chip sv-chip--inv${f.statut === 'paye' ? ' is-paid' : ''}`} title={money(f.montant)}>{f.number || t('svNoNumber')}</span>) : <span className="pr-faint">—</span>}</td>
            <td>
              {readOnly ? <span className="sv-note-ro">{r.remarque || '—'}</span> : (
                <input type="text" defaultValue={r.remarque} key={`${r.orderId}-${r.remarque}`} placeholder="—" className="pr-cell-input pr-cell-input--wide"
                  onBlur={e => saveNote(r, e.target.value)} />
              )}
            </td>
            <td className="sv-row-actions">
              {!readOnly && r.status !== 'annulee' && <button type="button" className="sv-mini" title={t('svAddBl')} onClick={() => setModal({ kind: 'bl', preset: { supplierId: r.supplierId, orderIds: [r.orderId] } })}><Truck size={14} /></button>}
              {!readOnly && r.status !== 'annulee' && <button type="button" className="sv-mini sv-mini--inv" title={t('svInvoiceIt')} onClick={() => invoiceIt(r)}><Receipt size={14} /></button>}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={5} className="pr-totals-label">{t('orTotalsShown')}</td>
          <td className="sv-num">{money(data.totals?.montantBC)}</td><td className="sv-num">{money(data.totals?.montantRecu)}</td>
          <td className="sv-num">{money(data.totals?.montantFacture)}</td><td className="sv-num"><strong>{money(data.totals?.resteAFacturer)}</strong></td>
          <td colSpan={4} />
        </tr>
      </tfoot>
    </table>
  );
}

/* ═══════════════════════════════ Shared: supplier + its purchase orders ═══════════════════════════════ */
function useSuppliers() {
  const [list, setList] = useState([]);
  useEffect(() => { axios.get(`${API_URL}/fournisseurs`).then(r => setList((r.data || []).slice().sort((a, b) => a.name.localeCompare(b.name)))).catch(() => {}); }, []);
  return list;
}
function useCandidates(supplierId, factureId) {
  const [list, setList] = useState(null);
  useEffect(() => {
    if (!supplierId) { setList(null); return; }
    setList(null);
    axios.get(`${API_URL}/factures-candidates`, { params: { supplierId, factureId: factureId || '' } })
      .then(r => setList(r.data || [])).catch(() => setList([]));
  }, [supplierId, factureId]);
  return list;
}
function Modal({ title, icon, onClose, children, footer, wide = false, busy = false }) {
  const { t } = useLanguage();
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose, busy]);
  return (
    <div className="modal-overlay" onClick={() => !busy && onClose()}>
      <div className={`modal sv-modal${wide ? ' sv-modal--wide' : ''}`} onClick={e => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="sv-modal__head">
          <h2>{icon}{title}</h2>
          <button type="button" className="sv-x" onClick={onClose} disabled={busy} aria-label={t('close')}><X size={16} /></button>
        </div>
        <div className="sv-modal__body">{children}</div>
        <div className="modal-actions">{footer}</div>
      </div>
    </div>
  );
}
function FilePicker({ files, setFiles, required = false }) {
  const { t } = useLanguage();
  const ref = useRef(null);
  const [drag, setDrag] = useState(false);
  const add = (list) => {
    const ok = Array.from(list || []).filter(okType);
    if (ok.length < Array.from(list || []).length) dialog.alert(t('svBadFiles'));
    setFiles(f => [...f, ...ok]);
  };
  return (
    <div className={`sv-drop${drag ? ' is-drag' : ''}`} onClick={() => ref.current?.click()}
      onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}>
      <input ref={ref} type="file" accept={ACCEPT} multiple hidden onChange={e => { add(e.target.files); e.target.value = ''; }} />
      <Paperclip size={16} />
      <span>{t(required ? 'svDropRequired' : 'svDrop')}</span>
      {files.length > 0 && (
        <div className="sv-drop__files" onClick={e => e.stopPropagation()}>
          {files.map((f, i) => (
            <span key={i} className="sv-drop__file">{f.name}<button type="button" onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))} aria-label={t('deleteAction')}><X size={12} /></button></span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════ Ajouter / modifier une facture ═══════════════════════════════ */
export function FactureModal({ facture, preset, onClose, onSaved }) {
  const { t } = useLanguage();
  const suppliers = useSuppliers();
  const [supplierId, setSupplierId] = useState(facture?.supplierId || preset?.supplierId || '');
  const candidates = useCandidates(supplierId, facture?.id);
  const [number, setNumber] = useState(facture?.number || '');
  const [date, setDate] = useState(facture ? ymd(facture.date) : today());
  const [type, setType] = useState(facture?.typeFacture || 'facture');
  const [remarque, setRemarque] = useState(facture?.remarque || '');
  const [montant, setMontant] = useState(facture ? String(facture.montant) : '');
  const [montantTouched, setMontantTouched] = useState(!!facture);
  // selection: orderId → { bls: Set, montant: '', touched }
  const [sel, setSel] = useState(() => new Map((facture?.links || preset?.links || []).map(l => [l.orderId, { bls: new Set(l.blNumbers || []), montant: l.montant != null ? String(l.montant) : '', touched: l.montant != null }])));
  const [files, setFiles] = useState([]);
  const [filter, setFilter] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // default amount of a selected order: its chosen BL, else what is received and not invoiced yet, else the order
  const defaultAmount = useCallback((c, bls) => {
    if (bls.size) return r2(c.bls.filter(b => bls.has(b.blNumber)).reduce((s, b) => s + (b.montant || 0), 0));
    if (c.montantRecu > 0) return Math.max(0, r2(c.montantRecu - c.montantFacture));
    return Math.max(0, r2(c.montantBC - c.montantFacture));
  }, []);
  const byId = useMemo(() => new Map((candidates || []).map(c => [c.orderId, c])), [candidates]);
  // fill the amounts of the preselected orders once their figures are known
  useEffect(() => {
    if (!candidates) return;
    setSel(s => { const n = new Map(s); for (const [id, v] of n) { const c = byId.get(id); if (c && !v.touched) n.set(id, { ...v, montant: String(defaultAmount(c, v.bls)) }); } return n; });
  }, [candidates, byId, defaultAmount]);
  const allocTotal = r2([...sel.values()].reduce((s, v) => s + (Number(String(v.montant).replace(',', '.')) || 0), 0));
  useEffect(() => { if (!montantTouched) setMontant(allocTotal ? String(allocTotal) : ''); }, [allocTotal, montantTouched]);

  const toggleOrder = (c) => setSel(s => {
    const n = new Map(s);
    if (n.has(c.orderId)) n.delete(c.orderId);
    else { const bls = new Set(c.bls.filter(b => b.received && !b.invoiced).map(b => b.blNumber)); n.set(c.orderId, { bls, montant: String(defaultAmount(c, bls)), touched: false }); }
    return n;
  });
  const toggleBl = (c, bl) => setSel(s => {
    const n = new Map(s); const v = n.get(c.orderId); if (!v) return s;
    const bls = new Set(v.bls); bls.has(bl) ? bls.delete(bl) : bls.add(bl);
    n.set(c.orderId, { ...v, bls, montant: v.touched ? v.montant : String(defaultAmount(c, bls)) });
    return n;
  });
  const setAlloc = (id, value) => setSel(s => { const n = new Map(s); n.set(id, { ...n.get(id), montant: value, touched: true }); return n; });

  const shown = (candidates || []).filter(c => {
    if (sel.has(c.orderId)) return true;
    if (c.status === 'annulee') return false;
    if (onlyOpen && c.montantFacture >= Math.max(c.montantRecu, c.montantBC) - 0.009 && c.montantFacture > 0) return false;
    const f = filter.trim().toLowerCase();
    return !f || [c.number, ...c.bls.map(b => b.blNumber)].join(' ').toLowerCase().includes(f);
  }).sort((a, b) => (sel.has(b.orderId) ? 1 : 0) - (sel.has(a.orderId) ? 1 : 0)); // ticked orders first
  const total = Number(String(montant).replace(',', '.')) || 0;
  const diff = r2(total - allocTotal);

  const save = async (force = false) => {
    setError('');
    if (!supplierId) return setError(t('svPickSupplier'));
    if (!number.trim()) return setError(t('svNumberRequired'));
    if (!sel.size) return setError(t('svPickOrders'));
    const body = {
      number: number.trim(), date: date || null, typeFacture: type, remarque, supplierId, montant: total,
      links: [...sel.entries()].map(([orderId, v]) => ({ orderId, blNumbers: [...v.bls], montant: Number(String(v.montant).replace(',', '.')) || 0 })),
    };
    setBusy(true);
    try {
      const r = facture ? await axios.put(`${API_URL}/factures/${facture.id}`, body) : await axios.post(`${API_URL}/factures`, body, { params: force ? { force: 1 } : {} });
      for (const f of files) await sendFile(`${API_URL}/factures/${r.data.id}/documents`, f);
      dialog.toast(t(facture ? 'svInvoiceSaved' : 'svInvoiceCreated'));
      onSaved();
    } catch (e) {
      setBusy(false);
      if (e.response?.status === 409 && e.response.data?.code === 'DUPLICATE_FACTURE') {
        if (await dialog.confirm({ title: t('svDuplicateTitle'), message: e.response.data.error + ' ' + t('svDuplicateAsk'), confirmLabel: t('svCreateAnyway') })) save(true);
        return;
      }
      setError(errorMessage(e, t('dlgError')));
    }
  };

  return (
    <Modal wide busy={busy} icon={<Receipt size={18} />} title={facture ? t('svEditInvoice', { n: facture.number || t('svNoNumber') }) : t('svAddInvoice')} onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} disabled={busy}>{t('cancel')}</button>
        <button type="button" className="primary" onClick={() => save()} disabled={busy}>{busy ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />} {t(facture ? 'save' : 'svCreateInvoice')}</button>
      </>}>
      <div className="sv-grid">
        <label className="sv-field sv-field--wide"><span>{t('orSupplier')} *</span>
          <select value={supplierId} onChange={e => { setSupplierId(e.target.value); setSel(new Map()); }} disabled={!!facture}>
            <option value="">{t('orChoose')}</option>
            {suppliers.map(s => <option key={s.id || s._id} value={s.id || s._id}>{s.name}</option>)}
          </select>
        </label>
        <label className="sv-field"><span>{t('acInvoiceNo')} *</span><input value={number} onChange={e => setNumber(e.target.value)} placeholder="FA-2026-…" /></label>
        <label className="sv-field"><span>{t('acInvoiceDate')}</span><input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <label className="sv-field"><span>{t('orInvoiceType')}</span>
          <select value={type} onChange={e => setType(e.target.value)}>{FACTURE_TYPES.map(o => <option key={o.value} value={o.value}>{t(o.label)}</option>)}</select>
        </label>
        <label className="sv-field"><span>{t('svAmountTtc')}</span>
          <input type="number" min="0" step="0.01" value={montant} onChange={e => { setMontant(e.target.value); setMontantTouched(true); }} />
          {montantTouched && Math.abs(diff) > 0.009 && sel.size > 0 && (
            <em className="sv-hint sv-hint--warn">{t('svDiff', { d: money(diff), s: money(allocTotal) })} <button type="button" className="sv-link" onClick={() => setMontantTouched(false)}>{t('svUseSum')}</button></em>
          )}
        </label>
      </div>

      <div className="sv-pick">
        <div className="sv-pick__head">
          <strong>{t('svCoveredOrders')} <span className="sv-count">{sel.size}</span></strong>
          {supplierId && candidates && (
            <>
              <div className="sv-search sv-search--sm"><Search size={13} /><input value={filter} onChange={e => setFilter(e.target.value)} placeholder={t('svFilterOrders')} /></div>
              <label className="sv-check"><input type="checkbox" checked={onlyOpen} onChange={e => setOnlyOpen(e.target.checked)} /> {t('svOnlyNotInvoiced')}</label>
            </>
          )}
        </div>
        {!supplierId ? <p className="pr-faint">{t('svPickSupplierFirst')}</p> : !candidates ? <p className="pr-faint"><LoaderCircle size={14} className="spin" /> {t('loadingShort')}</p> : shown.length === 0 ? <p className="pr-faint">{t('svNoOrdersForSupplier')}</p> : (
          <div className="sv-pick__list">
            {shown.map(c => {
              const v = sel.get(c.orderId);
              return (
                <div key={c.orderId} className={`sv-cand${v ? ' is-on' : ''}`}>
                  <label className="sv-cand__main">
                    <input type="checkbox" checked={!!v} onChange={() => toggleOrder(c)} />
                    <strong>{c.number}</strong>
                    <CompanyTag name={c.companyName} color={c.companyColor} />
                    <span className="pr-faint">{fmtDate(c.date)}</span>
                    <span className="sv-cand__nums">
                      {t('svCandBc')} <b>{money(c.montantBC)}</b> · {t('svCandReceived')} <b>{money(c.montantRecu)}</b> · {t('svCandInvoiced')} <b>{money(c.montantFacture)}</b>
                    </span>
                  </label>
                  {v && (
                    <div className="sv-cand__sub">
                      {c.bls.length > 0 && (
                        <div className="sv-cand__bls">
                          <span className="sv-cand__k">BL</span>
                          {c.bls.map(b => (
                            <label key={b.blNumber} className={`sv-bl-pick${v.bls.has(b.blNumber) ? ' is-on' : ''}${b.pending ? ' is-pending' : ''}`} title={b.invoiced ? t('svBlAlreadyInvoiced') : ''}>
                              <input type="checkbox" checked={v.bls.has(b.blNumber)} onChange={() => toggleBl(c, b.blNumber)} />
                              {b.blNumber} <em>{b.pending ? t('rbPendingChip') : money(b.montant)}</em>{b.invoiced && <AlertTriangle size={11} />}
                            </label>
                          ))}
                        </div>
                      )}
                      <label className="sv-cand__amount"><span>{t('svPartOfInvoice')}</span>
                        <input type="number" min="0" step="0.01" value={v.montant} onChange={e => setAlloc(c.orderId, e.target.value)} />
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="sv-grid">
        <label className="sv-field sv-field--wide"><span>{t('orRemark')}</span><input value={remarque} onChange={e => setRemarque(e.target.value)} placeholder="—" /></label>
      </div>
      {facture?.documents?.length > 0 && <div className="sv-docs">{facture.documents.map(d => <DocLink key={d.id} doc={d} />)}</div>}
      <FilePicker files={files} setFiles={setFiles} />
      {error && <div className="rb-error"><AlertTriangle size={14} />{error}</div>}
    </Modal>
  );
}

/* ═══════════════════════════════ Ajouter un BL ═══════════════════════════════ */
function BlModal({ preset, onClose, onSaved }) {
  const { t } = useLanguage();
  const suppliers = useSuppliers();
  const [supplierId, setSupplierId] = useState(preset?.supplierId || '');
  const candidates = useCandidates(supplierId, '');
  const [blNumber, setBlNumber] = useState('');
  const [sel, setSel] = useState(() => new Set(preset?.orderIds || []));
  const [files, setFiles] = useState([]);
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const shown = (candidates || []).filter(c => sel.has(c.orderId) || (c.status !== 'annulee' && (all || c.status === 'envoye' || c.status === 'partielle')));
  const toggle = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const save = async () => {
    setError('');
    if (!sel.size) return setError(t('svPickOrders'));
    if (!files.length) return setError(t('svFileRequired'));
    const no = blNumber.trim() || fileBase(files[0].name);
    if (!no) return setError(t('orBlRequired'));
    setBusy(true);
    try {
      for (const f of files) await sendFile(`${API_URL}/order-tracking/bl`, f, { orderIds: [...sel].join(','), blNumber: no });
      dialog.toast(t('svBlAdded', { n: no, c: sel.size }));
      onSaved();
    } catch (e) { setBusy(false); setError(errorMessage(e, t('dlgError'))); }
  };
  return (
    <Modal busy={busy} icon={<Truck size={18} />} title={t('svAddBl')} onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} disabled={busy}>{t('cancel')}</button>
        <button type="button" className="primary" onClick={save} disabled={busy}>{busy ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />} {t('svSaveBl')}</button>
      </>}>
      <div className="sv-grid">
        <label className="sv-field sv-field--wide"><span>{t('orSupplier')} *</span>
          <select value={supplierId} onChange={e => { setSupplierId(e.target.value); setSel(new Set()); }}>
            <option value="">{t('orChoose')}</option>
            {suppliers.map(s => <option key={s.id || s._id} value={s.id || s._id}>{s.name}</option>)}
          </select>
        </label>
        <label className="sv-field sv-field--wide"><span>{t('svBlNo')}</span><input value={blNumber} onChange={e => setBlNumber(e.target.value)} placeholder={t('svBlNoPh')} /></label>
      </div>
      <div className="sv-pick">
        <div className="sv-pick__head">
          <strong>{t('svBlOrders')} <span className="sv-count">{sel.size}</span></strong>
          {supplierId && <label className="sv-check"><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} /> {t('svShowAllOrders')}</label>}
        </div>
        {!supplierId ? <p className="pr-faint">{t('svPickSupplierFirst')}</p> : !candidates ? <p className="pr-faint"><LoaderCircle size={14} className="spin" /> {t('loadingShort')}</p> : shown.length === 0 ? <p className="pr-faint">{t('svNoOpenOrders')}</p> : (
          <div className="sv-pick__list">
            {shown.map(c => (
              <label key={c.orderId} className={`sv-cand sv-cand__main${sel.has(c.orderId) ? ' is-on' : ''}`}>
                <input type="checkbox" checked={sel.has(c.orderId)} onChange={() => toggle(c.orderId)} />
                <strong>{c.number}</strong>
                <CompanyTag name={c.companyName} color={c.companyColor} />
                <span className="pr-faint">{fmtDate(c.date)}</span>
                <span className={`sv-st sv-st--${c.status}`}>{t(ORDER_STATUS[c.status] || 'svStSent')}</span>
                <span className="sv-cand__nums">{c.bls.length ? `BL : ${c.bls.map(b => b.blNumber).join(', ')}` : t('svNoBlYet')}</span>
              </label>
            ))}
          </div>
        )}
      </div>
      <FilePicker files={files} setFiles={setFiles} required />
      <p className="sv-hint">{t('svBlHint')}</p>
      {error && <div className="rb-error"><AlertTriangle size={14} />{error}</div>}
    </Modal>
  );
}

/* ═══════════════════════════════ Payer une facture ═══════════════════════════════ */
function PayModal({ factureId, onClose, onSaved }) {
  const { t } = useLanguage();
  const [id, setId] = useState(factureId || '');
  const [facture, setFacture] = useState(null);
  const [search, setSearch] = useState('');
  const [list, setList] = useState(null);
  const [montant, setMontant] = useState('');
  const [date, setDate] = useState(today());
  const [mode, setMode] = useState('virement');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // invoices still to pay (when opened from the toolbar)
  useEffect(() => {
    if (id) return undefined;
    const timer = setTimeout(() => {
      axios.get(`${API_URL}/factures`, { params: { status: 'a_payer', limit: 100, page: 1, q: search.trim() } })
        .then(r => setList(r.data.rows || [])).catch(() => setList([]));
    }, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [id, search]);
  useEffect(() => {
    if (!id) { setFacture(null); return; }
    axios.get(`${API_URL}/factures/${id}`).then(r => { setFacture(r.data); setMontant(String(r.data.reste)); }).catch(e => setError(errorMessage(e, t('dlgError'))));
  }, [id, t]);
  const save = async () => {
    setError('');
    const m = Number(String(montant).replace(',', '.'));
    if (!(m > 0)) return setError(t('svAmountRequired'));
    setBusy(true);
    try {
      const r = await axios.post(`${API_URL}/factures/${facture.id}/payments`, { montant: m, date, mode, reference, note });
      dialog.toast(t(r.data.statut === 'paye' ? 'svPaidFull' : 'svPaidPart', { r: money(r.data.reste) }));
      onSaved();
    } catch (e) { setBusy(false); setError(errorMessage(e, t('dlgError'))); }
  };
  return (
    <Modal busy={busy} icon={<Wallet size={18} />} title={t('svPayInvoice')} onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} disabled={busy}>{t('cancel')}</button>
        {facture && <button type="button" className="primary" onClick={save} disabled={busy || facture.reste <= 0}>{busy ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />} {t('svRecordPayment')}</button>}
      </>}>
      {!facture ? (
        <>
          <div className="sv-search"><Search size={15} /><input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder={t('svSearchInvoices')} /></div>
          <div className="sv-pick__list sv-pay-list">
            {!list ? <p className="pr-faint"><LoaderCircle size={14} className="spin" /> {t('loadingShort')}</p> : list.length === 0 ? <p className="pr-faint">{t('svNothingToPay')}</p> : list.map(v => (
              <button key={v.id} type="button" className="sv-pay-pick" onClick={() => setId(v.id)}>
                <strong>{v.number || t('svNoNumber')}</strong><span>{v.supplierName}</span><CompanyTag name={v.companyName} color={v.companyColor} />
                <span className="pr-faint">{fmtDate(v.date)}</span>
                <span className="sv-pay-pick__left">{t('svLeft')} <b>{money(v.reste)}</b></span>
                {v.retardJours > 0 && <span className="sv-status sv-status--late">{t('svLateDays', { n: v.retardJours })}</span>}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="sv-pay-head">
            <div><span>{t('acInvoiceNo')}</span><strong>{facture.number || t('svNoNumber')}</strong></div>
            <div><span>{t('orSupplier')}</span><strong>{facture.supplierName}</strong></div>
            <div><span>{t('svAmount')}</span><strong>{money(facture.montant)}</strong></div>
            <div><span>{t('svPaidCol')}</span><strong>{money(facture.paye)}</strong></div>
            <div><span>{t('svLeft')}</span><strong className={facture.retardJours > 0 ? 'is-bad' : ''}>{money(facture.reste)}</strong></div>
          </div>
          {!factureId && <button type="button" className="sv-link" onClick={() => { setId(''); setFacture(null); }}><ChevronLeft size={13} /> {t('svOtherInvoice')}</button>}
          {facture.payments.length > 0 && (
            <table className="sv-mini-table sv-pay-history">
              <tbody>{facture.payments.map(p => (
                <tr key={p.id}><td className="pr-date">{fmtDate(p.date)}</td><td className="sv-num">{money(p.montant)}</td><td>{t(PAY_MODES.find(x => x.value === p.mode)?.label || '—')}{p.reference ? ` · ${p.reference}` : ''}</td></tr>
              ))}</tbody>
            </table>
          )}
          {facture.reste > 0 ? (
            <div className="sv-grid">
              <label className="sv-field"><span>{t('acPaidAmount')} *</span>
                <input type="number" min="0" step="0.01" value={montant} onChange={e => setMontant(e.target.value)} />
                <em className="sv-hint">{t('svPayHint', { r: money(facture.reste) })}</em>
              </label>
              <label className="sv-field"><span>{t('acPaymentDate')}</span><input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
              <label className="sv-field"><span>{t('orPaymentMode')}</span>
                <select value={mode} onChange={e => setMode(e.target.value)}>{PAY_MODES.map(o => <option key={o.value} value={o.value}>{t(o.label)}</option>)}</select>
              </label>
              <label className="sv-field"><span>{t('svPayRef')}</span><input value={reference} onChange={e => setReference(e.target.value)} placeholder={t('svPayRefPh')} /></label>
              <label className="sv-field sv-field--wide"><span>{t('optionalReason')}</span><input value={note} onChange={e => setNote(e.target.value)} placeholder="—" /></label>
            </div>
          ) : <p className="sv-status sv-status--paid"><Check size={13} /> {t('svAlreadyPaid')}</p>}
        </>
      )}
      {error && <div className="rb-error"><AlertTriangle size={14} />{error}</div>}
    </Modal>
  );
}

/* ═══════════════════════════════ Mail : relevé des factures pour la comptabilité ═══════════════════════════════ */
const firstOfMonth = (offset = 0) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offset); return ymd(d); };
const lastOfMonth = (offset = 0) => { const d = new Date(); d.setMonth(d.getMonth() + offset + 1, 0); return ymd(d); };
// Saves a file the server built (blob) under its French name
const saveBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};
// readable error from a blob answer
const blobError = async (e, fallback) => {
  try { if (e.response?.data instanceof Blob) { const j = JSON.parse(await e.response.data.text()); return j.error || fallback; } } catch { /* not JSON */ }
  return errorMessage(e, fallback);
};

function MailModal({ onClose }) {
  const { t } = useLanguage();
  const [from, setFrom] = useState(firstOfMonth(0));
  const [to, setTo] = useState(today());
  const [data, setData] = useState(null);       // { rows, mail, names }
  const [sel, setSel] = useState(new Set());
  const [company, setCompany] = useState('all');
  const [mail, setMail] = useState(null);       // { from, to, cc }
  const [busy, setBusy] = useState(null);       // 'xlsx' | 'pdf' | 'eml'
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [showSent, setShowSent] = useState(false); // invoices already sent in a previous mail
  const [marked, setMarked] = useState([]);        // ids marked as sent by the last mail (to undo)
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!from || !to) return undefined;
    let alive = true;
    setData(null); setError('');
    axios.get(`${API_URL}/factures-releve`, { params: { from, to } })
      .then(r => {
        if (!alive) return;
        setData(r.data);
        setSel(new Set(r.data.rows.filter(v => !v.releve).map(v => v.id))); // every invoice not sent yet, by default
        setMail(m => m || { from: r.data.mail.from, to: r.data.mail.to, cc: r.data.mail.cc });
      })
      .catch(e => alive && setError(errorMessage(e, t('dlgError'))));
    return () => { alive = false; };
  }, [from, to, t, reload]);

  const inCompany = (data?.rows || []).filter(v => company === 'all' || (company === 'none' ? !v.companyId : v.companyId === company));
  const sentCount = inCompany.filter(v => v.releve).length;
  const rows = showSent ? inCompany : inCompany.filter(v => !v.releve);
  const chosen = rows.filter(v => sel.has(v.id));
  const total = r2(chosen.reduce((s, v) => s + (v.typeFacture === 'avoir' ? -v.montant : v.montant), 0));
  const noFile = chosen.filter(v => !v.documents.length);
  const toggle = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOn = rows.length > 0 && rows.every(v => sel.has(v.id));
  const toggleAll = () => setSel(s => { const n = new Set(s); rows.forEach(v => (allOn ? n.delete(v.id) : n.add(v.id))); return n; });
  const companies = [...new Map((data?.rows || []).map(v => [v.companyId || 'none', { id: v.companyId || 'none', name: v.companyName || t('ocfNoCompany'), color: v.companyColor }])).values()];
  const names = data?.names;
  const subject = data?.mail?.subject || '';
  const body = data?.mail?.body || '';

  const build = async (format) => {
    setError(''); setDone('');
    if (!chosen.length) return setError(t('svMailPick'));
    setBusy(format);
    try {
      const ids = chosen.map(v => v.id);
      const r = await axios.post(`${API_URL}/factures-releve/${format}`, { from, to, ids, mail, resend: chosen.some(v => v.releve) }, { responseType: 'blob' });
      saveBlob(r.data, names[format]);
      const skipped = decodeURIComponent(r.headers['x-skipped-files'] || '');
      setDone(t(format === 'eml' ? 'svMailEmlDone' : 'svMailFileDone', { name: names[format] }) + (skipped ? ` ${t('svMailSkipped', { list: skipped })}` : ''));
      if (format === 'eml') { setMarked(ids); setReload(n => n + 1); } // they are now « sent »: not offered again
    } catch (e) { setError(await blobError(e, t('dlgError'))); }
    finally { setBusy(null); }
  };
  // the mail was not sent after all: offer these invoices again
  const undoSent = async () => {
    setError('');
    try {
      await axios.delete(`${API_URL}/factures-releve/sent`, { data: { ids: marked } });
      setDone(t('svMailUndone', { n: marked.length })); setMarked([]); setReload(n => n + 1);
    } catch (e) { setError(errorMessage(e, t('dlgError'))); }
  };
  // Outlook / default mail app, without attachments (files to attach by hand)
  const mailto = () => {
    const q = new URLSearchParams({ cc: mail?.cc || '', subject, body }).toString().replace(/\+/g, '%20');
    window.location.href = `mailto:${mail?.to || ''}?${q}`;
  };

  return (
    <Modal wide busy={!!busy} icon={<Mail size={18} />} title={t('svMailTitle')} onClose={onClose}
      footer={<>
        <button type="button" className="sv-link sv-mailto" onClick={mailto} disabled={!data}>{t('svMailNoAttach')}</button>
        <span className="sv-spacer" />
        <button type="button" onClick={() => build('xlsx')} disabled={!!busy || !chosen.length}>{busy === 'xlsx' ? <LoaderCircle size={15} className="spin" /> : <Sheet size={15} />} {t('svMailXlsx')}</button>
        <button type="button" onClick={() => build('pdf')} disabled={!!busy || chosen.length === noFile.length}>{busy === 'pdf' ? <LoaderCircle size={15} className="spin" /> : <FileText size={15} />} {t('svMailPdf')}</button>
        <button type="button" className="primary" onClick={() => build('eml')} disabled={!!busy || !chosen.length}>{busy === 'eml' ? <LoaderCircle size={15} className="spin" /> : <Mail size={15} />} {t('svMailOutlook')}</button>
      </>}>
      {/* 1. period */}
      <div className="sv-mail-period">
        <label className="sv-field"><span>{t('svMailFrom')}</span><input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} /></label>
        <label className="sv-field"><span>{t('svMailTo')}</span><input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} /></label>
        <div className="sv-mail-quick">
          <button type="button" className="sv-link" onClick={() => { setFrom(firstOfMonth(0)); setTo(today()); }}>{t('svMailThisMonth')}</button>
          <button type="button" className="sv-link" onClick={() => { setFrom(firstOfMonth(-1)); setTo(lastOfMonth(-1)); }}>{t('svMailLastMonth')}</button>
        </div>
      </div>

      {/* 2. invoices */}
      <div className="sv-pick">
        <div className="sv-pick__head">
          <strong>{t('svMailInvoices')} <span className="sv-count">{chosen.length} / {rows.length}</span></strong>
          {companies.length > 1 && (
            <div className="pr-filter-tabs">
              <button type="button" className={`pr-filter-tab ${company === 'all' ? 'active' : ''}`} onClick={() => setCompany('all')}>{t('ocfAllCompanies')}</button>
              {companies.map(c => <button key={c.id} type="button" className={`pr-filter-tab ${company === c.id ? 'active' : ''}`} onClick={() => setCompany(c.id)}>{c.name}</button>)}
            </div>
          )}
          {sentCount > 0 && <label className="sv-check sv-check--sent"><input type="checkbox" checked={showSent} onChange={e => setShowSent(e.target.checked)} /> {t('svMailShowSent', { n: sentCount })}</label>}
          {rows.length > 0 && <label className="sv-check"><input type="checkbox" checked={allOn} onChange={toggleAll} /> {t('selectAll')}</label>}
        </div>
        {!data ? <p className="pr-faint"><LoaderCircle size={14} className="spin" /> {t('loadingShort')}</p> : rows.length === 0 ? <p className="pr-faint">{sentCount ? t('svMailAllSent', { n: sentCount }) : t('svMailNone')}</p> : (
          <div className="sv-pick__list">
            {rows.map(v => (
              <label key={v.id} className={`sv-cand sv-cand__main sv-mail-row${sel.has(v.id) ? ' is-on' : ''}${v.releve ? ' is-sent' : ''}`}>
                <input type="checkbox" checked={sel.has(v.id)} onChange={() => toggle(v.id)} />
                <span className="pr-date">{fmtDate(v.date || v.createdAt)}</span>
                <CompanyTag name={v.companyName} color={v.companyColor} />
                <strong>{v.number || t('svNoNumber')}</strong>
                <span>{v.supplierName}</span>
                <span className="pr-faint sv-mail-row__bc">{v.links.map(l => l.orderNumber).join(', ')}</span>
                {!v.documents.length && <span className="sv-missing">{t('svNoFile')}</span>}
                {v.releve && <span className="sv-sent-chip" title={v.releve.span}><MailCheck size={12} /> {t('svMailSentOn', { d: fmtDate(v.releve.sentAt) })}</span>}
                <b className="sv-mail-row__amount">{money(v.montant)}</b>
              </label>
            ))}
          </div>
        )}
        {chosen.length > 0 && (
          <div className="sv-mail-sum">
            {t('svMailTotal', { n: chosen.length })} <b>{money(total)}</b>
            {noFile.length > 0 && <span className="sv-missing"> · {t('svMailNoFileWarn', { n: noFile.length })}</span>}
            {chosen.some(v => v.releve) && <span className="sv-missing"> · {t('svMailResendWarn', { n: chosen.filter(v => v.releve).length })}</span>}
          </div>
        )}
      </div>

      {/* 3. the e-mail */}
      {mail && (
        <div className="sv-mail">
          <div className="sv-grid">
            <label className="sv-field sv-field--wide"><span>{t('svMailFromAddr')}</span><input value={mail.from} onChange={e => setMail(m => ({ ...m, from: e.target.value }))} /></label>
            <label className="sv-field sv-field--wide"><span>{t('svMailToAddr')}</span><input value={mail.to} onChange={e => setMail(m => ({ ...m, to: e.target.value }))} /></label>
            <label className="sv-field sv-field--wide"><span>Cc</span><input value={mail.cc} onChange={e => setMail(m => ({ ...m, cc: e.target.value }))} /></label>
          </div>
          <div className="sv-mail-preview">
            <div className="sv-mail-preview__subject">{subject}</div>
            <div className="sv-mail-preview__body">{body}</div>
            {names && (
              <div className="sv-mail-preview__files">
                <span><Sheet size={13} /> {names.xlsx}</span>
                {chosen.length > noFile.length && <span><FileText size={13} /> {names.pdf}</span>}
              </div>
            )}
          </div>
          <p className="sv-hint">{t('svMailHint')}</p>
        </div>
      )}
      {done && (
        <div className="sv-done"><Check size={14} /> <span className="sv-done__text">{done}</span>
          {marked.length > 0 && <span className="sv-done__sent">{t('svMailMarked', { n: marked.length })} <button type="button" className="sv-link" onClick={undoSent}><Undo2 size={13} /> {t('svMailUndo')}</button></span>}
        </div>
      )}
      {error && <div className="rb-error"><AlertTriangle size={14} />{error}</div>}
    </Modal>
  );
}
