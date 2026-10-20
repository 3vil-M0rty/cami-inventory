import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useLanguage } from '../../context/LanguageContext';
import { useCompany } from '../../context/CompanyContext';
import './OrdersPage.css';
import { exportOrdersExcel, exportOrderPDF } from '../../utils/orderExport';
import { Search, FileText, FilePlus, LoaderCircle, Sheet, Calendar, Pencil, Trash2, ShoppingCart, CheckCheck, Clock, StepBack, CalendarClock, Package, Send, Lock, Ban, Plus, ClipboardList, RefreshCw, X, Check, AlertTriangle, ArrowRight, StickyNote, ChevronLeft, ChevronRight, Truck, PackageCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { dialog, errorMessage } from '../../components/common/dialog';
import { PAGE_PATHS, subPathFromLocation, getQueryParam, setUrl } from '../../routes';
import SuppliersPanel, { SupplierFormModal } from './SuppliersPanel';
import { DocumentsCell, DocumentsModal, StorageGauge, BlDocButtons, OrderDocumentsBlock } from './TrackingDocuments';
import { ReceiveBatchModal, PendingBlsBlock } from './ReceiveBatch';
import { BlsToReceivePanel, OrdersToReceiveList } from './BlsToReceive';
import { useBlsToReceive, canReceiveBls, refreshBls } from './receptionQueue';
import { unitLabel, qtyWithUnit, fmtUnitQty, lineFactor, lineToStock, isConverted } from '../inventory/units';
import { ZoomImg } from '../../components/common/ImagePreview';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

// Last orders list, per user: shown instantly when the page opens, then refreshed in the background.
// Kept in memory (navigation inside the app) and in localStorage (page reload).
const ORDERS_CACHE_PREFIX = 'orders-cache-v1:';
const ordersMemCache = {};
function readOrdersCache(userKey) {
  if (!userKey) return null;
  if (ordersMemCache[userKey]) return ordersMemCache[userKey];
  try {
    const raw = localStorage.getItem(ORDERS_CACHE_PREFIX + userKey);
    const data = raw ? JSON.parse(raw) : null;
    if (Array.isArray(data)) ordersMemCache[userKey] = data;
    return Array.isArray(data) ? data : null;
  } catch { return null; }
}
function writeOrdersCache(userKey, data) {
  if (!userKey) return;
  ordersMemCache[userKey] = data;
  try { localStorage.setItem(ORDERS_CACHE_PREFIX + userKey, JSON.stringify(data)); }
  catch { /* quota exceeded: memory cache is enough */ }
}

const STATUS_COLORS = {
  brouillon: { bg: 'rgba(161,161,170,.12)', text: 'var(--ink-grey)', bd: 'rgba(161,161,170,.3)', label: { fr: 'Brouillon', en: 'Draft', it: 'Bozza' } },
  envoye: { bg: 'rgba(96,165,250,.12)', text: 'var(--ink-blue)', bd: 'rgba(96,165,250,.3)', label: { fr: 'Envoyé', en: 'Sent', it: 'Inviato' } },
  partielle: { bg: 'rgba(251,191,36,.12)', text: 'var(--ink-amber)', bd: 'rgba(251,191,36,.3)', label: { fr: 'Partielle', en: 'Partial', it: 'Parziale' } },
  recue: { bg: 'rgba(74,222,128,.12)', text: 'var(--ink-green)', bd: 'rgba(74,222,128,.3)', label: { fr: 'Reçue', en: 'Received', it: 'Ricevuta' } },
  annulee: { bg: 'rgba(248,113,113,.12)', text: 'var(--ink-red)', bd: 'rgba(248,113,113,.3)', label: { fr: 'Annulée', en: 'Cancelled', it: 'Annullata' } },
};

const CATEGORY_LABELS = {
  aluminium: { fr: 'Aluminium', en: 'Aluminium', it: 'Alluminio' },
  verre: { fr: 'Verre', en: 'Glass', it: 'Vetro' },
  accessoires: { fr: 'Accessoires', en: 'Accessories', it: 'Accessori' },
  poudre: { fr: 'Poudre', en: 'Powder', it: 'Polvere' },
  fer: { fr: 'Fer', en: 'Iron', it: 'Ferro' },
  toles: { fr: 'Tôles', en: 'Tôles', it: 'Tôles' },

};

const CATEGORY_RECEIVE_ROLE = {
  accessoires: 'Magasinier',
  poudre: 'Laquage',
  verre: 'Coordinateur-vitrage',
  aluminium: 'Admin',
  fer: 'Admin',
  toles: 'Admin',

};

// ── Suivi des commandes: static option lists ───────────────────────────────
const FACTURE_OPTIONS = [
  { value: 'non_recue', label: 'orOptNotReceived' },
  { value: 'recue', label: 'orOptReceived' },
];
const PAIEMENT_OPTIONS = [
  { value: '', label: '—' },
  { value: 'espece', label: 'orPayCash' },
  { value: 'virement', label: 'orPayTransfer' },
  { value: 'cheque', label: 'orPayCheque' },
  { value: 'effet', label: 'orPayBill' },
];
const PAIEMENT_STATUS_OPTIONS = [
  { value: 'non_paye', label: 'acPayNone' },
  { value: 'partiel', label: 'acPayPartial' },
  { value: 'paye', label: 'acPayDone' },
];
const ymdInput = (d) => { if (!d) return ''; const x = new Date(d); return isNaN(x) ? '' : `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const money2 = (v) => Number(v || 0).toFixed(2);

const TYPE_FACTURE_OPTIONS = [
  { value: '', label: '—' },
  { value: 'bl', label: 'BL' },
  { value: 'facture', label: 'orTypeInvoice' },
  { value: 'situation', label: 'orTypeSituation' },
];

export default function OrdersPage() {
  const { currentLanguage: lang, t } = useLanguage();
  const { companies, selectedCompany } = useCompany();
  const [orders, setOrders] = useState([]);
  const [displayCount, setDisplayCount] = useState(10);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editOrder, setEditOrder] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null); // detail view
  const [batchReceive, setBatchReceive] = useState(null); // { initialBl } → reception of a whole BL
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [exportingPdf, setExportingPdf] = useState(null);
  const [sendingId, setSendingId] = useState(null);

  // ── Purchase requests (admin → ACHAT) ─────────────────────────────
  const { can, user } = useAuth();               // ← ajouter `user`
  const isAdmin = can('admin.view');
  const canReceiveOrder = (order) => {
    if (isAdmin) return true;
    const orderCats = order.categories || (order.category ? [order.category] : []);
    return orderCats.some(cat => {
      const requiredRole = CATEGORY_RECEIVE_ROLE[cat];
      return requiredRole && user?.role === requiredRole;
    });
  };
  // A line is received by the role of its article's family (same rule as the server)
  const canReceiveLine = (line) => isAdmin || CATEGORY_RECEIVE_ROLE[line.itemId?.superCategory || 'aluminium'] === user?.role;
  const [pendingRequests, setPendingRequests] = useState(0); // badge on the "Demandes admin" tab
  const ORDER_TABS = ['orders', 'reception', 'requests', 'suivi', 'fournisseurs'];
  const [newOrderSupplier, setNewOrderSupplier] = useState(''); // supplier preselected in a new order
  // 'orders' | 'requests' | 'suivi' — kept in the URL (?onglet=suivi) so a refresh stays on the same tab
  // Suivi + Fournisseurs: ACHAT (orders.edit) and the accountant (orders.accounting)
  const canAccounting = can('orders.edit') || can('orders.accounting');
  // Purchase prices: Admin, ACHAT and the accountant only (the server also removes them for the others)
  const canSeePrices = can('admin.view') || canAccounting;
  // « À réceptionner »: BLs filed in the Suivi, for the accounts that receive goods
  const isReceiver = canReceiveBls(user, can);
  const { count: blsToReceive } = useBlsToReceive(isReceiver, user?.id || user?.username || '');
  const tabAllowed = (k) => k === 'orders' || (k === 'reception' ? isReceiver : k === 'requests' ? can('orders.edit')
    : k === 'fournisseurs' ? (canAccounting || can('orders.own')) : canAccounting);
  // the accountant lands on Suivi; warehouse-type roles (no full orders access) on « À réceptionner »
  const defaultTab = !can('orders.edit') && canAccounting ? 'suivi'
    : isReceiver && !isAdmin && !can('orders.view') && !can('orders.own') ? 'reception' : 'orders';
  const [activeTab, setActiveTab] = useState(() => {
    const tab = getQueryParam('onglet');
    return ORDER_TABS.includes(tab) ? tab : defaultTab;
  });
  const shownTab = tabAllowed(activeTab) ? activeTab : defaultTab;
  const changeTab = (tab) => {
    setActiveTab(tab);
    setUrl(PAGE_PATHS.orders, { replace: true, query: { onglet: tab === 'orders' ? null : tab } });
  };

  // who may touch THIS order
  // ACHAT (orders.edit) can also edit a BC already sent (not a cancelled one); cancel / delete stay admin-only
  // « orders.own » (e.g. Coordinateur-vitrage): creates and manages ITS OWN orders (its families), and only
  // receives the orders of the purchasing department — same rules on the server
  const ownOnly = !isAdmin && can('orders.own') && !can('orders.edit');
  const myId = String(user?.id || user?._id || '');
  const isMine = (o) => !!o?.createdBy && String(o.createdBy?._id || o.createdBy?.id || o.createdBy) === myId;
  const ownFamilies = ownOnly ? Object.keys(CATEGORY_RECEIVE_ROLE).filter(c => CATEGORY_RECEIVE_ROLE[c] === user?.role) : null;
  const canCreateOrder = can('orders.edit') || ownOnly;
  const canEditSent = isAdmin || can('orders.edit') || ownOnly;
  const canEditOrder = (o) => (ownOnly ? isMine(o) && o.status !== 'annulee'
    : o.status === 'brouillon' ? can('orders.edit') : (isAdmin || (o.status !== 'annulee' && can('orders.edit'))));
  const canDeleteOrder = (o) => (ownOnly ? isMine(o) && o.status === 'brouillon'
    : o.status === 'brouillon' ? (can('orders.delete') || isAdmin) : isAdmin);
  const canSendOrder = (o) => o.status === 'brouillon' && (can('orders.edit') || (ownOnly && isMine(o)));
  const canCancelOrder = (o) => (o.status === 'envoye' || o.status === 'partielle') && (isAdmin || (ownOnly && isMine(o)));
  // prices: Admin / ACHAT / accountant, and its own orders for « orders.own »
  const showPricesFor = (o) => canSeePrices || isMine(o);

  const userKey = user?.id || user?._id || user?.username || '';
  const hasOrders = useRef(false);
  const fetchOrders = useCallback(async () => {
    // Show the last known list immediately; the spinner only appears when there is nothing to show
    if (!hasOrders.current) {
      const cached = readOrdersCache(userKey);
      if (cached) { setOrders(cached); hasOrders.current = true; setLoading(false); }
      else setLoading(true);
    }
    try {
      const res = await axios.get(`${API_URL}/orders`);
      setOrders(res.data);
      hasOrders.current = true;
      writeOrdersCache(userKey, res.data);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [userKey]);

  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/fournisseurs`);
      setSuppliers(res.data || []);
    } catch (e) { console.error(e); }
  }, []);

  // Only the number of pending requests is needed here (tab badge) — the list itself is paginated in its panel
  const fetchPendingCount = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/purchase-requests/count`);
      setPendingRequests(res.data?.pending || 0);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { fetchOrders(); fetchSuppliers(); fetchPendingCount(); }, [fetchOrders, fetchSuppliers, fetchPendingCount]);

  // Keep selectedOrder in sync after a re-fetch
  useEffect(() => {
    if (selectedOrder) {
      const updated = orders.find(o => o.id === selectedOrder.id);
      if (updated) setSelectedOrder(updated);
    }
  }, [orders]); // eslint-disable-line react-hooks/exhaustive-deps

  // Documents attached to the open order (BL for everyone who sees it, invoices for ACHAT / accountant)
  const [orderDocs, setOrderDocs] = useState({ documents: [], canManage: false });
  const [docsManage, setDocsManage] = useState(null); // { blNumber } being managed in the documents window
  const [docStorage, setDocStorage] = useState(null);
  const selectedOrderId = selectedOrder?.id;
  const loadOrderDocs = useCallback(() => {
    if (!selectedOrderId) return;
    axios.get(`${API_URL}/orders/${selectedOrderId}/documents`)
      .then(r => setOrderDocs({ documents: r.data.documents || [], canManage: !!r.data.canManage }))
      .catch(() => setOrderDocs({ documents: [], canManage: false }));
  }, [selectedOrderId]);
  useEffect(() => { setOrderDocs({ documents: [], canManage: false }); loadOrderDocs(); }, [loadOrderDocs]);
  const manageDocs = (blNumber) => {
    setDocsManage({ blNumber });
    axios.get(`${API_URL}/order-tracking/storage`).then(r => setDocStorage(r.data)).catch(() => {});
  };

  // ── Order detail in the URL: /commandes/<id> (refresh / back button / shared link) ──
  const openOrder = (order) => {
    setSelectedOrder(order);
    setUrl(`${PAGE_PATHS.orders}/${order.id}`);
  };
  const closeOrder = ({ replace = false } = {}) => {
    setSelectedOrder(null);
    setUrl(PAGE_PATHS.orders, { replace, query: { onglet: activeTab === 'orders' ? null : activeTab } });
  };
  // /commandes/<id>?receptionner=<BL> (banner, notification, « À réceptionner »): open the reception of that BL
  const applyReceiveParam = () => {
    const bl = getQueryParam('receptionner');
    const [id] = subPathFromLocation();
    if (!bl || !id) return;
    setBatchReceive({ initialBl: bl });
    setUrl(`${PAGE_PATHS.orders}/${id}`, { replace: true });
  };
  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  const urlOrderApplied = useRef(false);
  useEffect(() => {
    // Opening /commandes/<id> directly: show that order as soon as the list is there
    if (urlOrderApplied.current || !orders.length) return;
    const [id] = subPathFromLocation();
    if (id) {
      const found = orders.find(o => o.id === id);
      if (found) { setSelectedOrder(found); applyReceiveParam(); }
      else setUrl(PAGE_PATHS.orders, { replace: true }); // unknown / deleted order
    }
    urlOrderApplied.current = true;
  }, [orders]);
  useEffect(() => {
    const onPop = () => {
      const [id] = subPathFromLocation();
      const found = id ? (ordersRef.current.find(o => o.id === id) || null) : null;
      setSelectedOrder(found);
      if (!found) setBatchReceive(null);
      const tab = getQueryParam('onglet');
      setActiveTab(ORDER_TABS.includes(tab) ? tab : defaultTab);
      if (found) applyReceiveParam();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (id) => {
    if (!(await dialog.confirm({ title: t('deleteTitle'), message: t('orDeleteOrderConfirm'), danger: true, confirmLabel: t('deleteAction') }))) return;
    try {
      await axios.delete(`${API_URL}/orders/${id}`);
      if (selectedOrder?.id === id) closeOrder({ replace: true });
      fetchOrders();
    } catch (e) { await dialog.alert(errorMessage(e, t('dlgError'))); }
  };

  const handleSend = async (order) => {
    if (!(await dialog.confirm({ title: t('orSendConfirmTitle'), message: t('orSendConfirmDetails'), confirmLabel: t('orSend') }))) return;
    setSendingId(order.id);
    try {
      await axios.post(`${API_URL}/orders/${order.id}/send`);
      await fetchOrders();
    } catch (e) { await dialog.alert(errorMessage(e, t('dlgError'))); }
    finally { setSendingId(null); }
  };

  const handleCancel = async (order) => {
    if (!(await dialog.confirm({ message: t('orCancelOrderConfirm'), danger: true, confirmLabel: t('orCancelOrderBtn'), cancelLabel: t('close') }))) return;
    try {
      await axios.post(`${API_URL}/orders/${order.id}/cancel`);
      await fetchOrders();
    } catch (e) { await dialog.alert(errorMessage(e, t('dlgError'))); }
  };

  // Send a reception correction; if part of the stock was already used, the server answers 409 →
  // ask for confirmation and send again with force (stock then goes down to 0, never negative)
  const sendWithStockCheck = async (request) => {
    try {
      await request(false);
    } catch (e) {
      const data = e.response?.data || {};
      if (e.response?.status === 409 && data.code === 'INSUFFICIENT_STOCK') {
        const ok = await dialog.confirm({
          message: data.error,
          details: `${t('orStockContinue')}\n${t('orStockWillGo', { available: data.available, missing: data.needed - data.available })}`,
          danger: true,
        });
        if (!ok) return false;
        await request(true);
      } else throw e;
    }
    return true;
  };

  // Cancel a reception entered by mistake (stock + line reverted), then receive again correctly
  const handleCancelReception = async (order, rec, itemName) => {
    const answer = await dialog.prompt({
      title: t('orCancelReceptionTitle'),
      message: `${t('orReceptionSummary', { name: itemName, qty: rec.quantityReceived, bl: rec.blNumber })}\n\n${t('orCancelReceptionDetails')}`,
      label: t('optionalReason'),
      defaultValue: '',
    });
    if (answer === null) return;
    try {
      const done = await sendWithStockCheck(force =>
        axios.post(`${API_URL}/orders/${order.id}/receptions/${rec._id || rec.id}/cancel`, { note: answer, force }));
      if (done) await fetchOrders();
    } catch (e) { await dialog.alert(errorMessage(e, t('dlgError'))); }
  };

  // Correct the quantity of a reception (e.g. 100 entered, 90 really received): only the difference is applied
  const handleAdjustReception = async (order, rec, itemName) => {
    // a line ordered in cartons of 100 is adjusted in pièces (what was really counted), sent back in cartons
    const line = (order.lines || []).find(l => String(l._id || l.id) === String(rec.lineId));
    const conv = line && isConverted(line);
    const shownQty = conv ? lineToStock(line, rec.quantityReceived) : rec.quantityReceived;
    const shownUnit = conv ? line.stockUnit : line?.unit;
    const answer = await dialog.prompt({
      title: t('orAdjustReceptionTitle'),
      message: t('orAdjustReceptionMsg', { name: itemName, bl: rec.blNumber, qty: qtyWithUnit(shownQty, shownUnit, lang) }),
      label: t('orNewQtyReceived') + (unitLabel(shownUnit, lang, 2) ? ` (${unitLabel(shownUnit, lang, 2)})` : ''),
      defaultValue: fmtUnitQty(shownQty),
    });
    if (answer === null) return;
    const typed = Number(String(answer).replace(',', '.'));
    if (!Number.isFinite(typed) || typed <= 0) {
      await dialog.alert(t('orInvalidQtyUseCancel'));
      return;
    }
    const quantity = conv ? Math.round((typed / lineFactor(line)) * 1e6) / 1e6 : typed;
    if (quantity === rec.quantityReceived) return;
    const note = await dialog.prompt({
      title: t('orAdjustReceptionTitle'),
      message: `${qtyWithUnit(shownQty, shownUnit, lang)} → ${qtyWithUnit(typed, shownUnit, lang)}`,
      label: t('optionalReason'),
      defaultValue: '',
    });
    if (note === null) return;
    try {
      const done = await sendWithStockCheck(force =>
        axios.patch(`${API_URL}/orders/${order.id}/receptions/${rec._id || rec.id}`, { quantity, note, force }));
      if (done) await fetchOrders();
    } catch (e) { await dialog.alert(errorMessage(e, t('dlgError'))); }
  };

  // Close a line that will never be fully delivered (e.g. 198 / 200): the rest leaves "quantité commandée"
  const handleCloseLine = async (order, line, closed = true) => {
    let note = '';
    if (closed) {
      const rest = line.quantityOrdered - (line.quantityReceived || 0);
      const answer = await dialog.prompt({
        title: t('orCloseLineTitle'),
        message: t('orCloseLineMsg', { received: line.quantityReceived || 0, ordered: line.quantityOrdered, rest }),
        label: t('optionalReason'),
        defaultValue: '',
      });
      if (answer === null) return;
      note = answer;
    } else if (!(await dialog.confirm({ message: t('orReopenLineConfirm'), confirmLabel: t('orReopen') }))) {
      return;
    }
    try {
      await axios.patch(`${API_URL}/orders/${order.id}/lines/${line._id || line.id}/close`, { closed, note });
      await fetchOrders();
    } catch (e) { await dialog.alert(errorMessage(e, t('dlgError'))); }
  };

  // Flexible search: split into tokens, check each against multiple fields
  const matchesSearch = (order) => {
    if (!searchTerm.trim()) return true;
    const tokens = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
    const haystack = [
      order.number,
      order.reference,
      order.supplierId?.name,
      order.supplier,
      order.notes,
      ...(order.lines || []).flatMap(l => [
        l.itemId?.designation?.[lang] || l.itemId?.designation?.fr || '',
        l.itemId?.codeInterne || '',
        ...(l.itemId?.supplierCodes || []).map(sc => sc.code || ''),
      ]),
    ].join(' ').toLowerCase();
    return tokens.every(tok => haystack.includes(tok));
  };

  // « orders.own »: the list shows its own orders; the purchasing department's ones are in « À réceptionner »
  const listOrders = ownOnly ? orders.filter(isMine) : orders;
  const filteredOrders = listOrders.filter(o => {
    if (selectedCompany && o.companyId?.id !== selectedCompany && o.companyId?._id !== selectedCompany) return false;
    if (filterStatus !== 'all' && o.status !== filterStatus) return false;
    return matchesSearch(o);
  });

  // Pagination: show only first displayCount orders
  const visibleOrders = filteredOrders.slice(0, displayCount);
  const hasMoreOrders = displayCount < filteredOrders.length;
  const stats = {
    total: listOrders.length,
    brouillon: listOrders.filter(o => o.status === 'brouillon').length,
    envoye: listOrders.filter(o => o.status === 'envoye').length,
    partielle: listOrders.filter(o => o.status === 'partielle').length,
    recue: listOrders.filter(o => o.status === 'recue').length,
  };

  const handleExportPDF = async (order) => {
    setExportingPdf(order.id);
    try {
      const company = companies.find(c => c.id === (order.companyId?.id || order.companyId?._id)) || null;
      await exportOrderPDF(order, lang, company, { hidePrices: !showPricesFor(order) });
    } catch (e) { console.error(e); await dialog.alert(t('orExportPdfError')); }
    finally { setExportingPdf(null); }
  };

  const orderTitle = (o) => o.number || o.reference || (o.status === 'brouillon' ? t('orDraft') : '—');

  // ── Detail view ──────────────────────────────────────────────────
  if (selectedOrder) {
    const order = selectedOrder;
    const st = STATUS_COLORS[order.status] || STATUS_COLORS.brouillon;
    const locked = order.status !== 'brouillon';
    const totalOrdered = (order.lines || []).reduce((s, l) => s + l.quantityOrdered, 0);
    const totalReceived = (order.lines || []).reduce((s, l) => s + (l.quantityReceived || 0), 0);
    const progress = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;
    const totalHT = (order.lines || []).reduce((s, l) => s + (l.quantityOrdered || 0) * (l.unitPrice || 0), 0);
    const tvaRate = order.tva != null ? Number(order.tva) : 20;
    const ttc = totalHT * (1 + tvaRate / 100);
    // Something left that this user may receive (open line of one of their families)
    const receivable = order.status !== 'annulee' && order.status !== 'brouillon'
      && (order.lines || []).some(l => !l.closed && (l.quantityReceived || 0) < l.quantityOrdered && canReceiveLine(l));

    return (
      <div className="orders-page">
        {/* ── Toolbar: back on the left, actions on the right (all buttons same height) ── */}
        <div className="od-toolbar">
          <button className="od-btn od-btn--back" onClick={() => closeOrder()}>
            <StepBack size={15} />
            <span>{t('backCommandes')}</span>
          </button>

          <div className="od-toolbar__actions">
            <button
              className="od-btn"
              title={t('orExportPdf')}
              onClick={() => handleExportPDF(order)}
              disabled={exportingPdf === order.id}
            >
              {exportingPdf === order.id ? <LoaderCircle size={15} className="od-spin" /> : <FileText size={15} />}
              <span className="od-btn__label">PDF</span>
            </button>

            {canSendOrder(order) && (
              <button className="od-btn od-btn--send" onClick={() => handleSend(order)} disabled={sendingId === order.id}>
                {sendingId === order.id ? <LoaderCircle size={15} className="od-spin" /> : <Send size={15} />}
                <span className="od-btn__label">{t('orSend')}</span>
              </button>
            )}

            {canEditOrder(order) ? (
              <button className="od-btn" title={t('edit')} onClick={() => { setEditOrder(order); setShowForm(true); }}>
                <Pencil size={15} />
                <span className="od-btn__label">{t('edit')}</span>
              </button>
            ) : locked && (
              <span className="od-btn od-btn--locked" title={t('orLockedTitle')}>
                <Lock size={14} />
                <span className="od-btn__label">{t('orLocked')}</span>
              </span>
            )}

            {canCancelOrder(order) && (
              <button className="od-btn od-btn--warn" title={t('orCancelOrderTitle')} onClick={() => handleCancel(order)}>
                <Ban size={15} />
                <span className="od-btn__label">{t('orCancelOrderBtn')}</span>
              </button>
            )}

            {canDeleteOrder(order) && (
              <button className="od-btn od-btn--danger" title={t('delete')} onClick={() => handleDelete(order.id)}>
                <Trash2 size={15} />
                <span className="od-btn__label">{t('delete')}</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Header: number + status, meta, progress ── */}
        <div className="od-header">
          <div className="od-header__top">
            <h1 className="od-header__ref">{orderTitle(order)}</h1>
            <span className="status-badge status-badge--lg" style={{ background: st.bg, color: st.text, borderColor: st.bd }}>
              {st.label[lang] || st.label.fr}
            </span>
          </div>
          <div className="od-header__meta">
            {order.companyId && (
              <span className="order-company-badge od-header__company" style={order.companyId.color ? { '--co': order.companyId.color } : undefined}>
                {order.companyId.name}
              </span>
            )}
            {(order.supplierId?.name || order.supplier) && (
              <span className="od-header__supplier">{order.supplierId?.name || order.supplier}</span>
            )}
            <span className="od-header__chip" title={t('orOrderDate')}>
              <Calendar size={13} /> {new Date(order.orderDate).toLocaleDateString('fr-FR')}
            </span>
            {order.expectedDate && (
              <span className="od-header__chip" title={t('orExpectedDate')}>
                <CalendarClock size={13} /> {new Date(order.expectedDate).toLocaleDateString('fr-FR')}
              </span>
            )}
            {order.sentAt && (
              <span className="od-header__chip" title={t('orSentToSupplier')}>
                <Send size={12} /> {new Date(order.sentAt).toLocaleDateString('fr-FR')}{order.sentBy ? ` · ${order.sentBy}` : ''}
              </span>
            )}
          </div>
          <div className="od-header__progress">
            <div className="od-header__bar">
              <div style={{ width: `${progress}%` }} />
            </div>
            <div className="od-header__progress-label">
              <strong>{totalReceived}</strong> / {totalOrdered} {t('orArticlesReceived')} <span>({progress}%)</span>
            </div>
          </div>
        </div>

        {order.notes && (
          <div className="order-detail-notes">
            <strong>{t('orNotesColon')}</strong> {order.notes}
          </div>
        )}

        <PendingBlsBlock order={order} docs={orderDocs.documents} canReceive={receivable} canReceiveLine={canReceiveLine}
          canManage={orderDocs.canManage} onDeleted={() => { loadOrderDocs(); refreshBls(); }}
          onReceive={(bl, attach = []) => setBatchReceive({ initialBl: bl, attach })} />

        <div className="order-detail-lines">
          <h2 className="order-detail-lines-title">
            {t('orOrderedItems')}
            {receivable && (
              <button type="button" className="btn-receive rb-receive-all" onClick={() => setBatchReceive({ initialBl: '' })}>
                <PackageCheck size={14} /> {t('rbOpen')}
              </button>
            )}
          </h2>
          {(order.lines || []).map((line, idx) => {
            const item = line.itemId;
            const received = line.quantityReceived || 0;
            const isComplete = received >= line.quantityOrdered || line.closed;
            const linePct = line.quantityOrdered > 0 ? Math.round((received / line.quantityOrdered) * 100) : 0;
            const supId = (order.supplierId?.id || order.supplierId?._id || '').toString();
            const codeFour = (item?.supplierCodes || []).find(sc => (sc.supplierId?._id || sc.supplierId)?.toString() === supId)?.code;
            return (
              <div key={idx} className={`order-detail-line ${isComplete ? 'line-complete' : ''}`}>
                <div className="detail-line-image">
                  {item?.image
                    ? <ZoomImg src={item.image} alt={item.designation?.[lang] || ''} />
                    : <div className="detail-line-no-image"><Package size={15} /></div>
                  }
                </div>
                <div className="detail-line-body">
                  <div className="detail-line-name">
                    {item
                      ? (item.designation?.[lang] || item.designation?.fr || item.designation?.it || item.designation?.en || item.codeInterne || t('orItemNoDesignation'))
                      : t('orItemDeleted')}
                  </div>
                  <div className="detail-line-codes">
                    {item?.codeInterne && <span className="detail-line-code">{t('orCodeIntShort', { code: item.codeInterne })}</span>}
                    {codeFour && <span className="detail-line-code">{t('orCodeSupShort', { code: codeFour })}</span>}
                  </div>
                  <div className="detail-line-tags">
                    {item?.categoryId && (
                      <span className="detail-line-cat">
                        <span className="detail-line-cat__dot" style={{ background: item.categoryId.color || 'var(--500)' }} />
                        {item.categoryId.name?.[lang] || item.categoryId.name?.fr}
                      </span>
                    )}
                    {showPricesFor(order) && line.unitPrice > 0 && (
                      <span className="detail-line-price">{line.unitPrice.toFixed(2)} /{unitLabel(line.unit, lang) || 'u'}</span>
                    )}
                  </div>
                  {line.note && <p className="detail-line-note"><StickyNote size={12} style={{ marginRight: 5 }} />{line.note}</p>}
                </div>
                <div className="detail-line-qty-block">
                  <div className="detail-line-qty-bar">
                    <div className={`detail-line-qty-fill ${isComplete ? 'detail-line-qty-fill--done' : 'detail-line-qty-fill--open'}`} style={{ width: `${linePct}%` }} />
                  </div>
                  <div className="detail-line-qty-text">
                    {fmtUnitQty(received)} / {fmtUnitQty(line.quantityOrdered)}
                    {line.unit && <span className="detail-line-unit"> {unitLabel(line.unit, lang, line.quantityOrdered)}</span>}
                    {isComplete && <span className="line-check"> <Check size={13} /></span>}
                  </div>
                  {isConverted(line) && (
                    <div className="detail-line-conv" title={t('orUnitConvTitle', { n: fmtUnitQty(lineFactor(line)) })}>
                      = {qtyWithUnit(lineToStock(line, received), line.stockUnit, lang)} / {qtyWithUnit(lineToStock(line, line.quantityOrdered), line.stockUnit, lang)}
                    </div>
                  )}
                  {line.closed && (
                    <div className="detail-line-closed"
                      title={[line.closedBy && t('orByCap', { by: line.closedBy }), line.closedAt && new Date(line.closedAt).toLocaleString('fr-FR'), line.closedNote].filter(Boolean).join(' — ')}>
                      {t(line.quantityOrdered - received > 1 ? 'orLineClosedMany' : 'orLineClosedOne', { n: line.quantityOrdered - received })}
                      {line.closedNote && <> · {line.closedNote}</>}
                    </div>
                  )}
                  {line.closed && isAdmin && order.status !== 'annulee' && (
                    <button type="button" className="btn-link detail-line-reopen"
                      onClick={() => handleCloseLine(order, line, false)}>
                      {t('orReopen')}
                    </button>
                  )}
                </div>
                {!isComplete && order.status !== 'annulee' && order.status !== 'brouillon' && (
                  canReceiveOrder(order) ? (
                    <div className="detail-line-actions">
                      <button type="button" className="btn-receive btn-receive--ghost"
                        title={t('orCloseLineHint')}
                        onClick={() => handleCloseLine(order, line)}>
                        {t('orCloseLine')}
                      </button>
                    </div>
                  ) : (
                    <span className="bc-lock" title={t('orReservedRole', { role: CATEGORY_RECEIVE_ROLE[order.category] || '' })}>
                      <Lock size={12} /> {CATEGORY_RECEIVE_ROLE[order.category]}
                    </span>
                  )
                )}
              </div>
            );
          })}
        </div>

        {(order.receptions || []).length > 0 && (() => {
          // One card per BL (a BL usually brings several lines), newest first
          const fmtDate = (d) => new Date(d).toLocaleDateString('fr-FR', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
          });
          const groups = [];
          const byBl = new Map();
          [...order.receptions]
            .sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt))
            .forEach(rec => {
              const key = rec.blNumber || '—';
              if (!byBl.has(key)) {
                const g = { blNumber: key, receivedAt: rec.receivedAt, receivedBy: new Set(), recs: [] };
                byBl.set(key, g);
                groups.push(g);
              }
              const g = byBl.get(key);
              if (rec.receivedBy) g.receivedBy.add(rec.receivedBy);
              g.recs.push(rec);
            });

          return (
            <div className="order-receptions">
              <h2 className="order-detail-lines-title">
                {t('orReceptionHistory')}
                <span className="order-receptions__count">{groups.length} BL</span>
              </h2>
              {groups.map(g => {
                const activeRecs = g.recs.filter(r => !r.cancelled);
                const totalQty = activeRecs.reduce((s, r) => s + (r.quantityReceived || 0), 0);
                return (
                  <div key={g.blNumber} className="reception-bl">
                    <div className="reception-bl__head">
                      <div className="reception-bl__id">
                        <span className="reception-bl__icon"><CheckCheck size={15} /></span>
                        <div>
                          <div className="reception-bl__label">BL</div>
                          <div className="reception-bl__number">{g.blNumber}</div>
                        </div>
                      </div>
                      <div className="reception-bl__meta">
                        <span><Calendar size={12} /> {fmtDate(g.receivedAt)}</span>
                        {g.receivedBy.size > 0 && <span>{t('orBy')} <strong>{[...g.receivedBy].join(', ')}</strong></span>}
                        <span className="reception-bl__chip">
                          {t(activeRecs.length > 1 ? 'orArticleMany' : 'orArticleOne', { n: activeRecs.length })} · {totalQty} {t('orPcs')}
                        </span>
                        <BlDocButtons
                          docs={orderDocs.documents.filter(d => d.kind === 'bl' && d.blNumber === g.blNumber)}
                          canManage={orderDocs.canManage && g.blNumber !== '—'}
                          onManage={() => manageDocs(g.blNumber)}
                          onDeleted={() => { loadOrderDocs(); refreshBls(); }}
                        />
                      </div>
                    </div>
                    <div className={`reception-bl__rows ${order.status !== 'annulee' && canReceiveOrder(order) ? 'reception-bl__rows--actions' : ''}`}>
                      {g.recs.map((rec, idx) => {
                        const line = (order.lines || []).find(
                          l => (l._id || l.id)?.toString() === rec.lineId?.toString()
                        );
                        const item = line?.itemId;
                        const name = item?.designation?.[lang] || item?.designation?.fr || item?.codeInterne || t('orArticle');
                        return (
                          <div key={idx} className={`reception-row ${rec.cancelled ? 'reception-row--cancelled' : ''}`}>
                            <div className="reception-row__thumb">
                              {item?.image ? <ZoomImg src={item.image} alt={name} /> : <Package size={14} />}
                            </div>
                            <div className="reception-row__name" title={name}>
                              {name}
                              {item?.codeInterne && <span className="reception-row__code">{item.codeInterne}</span>}
                              {(rec.adjustments || []).map((a, ai) => (
                                <div key={ai} className="reception-row__adjust-info">
                                  {t('orAdjusted', { from: a.from, to: a.to })}{a.by && ` ${t('orByName', { by: a.by })}`}
                                  {a.at && ` ${t('orOnDate', { date: fmtDate(a.at) })}`}
                                  {a.note && ` — ${a.note}`}
                                </div>
                              ))}
                              {rec.cancelled && (
                                <div className="reception-row__cancel-info">
                                  {t('orCancelledF')}{rec.cancelledBy && ` ${t('orByName', { by: rec.cancelledBy })}`}
                                  {rec.cancelledAt && ` ${t('orOnDate', { date: fmtDate(rec.cancelledAt) })}`}
                                  {rec.cancelNote && ` — ${rec.cancelNote}`}
                                </div>
                              )}
                            </div>
                            {line && (
                              <div className="reception-row__progress">
                                {fmtUnitQty(line.quantityReceived || 0)} / {fmtUnitQty(line.quantityOrdered)}
                              </div>
                            )}
                            <div className="reception-row__qty">
                              +{line ? qtyWithUnit(rec.quantityReceived, line.unit, lang) : rec.quantityReceived}
                              {line && isConverted(line) && (
                                <span className="reception-row__conv">= {qtyWithUnit(lineToStock(line, rec.quantityReceived), line.stockUnit, lang)}</span>
                              )}
                            </div>
                            <div className="reception-row__time">
                              {new Date(rec.receivedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <div className="reception-row__actions">
                              {!rec.cancelled && order.status !== 'annulee' && canReceiveOrder(order) && (
                                <>
                                  <button type="button" className="reception-row__adjust"
                                    title={t('orAdjustHint')}
                                    onClick={() => handleAdjustReception(order, rec, name)}>
                                    {t('orAdjust')}
                                  </button>
                                  <button type="button" className="reception-row__cancel"
                                    title={t('orCancelReceptionHint')}
                                    onClick={() => handleCancelReception(order, rec, name)}>
                                    {t('cancel')}
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {orderDocs.canManage && order.status !== 'brouillon' && (
          <OrderDocumentsBlock docs={orderDocs.documents} onDeleted={() => { loadOrderDocs(); refreshBls(); }} onManage={() => {
            // Invoices live on the BL rows of the Suivi: with a single BL, manage that one
            const bls = [...new Set((order.receptions || []).filter(r => !r.cancelled && r.blNumber).map(r => r.blNumber))];
            manageDocs(bls.length === 1 ? bls[0] : '');
          }} />
        )}
        {docsManage && (
          <DocumentsModal
            row={{
              orderId: order.id, blNumber: docsManage.blNumber,
              supplierName: order.supplierId?.name || order.supplier || '', orderNumber: order.number || order.reference || '',
              documents: orderDocs.documents.filter(d => d.blNumber === docsManage.blNumber),
            }}
            storage={docStorage}
            onStorage={setDocStorage}
            onChange={loadOrderDocs}
            onClose={() => { setDocsManage(null); loadOrderDocs(); }}
          />
        )}

        {/* Totals */}
        {showPricesFor(order) && <div className="order-detail-totals">
          <div className="order-detail-totals__row"><span>{t('orTotalHT')}</span><strong>{totalHT.toFixed(2)}</strong></div>
          <div className="order-detail-totals__row"><span>{t('orVatRate', { rate: tvaRate })}</span><strong>{(totalHT * tvaRate / 100).toFixed(2)}</strong></div>
          <div className="order-detail-totals__row order-detail-totals__ttc"><span>{t('orTotalTTC')}</span><strong>{ttc.toFixed(2)}</strong></div>
        </div>}

        {batchReceive && (
          <ReceiveBatchModal
            order={order}
            docs={orderDocs.documents}
            lang={lang}
            canReceiveLine={canReceiveLine}
            initialBl={batchReceive.initialBl}
            initialAttach={batchReceive.attach || []}
            onClose={() => setBatchReceive(null)}
            onDone={() => { setBatchReceive(null); fetchOrders(); loadOrderDocs(); refreshBls(); }}
          />
        )}
        {showForm && (
          <OrderForm
            order={editOrder}
            companies={companies}
            suppliers={suppliers}
            onSupplierAdded={(s) => setSuppliers(prev => [...prev, s])}
            lang={lang}
            canEditSent={canEditSent}
            families={ownFamilies}
            initialSupplierId={editOrder ? '' : newOrderSupplier}
            onClose={() => { setShowForm(false); setEditOrder(null); setNewOrderSupplier(''); }}
            onSave={() => { setShowForm(false); setEditOrder(null); setNewOrderSupplier(''); fetchOrders(); }}
          />
        )}
      </div>
    );
  }

  // ── Cards list view ──────────────────────────────────────────────
  return (
    <div className="orders-page">
      <header className="orders-header">
        <div className="orders-tab-switcher">
          <button
            className={`orders-tab-btn ${shownTab === 'orders' ? 'active' : ''}`}
            onClick={() => changeTab('orders')}
          >
            <ShoppingCart size={15} /> {t('navOrders')}

          </button>

          {isReceiver && (
            <button
              className={`orders-tab-btn ${shownTab === 'reception' ? 'active' : ''}`}
              onClick={() => changeTab('reception')}
            >
              <PackageCheck size={13} />
              {t('blqTab')}
              {blsToReceive > 0 && (
                <span className="orders-tab-badge orders-tab-badge--orange">{blsToReceive}</span>
              )}
            </button>
          )}

          {can('orders.edit') && (
            <button
              className={`orders-tab-btn ${shownTab === 'requests' ? 'active' : ''}`}
              onClick={() => changeTab('requests')}
            >
              <ShoppingCart size={13} />
              {t('Demandesadmin')}
              {pendingRequests > 0 && (
                <span className="orders-tab-badge orders-tab-badge--orange">
                  {pendingRequests}
                </span>
              )}
            </button>
          )}

          {canAccounting && (
            <button
              className={`orders-tab-btn ${shownTab === 'suivi' ? 'active' : ''}`}
              onClick={() => changeTab('suivi')}
            >
              <ClipboardList size={13} />
              {t('orTracking')}
            </button>
          )}

          {(canAccounting || ownOnly) && (
            <button
              className={`orders-tab-btn ${shownTab === 'fournisseurs' ? 'active' : ''}`}
              onClick={() => changeTab('fournisseurs')}
            >
              <Truck size={13} />
              {t('spTitle')}
            </button>
          )}

        </div>
        <div className="orders-header__actions">
          <button className="orders-icon-btn orders-icon-btn--excel" title='Excel' onClick={() => exportOrdersExcel(filteredOrders, lang, { hidePrices: !filteredOrders.every(showPricesFor) })}>
            <Sheet size={16} />
          </button>
          {canCreateOrder && (
            <button className="btn-primary" onClick={() => { setEditOrder(null); setShowForm(true); }}>
              <FilePlus size={15} />{t('orderNew')}
            </button>
          )}
        </div>
      </header>

      {/* ── Tab content ──────────────────────────────────────────── */}
      {shownTab === 'reception' ? (
        <BlsToReceivePanel
          onReceive={(it) => {
            const o = orders.find(x => x.id === it.orderId);
            const attach = it.unnumbered ? it.docs.map(d => d.id) : [];
            if (o) { openOrder(o); setBatchReceive({ initialBl: it.unnumbered ? '' : it.blNumber, attach }); }
            else if (!it.unnumbered) { setUrl(`${PAGE_PATHS.orders}/${it.orderId}`, { query: { receptionner: it.blNumber } }); window.dispatchEvent(new PopStateEvent('popstate')); }
            else { setUrl(`${PAGE_PATHS.orders}/${it.orderId}`); window.dispatchEvent(new PopStateEvent('popstate')); }
          }}
          onOpen={(it) => {
            const o = orders.find(x => x.id === it.orderId);
            if (o) openOrder(o);
            else { setUrl(`${PAGE_PATHS.orders}/${it.orderId}`); window.dispatchEvent(new PopStateEvent('popstate')); }
          }}
          extra={ownOnly && (
            <OrdersToReceiveList lang={lang}
              orders={orders.filter(o => !isMine(o) && (o.status === 'envoye' || o.status === 'partielle'))}
              onOpen={openOrder} />
          )}
        />
      ) : shownTab === 'requests' ? (
        <PurchaseRequestsPanel
          onChanged={fetchPendingCount}
          isAdmin={isAdmin}
          lang={lang}
        />
      ) : shownTab === 'suivi' ? (
        <SuiviCommandesPanel />
      ) : shownTab === 'fournisseurs' ? (
        <SuppliersPanel
          suppliers={suppliers}
          statusColors={STATUS_COLORS}
          isAdmin={isAdmin}
          fullEdit={can('orders.edit')}
          ownUserId={ownOnly ? myId : null}
          onChanged={fetchSuppliers}
          onNewOrder={(s) => { setEditOrder(null); setNewOrderSupplier(s.id); setShowForm(true); }}
          onOpenOrder={(id) => {
            const o = orders.find(x => x.id === id);
            setActiveTab('orders');
            if (o) openOrder(o);
            else { setUrl(`${PAGE_PATHS.orders}/${id}`); window.dispatchEvent(new PopStateEvent('popstate')); }
          }}
        />
      ) : (
        <>
          <div className="orders-stats">
            {[
              { label: 'orStatTotal', value: stats.total, color: 'var(--text)' },
              { label: 'orStatDrafts', value: stats.brouillon, color: '#a1a1aa' },
              { label: 'orStatSent', value: stats.envoye, color: 'var(--ink-blue)' },
              { label: 'orStatPartial', value: stats.partielle, color: 'var(--ink-amber)' },
              { label: 'orStatReceived', value: stats.recue, color: 'var(--ink-green)' },
            ].map(s => (
              <div key={s.label} className="orders-stat-card" style={{ '--accent': s.color }}>
                <span className="stat-value">{s.value}</span>
                <span className="stat-label">{t(s.label)}</span>
              </div>
            ))}
          </div>

          <div className="orders-controls">
            <input
              className="search-input"
              placeholder={t('orSearchPlaceholder')}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            <div className="filter-tabs">
              {['all', 'brouillon', 'envoye', 'partielle', 'recue', 'annulee'].map(s => (
                <button
                  key={s}
                  className={`filter-tab ${filterStatus === s ? 'active' : ''}`}
                  onClick={() => setFilterStatus(s)}
                >
                  {s === 'all' ? t('orAll') : (STATUS_COLORS[s]?.label?.[lang] || STATUS_COLORS[s]?.label?.fr)}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="loading-msg">{t('loading')}</div>
          ) : filteredOrders.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><ShoppingCart size={15} /></div>
              <p>{t("noData")}</p>
            </div>
          ) : (
            <>
              <div className="orders-list">
                {visibleOrders.map(order => {
                  const st = STATUS_COLORS[order.status] || STATUS_COLORS.brouillon;
                  const totalOrdered = (order.lines || []).reduce((s, l) => s + l.quantityOrdered, 0);
                  const totalReceived = (order.lines || []).reduce((s, l) => s + (l.quantityReceived || 0), 0);
                  const progress = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;
                  return (
                    <div
                      key={order.id}
                      className="order-card order-card--clickable"
                      onClick={() => openOrder(order)}
                    >
                      <div className="order-card-header">
                        <div className="order-card-title">
                          <h3>{orderTitle(order)}</h3>
                          {order.companyId && <span className="order-company-badge">{order.companyId.name}</span>}
                          {(order.supplierId?.name || order.supplier) && <span className="order-supplier">— {order.supplierId?.name || order.supplier}</span>}
                          {(order.categories || []).length > 0 && (
                            <div className="order-card-cats">
                              {order.categories.map(cat => (
                                <span key={cat} className="order-cat-badge">
                                  {CATEGORY_LABELS[cat]?.[lang] || CATEGORY_LABELS[cat]?.fr || cat}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="order-card-meta">
                          <span className="status-badge" style={{ background: st.bg, color: st.text, borderColor: st.bd }}>
                            {st.label[lang] || st.label.fr}
                          </span>
                          <span className="order-date">{new Date(order.orderDate).toLocaleDateString('fr-FR')}</span>

                        </div>
                      </div>

                      <div className="order-progress-bar">
                        <div className="order-progress-fill" style={{ width: `${progress}%` }} />
                      </div>
                      <div className="order-progress-label">
                        {totalReceived} / {totalOrdered} {t('orArticlesReceived')} ({progress}%)
                      </div>

                      <div className="order-card-thumbs">
                        {(order.lines || []).slice(0, 5).map((line, idx) => (
                          <div key={idx} className="order-card-thumb" title={line.itemId?.designation?.[lang] || ''}>
                            {line.itemId?.image
                              ? <ZoomImg src={line.itemId.image} alt={line.itemId?.designation?.[lang] || ''} />
                              : <Package size={15} />
                            }
                          </div>
                        ))}
                        {(order.lines || []).length > 5 && (
                          <div className="order-card-thumb order-card-thumb--more">
                            +{order.lines.length - 5}
                          </div>
                        )}
                      </div>

                      <div className="order-card-footer">
                        <span className="order-card-lines-count">
                          {t((order.lines || []).length !== 1 ? 'orArticleMany' : 'orArticleOne', { n: (order.lines || []).length })}
                        </span>
                        <span className="order-card-open-hint">{t('orSeeDetails')} <ArrowRight size={13} /></span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {hasMoreOrders && (
                <div className="orders-load-more">
                  <button
                    onClick={() => setDisplayCount(prev => prev + 10)}
                    className="od-btn"
                  >
                    {t('orLoadMore', { shown: displayCount, total: filteredOrders.length })}
                  </button>
                </div>
              )}
            </>

          )}
        </>
      )}

      {/* Modals — always rendered outside tab conditional */}
      {showForm && (
        <OrderForm
          order={editOrder}
          companies={companies}
          suppliers={suppliers}
          onSupplierAdded={(s) => setSuppliers(prev => [...prev, s])}
          lang={lang}
          canEditSent={canEditSent}
          families={ownFamilies}
          initialSupplierId={editOrder ? '' : newOrderSupplier}
          onClose={() => { setShowForm(false); setEditOrder(null); setNewOrderSupplier(''); }}
          onSave={() => { setShowForm(false); setEditOrder(null); setNewOrderSupplier(''); fetchOrders(); }}
        />
      )}

    </div>
  );
}

/* ── Supplier (Fournisseur) Modal ──────────────────────────────── */
/* ── Order Form ─────────────────────────────────────────────────── */
// ─── Article picker for an order line ─────────────────────────────────────────
// Searches the server as you type (debounced, max 20 rows, indexed search) instead of
// downloading the whole inventory into the browser.
function ItemPicker({ item, lang, superCats, categories, families = null, onPick }) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState(!item);
  const [q, setQ] = useState('');
  // « orders.own » (e.g. Coordinateur-vitrage): only its families can be ordered
  const [superCat, setSuperCat] = useState(families?.length ? families[0] : '');
  const [category, setCategory] = useState('');
  const [results, setResults] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const reqId = useRef(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!editing) return undefined;
    const id = ++reqId.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const params = { q, limit: 20 };
        if (superCat) params.superCategory = superCat;
        if (category) params.categoryId = category;
        const res = await axios.get(`${API_URL}/inventory/lookup`, { params });
        if (id !== reqId.current) return; // a newer search is running
        setResults(res.data.items || []);
        setHasMore(!!res.data.hasMore);
        setActive(0);
      } catch (e) {
        if (id === reqId.current) setResults([]);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [q, superCat, category, editing]);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const choose = (it) => { onPick(it); setEditing(false); setQ(''); };
  const name = (it) => it?.designation?.[lang] || it?.designation?.fr || '';
  const scLabel = (sc) => sc.label?.[lang] || sc.label?.fr || sc.key;
  const catOptions = categories.filter(c => !superCat || c.superCategory === superCat);

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[active]) choose(results[active]); }
    else if (e.key === 'Escape' && item) { e.preventDefault(); setEditing(false); }
  };

  if (!editing && item) {
    return (
      <div className="item-picker item-picker--selected">
        {item.image
          ? <ZoomImg className="item-picker__thumb" src={item.image} alt={name(item)} />
          : <div className="item-picker__thumb item-picker__thumb--empty"><Package size={16} /></div>}
        <div className="item-picker__info">
          <span className="item-picker__name">{name(item)}</span>
          <span className="item-picker__meta">
            {item.codeInterne && <code>{item.codeInterne}</code>}
            {item.quantity != null && <span>{t('orStock')} : {item.quantity}</span>}
          </span>
        </div>
        <button type="button" className="item-picker__change" onClick={() => setEditing(true)}>
          <Search size={14} /> {t('orChangeItem')}
        </button>
      </div>
    );
  }

  return (
    <div className="item-picker">
      <div className="item-picker__filters">
        <select value={superCat} onChange={e => { setSuperCat(e.target.value); setCategory(''); }}>
          {!families?.length && <option value="">{t('orAllSuperCats')}</option>}
          {superCats.filter(sc => !families?.length || families.includes(sc.key)).map(sc => <option key={sc.key} value={sc.key}>{scLabel(sc)}</option>)}
        </select>
        {superCat && catOptions.length > 0 && (
          <select value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">{t('superCatAll')}</option>
            {catOptions.map(c => <option key={c.id || c._id} value={c.id || c._id}>{c.name?.[lang] || c.name?.fr}</option>)}
          </select>
        )}
        <div className="item-picker__search">
          <Search size={14} />
          <input
            ref={inputRef}
            type="text"
            value={q}
            placeholder={t('orSearchItemPlaceholder')}
            onChange={e => setQ(e.target.value)}
            onKeyDown={onKeyDown}
          />
          {loading && <LoaderCircle size={14} className="item-picker__spin" />}
        </div>
        {item && (
          <button type="button" className="item-picker__cancel" onClick={() => setEditing(false)} title={t('cancel')}>
            <X size={14} />
          </button>
        )}
      </div>
      <div className="item-picker__results" role="listbox">
        {!loading && results.length === 0 && <div className="item-picker__empty">{t('orNoItemFound')}</div>}
        {results.map((it, i) => (
          <button
            type="button"
            key={it.id}
            role="option"
            aria-selected={i === active}
            className={`item-picker__row${i === active ? ' is-active' : ''}`}
            onMouseEnter={() => setActive(i)}
            onClick={() => choose(it)}
          >
            {it.image
              ? <img loading="lazy" decoding="async" className="item-picker__thumb" src={it.image} alt="" />
              : <div className="item-picker__thumb item-picker__thumb--empty"><Package size={14} /></div>}
            <span className="item-picker__name">{name(it)}</span>
            {it.codeInterne && <code className="item-picker__code">{it.codeInterne}</code>}
            <span className={`item-picker__stock${it.quantity < (it.threshold || 0) ? ' is-low' : ''}`}>{it.quantity}</span>
          </button>
        ))}
        {hasMore && <div className="item-picker__more">{t('orRefineSearch')}</div>}
      </div>
    </div>
  );
}

function OrderForm({ order, companies, suppliers, onSupplierAdded, lang, canEditSent = false, initialSupplierId = '', families = null, onClose, onSave }) {
  const { t } = useLanguage();
  const today = new Date().toISOString().split('T')[0];
  const [showSupplierModal, setShowSupplierModal] = useState(false);

  // Super-categories / categories for the per-line filters (small lists, loaded once)
  const [superCats, setSuperCats] = useState([]);
  const [categories, setCategories] = useState([]);
  useEffect(() => {
    let alive = true;
    Promise.all([axios.get(`${API_URL}/super-categories`), axios.get(`${API_URL}/categories`)])
      .then(([sc, cat]) => { if (alive) { setSuperCats(sc.data || []); setCategories(cat.data || []); } })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const [form, setForm] = useState(order ? {
    reference: order.reference || '',
    number: order.number || '',
    categories: order.categories && order.categories.length > 0
      ? order.categories
      : (order.category ? [order.category] : []),
    companyId: order.companyId?.id || order.companyId?._id || '',
    supplierId: order.supplierId?.id || order.supplierId?._id || '',
    orderDate: order.orderDate?.split('T')[0] || today,
    expectedDate: order.expectedDate?.split('T')[0] || '',
    notes: order.notes || '',
    tva: order.tva != null ? order.tva : 20,
    status: order.status,
    lines: (order.lines || []).map(l => ({
      _id: l._id || l.id,
      itemId: l.itemId?.id || l.itemId?._id || l.itemId,
      item: l.itemId && typeof l.itemId === 'object' ? l.itemId : null, // for display only
      quantityOrdered: l.quantityOrdered,
      quantityReceived: l.quantityReceived || 0, // display only: the quantity cannot go below it
      unitPrice: l.unitPrice || 0,
      note: l.note || '',
      // ordered in the purchase unit (carton…) or in the stock unit (pièce…)
      unitMode: isConverted(l) ? 'achat' : 'stock',
    })),
  } : {
    reference: '', companyId: companies[0]?.id || '', supplierId: initialSupplierId || '',
    categories: families?.length === 1 ? [...families] : [],
    orderDate: today, expectedDate: '', notes: '', tva: 20, status: 'brouillon', lines: [],
  });

  const isLocked = order && order.status !== 'brouillon'; // sent: editable by Admin / ACHAT (canEditSent)

  const addLine = () => {
    setForm(f => ({ ...f, lines: [...f.lines, { itemId: '', item: null, quantityOrdered: 1, unitPrice: 0, note: '' }] }));
  };

  const removeLine = (idx) => {
    setForm(f => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }));
  };

  const updateLine = (idx, field, val) =>
    setForm(f => ({ ...f, lines: f.lines.map((l, i) => i === idx ? { ...l, [field]: val } : l) }));

  const pickItem = (idx, item) =>
    setForm(f => ({ ...f, lines: f.lines.map((l, i) => i === idx
      ? { ...l, itemId: item ? item.id : '', item, unitMode: item?.purchaseUnit ? 'achat' : 'stock' } : l) }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.lines.length === 0) { await dialog.alert({ variant: 'warning', message: t('orAddOneLine') }); return; }
    const missing = form.lines.findIndex(l => !l.itemId);
    if (missing !== -1) { await dialog.alert({ variant: 'warning', message: t('orLineChooseItem', { n: missing + 1 }) }); return; }
    if (form.categories.length === 0) { await dialog.alert({ variant: 'warning', message: t('orSelectOneCategory') }); return; }
    // `item` is only kept for display in the form
    const payload = { ...form, lines: form.lines.map(({ item, quantityReceived, ...l }) => l) };
    try {
      if (order) {
        await axios.put(`${API_URL}/orders/${order.id}`, payload);
      } else {
        await axios.post(`${API_URL}/orders`, payload);
      }
      onSave();
    } catch (e) { await dialog.alert(errorMessage(e, t('dlgError'))); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal xlarge" onClick={e => e.stopPropagation()}>
        <h2>{order ? t('orEditOrder', { name: order.number || t('orTheDraft') }) : t('orderNew')}</h2>
        {isLocked && (
          <div className="order-detail-notes">
            <AlertTriangle size={14} style={{ marginRight: 6 }} />{t('orAlreadySentWarn')}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="form-grid-2">
            <div className="form-group">
              <label>{t('orCompanyReq')}</label>
              <select required value={form.companyId} onChange={e => setForm(f => ({ ...f, companyId: e.target.value }))}>
                <option value="">{t('orChoose')}</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group or-cat-group">
              <label>{t('orCategoriesReq')}</label>
              <div className="or-cat-grid">
                {Object.entries(CATEGORY_LABELS).filter(([key]) => !families?.length || families.includes(key)).map(([key, label]) => {
                  const isChecked = form.categories.includes(key);
                  const isDisabled = isLocked && !canEditSent;
                  return (
                    <label
                      key={key}
                      className={`or-cat-option${isChecked ? ' is-checked' : ''}${isDisabled ? ' is-disabled' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={e => {
                          if (e.target.checked) {
                            setForm(f => ({ ...f, categories: [...f.categories, key] }));
                          } else {
                            setForm(f => ({ ...f, categories: f.categories.filter(c => c !== key) }));
                          }
                        }}
                        disabled={isDisabled}
                      />
                      <span>{label[lang] || label.fr}</span>
                    </label>
                  );
                })}
              </div>
              {form.categories.length === 0 && (
                <p className="or-field-hint or-field-hint--err">
                  {t('orSelectOneCategory')}
                </p>
              )}
              {form.categories.length > 0 && (
                <p className="or-field-hint or-field-hint--ok">
                  {t(form.categories.length > 1 ? 'orCatSelectedMany' : 'orCatSelectedOne', { n: form.categories.length })}
                </p>
              )}
            </div>
            <div className="form-group">
              <label>{t('orInternalRef')}</label>
              <input type="text" placeholder={t('orOptional')} value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>{t('orBcNumber')}</label>
              <input
                type="text"
                placeholder={t('orBcNumberPlaceholder')}
                value={form.number}
                onChange={e => setForm(f => ({ ...f, number: e.target.value }))}
                disabled={isLocked && !canEditSent}
              />
              {isLocked && canEditSent && (
                <p className="or-field-hint or-field-hint--warn">
                  <AlertTriangle size={13} style={{ marginRight: 5 }} />{t('orBcNumberAdminWarn')}
                </p>
              )}
            </div>
            <div className="form-group">
              <label>{t('orSupplier')}</label>
              <div className="or-supplier-row">
                <select value={form.supplierId} onChange={e => setForm(f => ({ ...f, supplierId: e.target.value }))}>
                  <option value="">{t('orChooseDash')}</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ''}</option>)}
                </select>
                <button type="button" className="btn-add-line" onClick={() => setShowSupplierModal(true)} title={t('orAddSupplier')}>
                  <Plus size={14} />
                </button>
              </div>
            </div>
            <div className="form-group">
              <label>{t('orOrderDate')} *</label>
              <input required type="date" value={form.orderDate} onChange={e => setForm(f => ({ ...f, orderDate: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>{t('orExpectedDateLabel')}</label>
              <input type="date" value={form.expectedDate} onChange={e => setForm(f => ({ ...f, expectedDate: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>{t('orVatPct')}</label>
              <input type="number" min={0} step="0.1" value={form.tva} onChange={e => setForm(f => ({ ...f, tva: Number(e.target.value) }))} />
            </div>
          </div>

          <div className="form-group">
            <label>{t('orNotes')}</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>

          <div className="order-lines-section">
            <div className="order-lines-head">
              <h3>{t('orOrderedItems')}</h3>
              <button type="button" className="btn-add-line" onClick={addLine}>
                {t('orAddLine')}
              </button>
            </div>

            {form.lines.length === 0 && (
              <p className="order-lines-empty">
                {t('orNoLines')}
              </p>
            )}

            {form.lines.map((line, idx) => {
              return (
                <div key={idx} className="order-line-form order-line-form--rich">
                  <div className="order-line-main">
                    <ItemPicker
                      item={line.item}
                      lang={lang}
                      families={families}
                      superCats={superCats}
                      categories={categories}
                      onPick={(it) => pickItem(idx, it)}
                    />

                    <div className="form-group order-line-qty">
                      <label>{t('orQty')}</label>
                      <input
                        type="number"
                        min={Math.max(1, Math.ceil(line.quantityReceived || 0))}
                        value={line.quantityOrdered}
                        onChange={e => updateLine(idx, 'quantityOrdered', Number(e.target.value))}
                      />
                      {line.quantityReceived > 0 && (
                        <span className="or-field-hint">{t('orLineReceivedMin', { n: line.quantityReceived })}</span>
                      )}
                    </div>

                    {/* Unit of the line: the article's purchase unit (carton of 100…) or its stock unit */}
                    {(() => {
                      const it = line.item;
                      if (!it || (!it.unit && !it.purchaseUnit)) return null;
                      const hasPurchase = !!(it.purchaseUnit && it.purchaseFactor > 0);
                      const inPurchase = hasPurchase && line.unitMode !== 'stock';
                      return (
                        <div className="form-group order-line-unit">
                          <label>{t('orLineUnit')}</label>
                          {hasPurchase ? (
                            <select value={inPurchase ? 'achat' : 'stock'} disabled={line.quantityReceived > 0}
                              title={line.quantityReceived > 0 ? t('orLineUnitLocked') : undefined}
                              onChange={e => updateLine(idx, 'unitMode', e.target.value)}>
                              <option value="achat">{unitLabel(it.purchaseUnit, lang, 2)} ({qtyWithUnit(it.purchaseFactor, it.unit, lang)})</option>
                              <option value="stock">{unitLabel(it.unit, lang, 2) || t('orStockUnitGeneric')}</option>
                            </select>
                          ) : (
                            <div className="order-line-unit__fixed">{unitLabel(it.unit, lang, 2)}</div>
                          )}
                          {inPurchase && (
                            <span className="or-field-hint or-unit-conv">
                              = {qtyWithUnit((Number(line.quantityOrdered) || 0) * it.purchaseFactor, it.unit, lang)}
                            </span>
                          )}
                        </div>
                      );
                    })()}

                    <div className="form-group order-line-price">
                      <label>{t('orUnitPrice')}</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.unitPrice}
                        onChange={e => updateLine(idx, 'unitPrice', Number(e.target.value))}
                      />
                    </div>

                    <button type="button" className="btn-remove-line" onClick={() => removeLine(idx)}><X size={15} /></button>
                  </div>

                  <div className="form-group order-line-note">
                    <label>{t('orLineNote')}</label>
                    <input
                      type="text"
                      placeholder={t('orLineNotePlaceholder')}
                      value={line.note}
                      onChange={e => updateLine(idx, 'note', e.target.value)}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose}>{t('cancel')}</button>
            <button type="submit" className="primary">
              {order ? t('update') : t('orCreateDraft')}
            </button>
          </div>
        </form>

        {showSupplierModal && (
          <SupplierFormModal
            noTerms={!!families}
            onClose={() => setShowSupplierModal(false)}
            onSaved={(s) => { onSupplierAdded(s); setForm(f => ({ ...f, supplierId: s.id })); setShowSupplierModal(false); }}
          />
        )}
      </div>
    </div>
  );
}

/* ── Purchase Requests Panel ──────────────────────────────────────────────
   Shown on the "Demandes admin" tab.
   ACHAT role sees all pending requests, can mark them as "commandé".
   Admin sees full history (pending + done).
────────────────────────────────────────────────────────────────────────── */
// ─── Paginated server lists (Demandes admin / Suivi) ─────────────────────────
// Results are cached per query for the session: switching tabs or pages shows the cached
// page instantly while a fresh copy loads in the background (stale-while-revalidate).
const pagedCache = new Map();
function usePagedList(url, params, debounceMs = 0) {
  const key = url + '?' + new URLSearchParams(params).toString();
  const [data, setData] = useState(() => pagedCache.get(key) || null);
  const [loading, setLoading] = useState(!pagedCache.has(key));
  const reqId = useRef(0);

  const load = useCallback(async (k, p) => {
    const id = ++reqId.current;
    if (!pagedCache.has(k)) setLoading(true);
    try {
      const res = await axios.get(url, { params: p });
      pagedCache.set(k, res.data);
      if (id === reqId.current) setData(res.data);
    } catch (e) { console.error(e); }
    finally { if (id === reqId.current) setLoading(false); }
  }, [url]);

  useEffect(() => {
    if (pagedCache.has(key)) { setData(pagedCache.get(key)); setLoading(false); }
    const timer = setTimeout(() => load(key, params), debounceMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const reload = useCallback(() => {
    for (const k of [...pagedCache.keys()]) if (k.startsWith(url + '?')) pagedCache.delete(k);
    return load(key, params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, load]);
  // Local edit of the cached page (optimistic updates)
  const patch = useCallback((fn) => setData(d => { const nd = d ? fn(d) : d; if (nd) pagedCache.set(key, nd); return nd; }), [key]);
  // After a successful edit: other cached pages/filters of this list may be outdated
  const dropOthers = useCallback(() => {
    for (const k of [...pagedCache.keys()]) if (k.startsWith(url + '?') && k !== key) pagedCache.delete(k);
  }, [url, key]);
  return { data, loading, reload, patch, dropOthers };
}

function Pager({ page, pages, total, limit, onPage }) {
  const { t } = useLanguage();
  if (!total || pages <= 1) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  return (
    <div className="pr-pager">
      <span className="pr-pager__info">{t('orRowsRange', { from, to, total })}</span>
      <div className="pr-pager__btns">
        <button type="button" className="pr-pager__btn" disabled={page <= 1} onClick={() => onPage(page - 1)} title={t('orPagePrev')}>
          <ChevronLeft size={15} />
        </button>
        <span className="pr-pager__page">{t('orPageOf', { page, pages })}</span>
        <button type="button" className="pr-pager__btn" disabled={page >= pages} onClick={() => onPage(page + 1)} title={t('orPageNext')}>
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

const PAGE_SIZE = 25;

function PurchaseRequestsPanel({ onChanged, isAdmin, lang }) {
  const { t } = useLanguage();
  const [filter, setFilter] = useState('pending'); // 'pending' | 'all'
  const [page, setPage] = useState(1);
  const [markingId, setMarkingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const { data, loading, reload } = usePagedList(`${API_URL}/purchase-requests`, { status: filter, page, limit: PAGE_SIZE });

  const visible = data?.items || [];
  const pendingCount = data?.pendingCount || 0;
  const changeFilter = (f) => { setFilter(f); setPage(1); };
  const refresh = async () => { await reload(); onChanged && onChanged(); };

  const onMarkOrdered = async (id) => {
    setMarkingId(id);
    try {
      await axios.patch(`${API_URL}/purchase-requests/${id}/mark-ordered`);
      await refresh();
    } catch (e) { dialog.alert(errorMessage(e, t('dlgError'))); } finally { setMarkingId(null); }
  };
  const onDelete = async (id) => {
    if (!(await dialog.confirm({ title: t('deleteTitle'), message: t('orDeleteRequestConfirm'), danger: true, confirmLabel: t('deleteAction') }))) return;
    setDeletingId(id);
    try {
      await axios.delete(`${API_URL}/purchase-requests/${id}`);
      if (visible.length === 1 && page > 1) setPage(p => p - 1);
      await refresh();
    } catch (e) { dialog.alert(errorMessage(e, t('dlgError'))); } finally { setDeletingId(null); }
  };

  function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  if (loading && !data) {
    return (
      <div className="orders-loading">
        <LoaderCircle size={22} />
        <p>{t('orLoadingRequests')}</p>
      </div>
    );
  }

  return (
    <div className="pr-panel">
      <div className="pr-panel__header">
        <div className="pr-panel__title">
          <ShoppingCart size={16} />
          <span>{t('orPurchaseRequests')}</span>
          {pendingCount > 0 && (
            <span className="pr-badge">{t('orNPending', { n: pendingCount })}</span>
          )}
        </div>
        <div className="pr-panel__tools">
          <div className="pr-filter-tabs">
            <button
              className={`pr-filter-tab ${filter === 'pending' ? 'active' : ''}`}
              onClick={() => changeFilter('pending')}
            >
              <Clock size={11} /> {t('orPending')}
            </button>
            <button
              className={`pr-filter-tab ${filter === 'all' ? 'active' : ''}`}
              onClick={() => changeFilter('all')}
            >
              {t('orSeeAll')}
            </button>
          </div>
          <button className="pr-refresh-btn orders-icon-btn orders-icon-btn--sm" onClick={refresh} title={t('orRefresh')}>
            <RefreshCw size={14} className={loading ? 'spin' : undefined} />
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="pr-empty">
          <span className="pr-empty__icon"><ShoppingCart size={20} /></span>
          <p>{filter === 'pending' ? t('orNoPendingRequests') : t('orNoRequests')}</p>
        </div>
      ) : (
        <div className={`pr-table-wrap${loading ? ' pr-table-wrap--loading' : ''}`}>
          <table className="pr-table">
            <thead>
              <tr>
                <th style={{ width: 60 }}>{t('image')}</th>
                <th>{t('orArticle')}</th>
                <th>{t('orQtyRequested')}</th>
                <th>{t('orNote')}</th>
                <th>{t('orRequestedBy')}</th>
                <th>{t('orDate')}</th>
                <th>{t('orStatus')}</th>
                <th style={{ width: 140 }}>{t('orAction')}</th>
                {isAdmin && <th style={{ width: 44 }}></th>}
              </tr>
            </thead>
            <tbody>
              {visible.map(req => (
                <tr key={req.id || req._id} className={`pr-row pr-row--${req.status}`}>
                  <td>
                    {req.itemImage
                      ? <ZoomImg src={req.itemImage} alt={req.itemName} className="pr-img" />
                      : <span className="pr-faint">—</span>
                    }
                  </td>
                  <td>
                    <strong className="pr-strong">{req.itemName || '—'}</strong>
                  </td>
                  <td>
                    <span className="pr-qty">{req.quantity}</span>
                  </td>
                  <td>
                    <span className="pr-muted">{req.note || <span className="pr-faint">—</span>}</span>
                  </td>
                  <td>
                    <span className="pr-strong">{req.requestedBy || 'Admin'}</span>
                  </td>
                  <td>
                    <span className="pr-date">{fmtDate(req.createdAt)}</span>
                  </td>
                  <td>
                    {req.status === 'pending' ? (
                      <span className="pr-status pr-status--pending">
                        <Clock size={10} /> {t('orPending')}
                      </span>
                    ) : (
                      <>
                        <span className="pr-status pr-status--done">
                          <CheckCheck size={10} /> {t('orOrdered')}
                        </span>
                        {req.orderedAt && <span className="pr-status-date">{fmtDate(req.orderedAt)}</span>}
                      </>
                    )}
                  </td>
                  <td>
                    {req.status === 'pending' ? (
                      <button
                        className="pr-mark-btn"
                        disabled={markingId === (req.id || req._id)}
                        onClick={() => onMarkOrdered(req.id || req._id)}
                      >
                        {markingId === (req.id || req._id)
                          ? <LoaderCircle size={12} className="od-spin" />
                          : <CheckCheck size={13} />
                        }
                        {t('orMarkOrdered')}
                      </button>
                    ) : (
                      <span className="pr-date">{t('orProcessed')}</span>
                    )}
                  </td>
                  {isAdmin && (
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className="pr-del-btn"
                        title={t('delete')}
                        disabled={deletingId === (req.id || req._id)}
                        onClick={() => onDelete(req.id || req._id)}
                      >
                        {deletingId === (req.id || req._id)
                          ? <LoaderCircle size={13} className="od-spin" />
                          : <Trash2 size={13} />
                        }
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <Pager page={data.page} pages={Math.ceil(data.total / data.limit)} total={data.total} limit={data.limit} onPage={setPage} />
        </div>
      )}
    </div>
  );
}

/* ── Suivi des commandes Panel ─────────────────────────────────────────────
   Shown on the "Suivi des commandes" tab. Achat + Admin only (gated at the
   tab-button level via can('orders.edit') and at the API level).

   Each row = one (order, BL) pair, built server-side from the order's own
   `receptions[]` array — so every order (sent/partial/received/cancelled)
   shows up automatically, and an order with several partial receptions
   naturally produces several rows (one per BL). Orders not yet received
   show a single "en attente" row. Date, montant BC, montant BL and état
   are always computed live from the order — never stored — so they can't
   drift. Only Facture / Mode de paiement / Type de facture / Remarque are
   editable and persisted.
────────────────────────────────────────────────────────────────────────── */
// Due date of a row: date + countdown / delay; "estimated" when based on the BL date (no invoice date yet)
function DueCell({ row, t }) {
  if (row.paiementStatus === 'paye') {
    return <span className="pr-due pr-due--ok">{t('acPaidOn', { date: row.paiementDate ? new Date(row.paiementDate).toLocaleDateString('fr-FR') : '—' })}</span>;
  }
  if (row.delaiPaiement == null) return <span className="pr-faint" title={t('acNoTermTip')}>{t('acNoTerm')}</span>;
  if (!row.echeance) return <span className="pr-faint" title={t('acNoBaseTip')}>—</span>;
  const d = new Date(row.echeance);
  const days = Math.ceil((d - new Date()) / 86400000);
  return (
    <span className={`pr-due${row.retardJours > 0 ? ' pr-due--late' : days <= 7 ? ' pr-due--soon' : ''}`}
      title={row.echeanceEstimee ? t('acEstimatedTip') : undefined}>
      <strong>{d.toLocaleDateString('fr-FR')}{row.echeanceEstimee ? '*' : ''}</strong>
      <span>{row.retardJours > 0 ? t('acLateDays', { n: row.retardJours }) : days <= 0 ? t('acDueToday') : t('acDueIn', { n: days })}</span>
    </span>
  );
}

function SuiviCommandesPanel() {
  const { t, currentLanguage: lang } = useLanguage();
  const [savingKey, setSavingKey] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [factureFilter, setFactureFilter] = useState('all'); // 'all' | 'recue' | 'non_recue' | 'sans_pdf'
  const [docsRow, setDocsRow] = useState(null); // row whose invoices / BL are open
  const newBlRef = useRef(false); // a BL was filed under a new number → reload the rows on close
  const [storage, setStorage] = useState(null);  // space used by the documents vs the free cap
  useEffect(() => {
    axios.get(`${API_URL}/order-tracking/storage`).then(r => setStorage(r.data)).catch(() => {});
  }, []);
  const [page, setPage] = useState(1);
  // Search runs on the server (debounced while typing); filters + totals + pagination too
  const { data, loading, reload, patch, dropOthers } = usePagedList(
    `${API_URL}/order-tracking`,
    { page, limit: PAGE_SIZE, q: searchTerm.trim(), facture: factureFilter },
    searchTerm ? 300 : 0,
  );
  const rows = data?.rows || [];
  const visibleRows = rows;
  const totals = data?.totals || { bc: 0, bl: 0 };
  const total = data?.total || 0;
  const fetchRows = reload;
  const changeFilter = (f) => { setFactureFilter(f); setPage(1); };

  const rowKey = (r) => `${r.orderId}::${r.blNumber}`;

  // Fields that change computed values (due date, remaining amount) reload the page of rows after saving
  const RECOMPUTE = ['factureDate', 'paiementStatus', 'montantPaye', 'factureStatus'];
  const updateField = async (row, field, value) => {
    const key = rowKey(row);
    patch(d => ({ ...d, rows: d.rows.map(r => rowKey(r) === key ? { ...r, [field]: value } : r) }));
    setSavingKey(key);
    try {
      await axios.patch(`${API_URL}/order-tracking`, {
        orderId: row.orderId,
        blNumber: row.blNumber,
        [field]: value,
      });
      dropOthers();
      if (RECOMPUTE.includes(field)) fetchRows();
    } catch (e) {
      console.error(e);
      dialog.alert(t('errSave'));
      fetchRows();
    } finally { setSavingKey(null); }
  };

  if (loading && !data) {
    return (
      <div className="orders-loading">
        <LoaderCircle size={22} />
        <p>{t('orLoadingTracking')}</p>
      </div>
    );
  }

  return (
    <div className="pr-panel">
      <div className="pr-panel__header">
        <div className="pr-panel__title">
          <ClipboardList size={16} />
          <span>{t('orTracking')}</span>
          <span className="pr-badge pr-badge--neutral">
            {t(total !== 1 ? 'orLineMany' : 'orLineOne', { n: total })}
          </span>
        </div>
        <div className="pr-panel__tools">
          <div className="pr-filter-tabs">
            <button
              className={`pr-filter-tab ${factureFilter === 'all' ? 'active' : ''}`}
              onClick={() => changeFilter('all')}
            >
              {t('orAll')}
            </button>
            <button
              className={`pr-filter-tab ${factureFilter === 'non_recue' ? 'active' : ''}`}
              onClick={() => changeFilter('non_recue')}
            >
              {t('orInvoiceNotReceived')}
            </button>
            <button
              className={`pr-filter-tab ${factureFilter === 'recue' ? 'active' : ''}`}
              onClick={() => changeFilter('recue')}
            >
              {t('orInvoiceReceived')}
            </button>
            <button
              className={`pr-filter-tab ${factureFilter === 'sans_pdf' ? 'active' : ''}`}
              onClick={() => changeFilter('sans_pdf')}
            >
              {t('tdFilterNoPdf')}
            </button>
            <button
              className={`pr-filter-tab ${factureFilter === 'a_payer' ? 'active' : ''}`}
              onClick={() => changeFilter('a_payer')}
            >
              {t('acFilterToPay')}
            </button>
            <button
              className={`pr-filter-tab ${factureFilter === 'retard' ? 'active' : ''}`}
              onClick={() => changeFilter('retard')}
            >
              {t('acFilterLate')}
            </button>
          </div>
          <StorageGauge storage={storage} compact />
          <button className="pr-refresh-btn orders-icon-btn orders-icon-btn--sm" onClick={fetchRows} title={t('orRefresh')}>
            <RefreshCw size={14} className={loading ? 'spin' : undefined} />
          </button>
        </div>
      </div>

      <div className="pr-search">
        <div className="orders-controls">
          <input
            className="search-input"
            placeholder={t('orTrackingSearchPlaceholder')}
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      {visibleRows.length === 0 ? (
        <div className="pr-empty">
          <span className="pr-empty__icon"><ClipboardList size={20} /></span>
          <p>{t('orNoOrdersToShow')}</p>
        </div>
      ) : (
        <div className={`pr-table-wrap${loading ? ' pr-table-wrap--loading' : ''}`}>
          <table className="pr-table">
            <thead>
              <tr>
                <th>{t('orDate')}</th>
                <th>{t('orSupplier')}</th>
                <th>{t('orBcNo')}</th>
                <th>BL</th>
                <th>{t('tdColumn')}</th>
                <th>{t('orAmountBC')}</th>
                <th>{t('orAmountBL')}</th>
                <th>{t('orInvoice')}</th>
                <th>{t('acInvoiceNo')}</th>
                <th>{t('acInvoiceDate')}</th>
                <th>{t('acDueDate')}</th>
                <th>{t('acPayment')}</th>
                <th>{t('acPaymentDate')}</th>
                <th>{t('orPaymentMode')}</th>
                <th>{t('orInvoiceType')}</th>
                <th>{t('orOrderState')}</th>
                <th style={{ minWidth: 180 }}>{t('orRemark')}</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(row => {
                const key = rowKey(row);
                const st = STATUS_COLORS[row.status] || STATUS_COLORS.brouillon;
                const saving = savingKey === key;
                return (
                  <tr key={key}>
                    <td className="pr-date">
                      {new Date(row.date).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="pr-strong">{row.supplierName || '—'}</td>
                    <td className="pr-num">{row.orderNumber || '—'}</td>
                    <td className="pr-num">
                      {row.blNumber
                        ? <strong>{row.blNumber}</strong>
                        : <span className="pr-faint">{t('orPending')}</span>}
                      {row.blPending && <span className="pr-bl-pending" title={t('rbPendingHint')}>{t('rbPendingChip')}</span>}
                    </td>
                    <td><DocumentsCell row={row} onOpen={setDocsRow} /></td>
                    <td className="pr-num pr-strong">{row.montantBC.toFixed(2)}</td>
                    <td className="pr-num pr-strong">{row.montantBL.toFixed(2)}</td>
                    <td>
                      <select
                        value={row.factureStatus}
                        disabled={saving}
                        onChange={e => updateField(row, 'factureStatus', e.target.value)}
                        className={`pr-cell-input ${row.factureStatus === 'recue' ? 'pr-cell-input--ok' : 'pr-cell-input--ko'}`}
                      >
                        {FACTURE_OPTIONS.map(o => <option key={o.value} value={o.value}>{t(o.label)}</option>)}
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        key={`fn-${key}-${row.factureNumber}`}
                        defaultValue={row.factureNumber}
                        placeholder="—"
                        disabled={saving}
                        onBlur={e => { const v = e.target.value.trim(); if (v !== row.factureNumber) updateField(row, 'factureNumber', v); }}
                        className="pr-cell-input pr-cell-input--mid"
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        value={ymdInput(row.factureDate)}
                        disabled={saving}
                        onChange={e => updateField(row, 'factureDate', e.target.value || null)}
                        className="pr-cell-input pr-cell-input--date"
                      />
                    </td>
                    <td><DueCell row={row} t={t} /></td>
                    <td>
                      <select
                        value={row.paiementStatus}
                        disabled={saving}
                        onChange={e => updateField(row, 'paiementStatus', e.target.value)}
                        className={`pr-cell-input ${row.paiementStatus === 'paye' ? 'pr-cell-input--ok' : row.paiementStatus === 'partiel' ? 'pr-cell-input--warn' : ''}`}
                      >
                        {PAIEMENT_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{t(o.label)}</option>)}
                      </select>
                      {row.paiementStatus === 'partiel' && (
                        <div className="pr-paid">
                          <input
                            type="number" min="0" step="0.01"
                            key={`mp-${key}-${row.montantPaye}`}
                            defaultValue={row.montantPaye || ''}
                            placeholder={t('acPaidAmount')}
                            disabled={saving}
                            onBlur={e => { const v = Number(e.target.value || 0); if (v !== row.montantPaye) updateField(row, 'montantPaye', v); }}
                            className="pr-cell-input pr-cell-input--num"
                            aria-label={t('acPaidAmount')}
                          />
                          <span>/ {money2(row.montantDu)}</span>
                        </div>
                      )}
                    </td>
                    <td>
                      <input
                        type="date"
                        value={ymdInput(row.paiementDate)}
                        disabled={saving || row.paiementStatus === 'non_paye'}
                        onChange={e => updateField(row, 'paiementDate', e.target.value || null)}
                        className="pr-cell-input pr-cell-input--date"
                      />
                    </td>
                    <td>
                      <select
                        value={row.modePaiement}
                        disabled={saving}
                        onChange={e => updateField(row, 'modePaiement', e.target.value)}
                        className="pr-cell-input"
                      >
                        {PAIEMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{t(o.label)}</option>)}
                      </select>
                    </td>
                    <td>
                      <select
                        value={row.typeFacture}
                        disabled={saving}
                        onChange={e => updateField(row, 'typeFacture', e.target.value)}
                        className="pr-cell-input"
                      >
                        {TYPE_FACTURE_OPTIONS.map(o => <option key={o.value} value={o.value}>{t(o.label)}</option>)}
                      </select>
                    </td>
                    <td>
                      <span className="status-badge" style={{ background: st.bg, color: st.text, borderColor: st.bd }}>
                        {st.label[lang] || st.label.fr}
                      </span>
                    </td>
                    <td>
                      <input
                        type="text"
                        defaultValue={row.remarque}
                        placeholder="—"
                        disabled={saving}
                        onBlur={e => { if (e.target.value !== row.remarque) updateField(row, 'remarque', e.target.value); }}
                        className="pr-cell-input pr-cell-input--wide"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} className="pr-totals-label">
                  {t('orTotalsShown')}
                </td>
                <td className="pr-num">{totals.bc.toFixed(2)}</td>
                <td className="pr-num">{totals.bl.toFixed(2)}</td>
                <td colSpan={10} className="pr-totals-pay">
                  {t('acRemaining')} <strong>{money2(totals.reste)}</strong>
                  {totals.retard > 0 && <> · <span className="pr-late">{t('acRemainingLate')} <strong>{money2(totals.retard)}</strong></span></>}
                </td>
              </tr>
            </tfoot>
          </table>
          <Pager page={data.page} pages={data.pages} total={total} limit={data.limit} onPage={setPage} />
        </div>
      )}
      {docsRow && (
        <DocumentsModal
          row={docsRow}
          storage={storage}
          onStorage={setStorage}
          onNewBl={() => { newBlRef.current = true; }}
          onClose={() => { setDocsRow(null); if (factureFilter !== 'all' || newBlRef.current) fetchRows(); newBlRef.current = false; }}
          onChange={(changes) => {
            const key = rowKey(docsRow);
            patch(d => ({ ...d, rows: d.rows.map(r => rowKey(r) === key ? { ...r, ...changes } : r) }));
          }}
        />
      )}
    </div>
  );
}