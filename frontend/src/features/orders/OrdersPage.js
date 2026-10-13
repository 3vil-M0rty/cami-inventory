import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';
import { useLanguage } from '../../context/LanguageContext';
import { useCompany } from '../../context/CompanyContext';
import './OrdersPage.css';
import { exportOrdersExcel, exportOrderPDF } from '../../utils/orderExport';
import { Search, FileText, FilePlus, LoaderCircle, Sheet, Calendar, Pencil, Trash2, ShoppingCart, CheckCheck, Clock, StepBack, CalendarClock, Package, Send, Lock, Ban, Plus, ClipboardList, RefreshCw, ZoomIn, XCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { dialog, errorMessage } from '../../components/common/dialog';
import { PAGE_PATHS, subPathFromLocation, getQueryParam, setUrl } from '../../routes';

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
  brouillon: { bg: 'rgba(161,161,170,.12)', text: '#d4d4d8', bd: 'rgba(161,161,170,.3)', label: { fr: 'Brouillon', en: 'Draft', it: 'Bozza' } },
  envoye: { bg: 'rgba(96,165,250,.12)', text: '#93c5fd', bd: 'rgba(96,165,250,.3)', label: { fr: 'Envoyé', en: 'Sent', it: 'Inviato' } },
  partielle: { bg: 'rgba(251,191,36,.12)', text: '#fcd34d', bd: 'rgba(251,191,36,.3)', label: { fr: 'Partielle', en: 'Partial', it: 'Parziale' } },
  recue: { bg: 'rgba(74,222,128,.12)', text: '#86efac', bd: 'rgba(74,222,128,.3)', label: { fr: 'Reçue', en: 'Received', it: 'Ricevuta' } },
  annulee: { bg: 'rgba(248,113,113,.12)', text: '#fca5a5', bd: 'rgba(248,113,113,.3)', label: { fr: 'Annulée', en: 'Cancelled', it: 'Annullata' } },
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
  const [items, setItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editOrder, setEditOrder] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null); // detail view
  const [receiveModal, setReceiveModal] = useState(null);
  const [receiveQty, setReceiveQty] = useState(0);
  const [receiveBlNumber, setReceiveBlNumber] = useState('');
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
  const [purchaseRequests, setPurchaseRequests] = useState([]);
  const [prLoading, setPrLoading] = useState(false);
  const ORDER_TABS = ['orders', 'requests', 'suivi'];
  // 'orders' | 'requests' | 'suivi' — kept in the URL (?onglet=suivi) so a refresh stays on the same tab
  const [activeTab, setActiveTab] = useState(() => {
    const tab = getQueryParam('onglet');
    return ORDER_TABS.includes(tab) ? tab : 'orders';
  });
  const changeTab = (tab) => {
    setActiveTab(tab);
    setUrl(PAGE_PATHS.orders, { replace: true, query: { onglet: tab === 'orders' ? null : tab } });
  };
  const [markingId, setMarkingId] = useState(null);

  // who may touch THIS order
  const canEditOrder = (o) => o.status === 'brouillon' ? can('orders.edit') : isAdmin;
  const canDeleteOrder = (o) => o.status === 'brouillon' ? (can('orders.delete') || isAdmin) : isAdmin;
  const canSendOrder = (o) => o.status === 'brouillon' && can('orders.edit');
  const canCancelOrder = (o) => (o.status === 'envoye' || o.status === 'partielle') && isAdmin;

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

  // The full inventory is only needed by the order form → loaded the first time the form opens
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const itemsRequested = useRef(false);
  const fetchItems = useCallback(async () => {
    if (itemsRequested.current) return;
    itemsRequested.current = true;
    try {
      const res = await axios.get(`${API_URL}/inventory`);
      setItems(res.data);
      setItemsLoaded(true);
    } catch (e) { console.error(e); itemsRequested.current = false; }
  }, []);

  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/fournisseurs`);
      setSuppliers(res.data || []);
    } catch (e) { console.error(e); }
  }, []);

  const fetchPurchaseRequests = useCallback(async () => {
    setPrLoading(true);
    try {
      const res = await axios.get(`${API_URL}/purchase-requests`);
      setPurchaseRequests(res.data || []);
    } catch (e) { console.error(e); } finally { setPrLoading(false); }
  }, []);

  const markOrdered = async (id) => {
    setMarkingId(id);
    try {
      await axios.patch(`${API_URL}/purchase-requests/${id}/mark-ordered`);
      await fetchPurchaseRequests();
    } catch (e) { console.error(e); } finally { setMarkingId(null); }
  };

  const [deletingPrId, setDeletingPrId] = useState(null);
  const deletePurchaseRequest = async (id) => {
    if (!(await dialog.confirm({ title: t('deleteTitle'), message: t('orDeleteRequestConfirm'), danger: true, confirmLabel: t('deleteAction') }))) return;
    setDeletingPrId(id);
    try {
      await axios.delete(`${API_URL}/purchase-requests/${id}`);
      setPurchaseRequests(prev => prev.filter(r => (r.id || r._id) !== id));
    } catch (e) { console.error(e); } finally { setDeletingPrId(null); }
  };

  useEffect(() => { fetchOrders(); fetchSuppliers(); fetchPurchaseRequests(); }, [fetchOrders, fetchSuppliers, fetchPurchaseRequests]);
  useEffect(() => { if (showForm) fetchItems(); }, [showForm, fetchItems]);

  // Keep selectedOrder in sync after a re-fetch
  useEffect(() => {
    if (selectedOrder) {
      const updated = orders.find(o => o.id === selectedOrder.id);
      if (updated) setSelectedOrder(updated);
    }
  }, [orders]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Order detail in the URL: /commandes/<id> (refresh / back button / shared link) ──
  const openOrder = (order) => {
    setSelectedOrder(order);
    setUrl(`${PAGE_PATHS.orders}/${order.id}`);
  };
  const closeOrder = ({ replace = false } = {}) => {
    setSelectedOrder(null);
    setUrl(PAGE_PATHS.orders, { replace, query: { onglet: activeTab === 'orders' ? null : activeTab } });
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
      if (found) setSelectedOrder(found);
      else setUrl(PAGE_PATHS.orders, { replace: true }); // unknown / deleted order
    }
    urlOrderApplied.current = true;
  }, [orders]);
  useEffect(() => {
    const onPop = () => {
      const [id] = subPathFromLocation();
      setSelectedOrder(id ? (ordersRef.current.find(o => o.id === id) || null) : null);
      const tab = getQueryParam('onglet');
      setActiveTab(ORDER_TABS.includes(tab) ? tab : 'orders');
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

  const handleReceive = async () => {
    if (!receiveModal) return;
    if (!receiveBlNumber.trim()) { await dialog.alert(t('orBlRequired')); return; }
    try {
      await axios.patch(`${API_URL}/orders/${receiveModal.order.id}/receive`, {
        lineId: receiveModal.line._id || receiveModal.line.id,
        quantityReceived: Number(receiveQty),
        blNumber: receiveBlNumber,          // ← AJOUT
      });
      fetchOrders();
      setReceiveModal(null);
      setReceiveBlNumber('');
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
    const answer = await dialog.prompt({
      title: t('orAdjustReceptionTitle'),
      message: t('orAdjustReceptionMsg', { name: itemName, bl: rec.blNumber, qty: rec.quantityReceived }),
      label: t('orNewQtyReceived'),
      defaultValue: String(rec.quantityReceived),
    });
    if (answer === null) return;
    const quantity = Number(String(answer).replace(',', '.'));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      await dialog.alert(t('orInvalidQtyUseCancel'));
      return;
    }
    if (quantity === rec.quantityReceived) return;
    const note = await dialog.prompt({
      title: t('orAdjustReceptionTitle'),
      message: `${rec.quantityReceived} → ${quantity}`,
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

  const openReceive = (order, line) => {
    setReceiveModal({ order, line });
    setReceiveQty(line.quantityReceived || 0);
    setReceiveBlNumber('');            // ← AJOUT
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

  const filteredOrders = orders.filter(o => {
    if (selectedCompany && o.companyId?.id !== selectedCompany && o.companyId?._id !== selectedCompany) return false;
    if (filterStatus !== 'all' && o.status !== filterStatus) return false;
    return matchesSearch(o);
  });

  // Pagination: show only first displayCount orders
  const visibleOrders = filteredOrders.slice(0, displayCount);
  const hasMoreOrders = displayCount < filteredOrders.length;
  const stats = {
    total: orders.length,
    brouillon: orders.filter(o => o.status === 'brouillon').length,
    envoye: orders.filter(o => o.status === 'envoye').length,
    partielle: orders.filter(o => o.status === 'partielle').length,
    recue: orders.filter(o => o.status === 'recue').length,
  };

  const handleExportPDF = async (order) => {
    setExportingPdf(order.id);
    try {
      const company = companies.find(c => c.id === (order.companyId?.id || order.companyId?._id)) || null;
      await exportOrderPDF(order, lang, company);
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

        <div className="order-detail-lines">
          <h2 className="order-detail-lines-title">{t('orOrderedItems')}</h2>
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
                    ? <ZoomableImg src={item.image} alt={item.designation?.[lang] || ''} />
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
                    {line.unitPrice > 0 && (
                      <span className="detail-line-price">{line.unitPrice.toFixed(2)} /u</span>
                    )}
                  </div>
                  {line.note && <p className="detail-line-note">📝 {line.note}</p>}
                </div>
                <div className="detail-line-qty-block">
                  <div className="detail-line-qty-bar">
                    <div className={`detail-line-qty-fill ${isComplete ? 'detail-line-qty-fill--done' : 'detail-line-qty-fill--open'}`} style={{ width: `${linePct}%` }} />
                  </div>
                  <div className="detail-line-qty-text">
                    {received} / {line.quantityOrdered}
                    {isComplete && <span className="line-check"> ✓</span>}
                  </div>
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
                      <button className="btn-receive" onClick={() => openReceive(order, line)}>
                        {t('orReceive')}
                      </button>
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
                              {item?.image ? <ZoomableImg src={item.image} alt={name} /> : <Package size={14} />}
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
                                {line.quantityReceived || 0} / {line.quantityOrdered}
                              </div>
                            )}
                            <div className="reception-row__qty">+{rec.quantityReceived}</div>
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

        {/* Totals */}
        <div className="order-detail-totals">
          <div className="order-detail-totals__row"><span>{t('orTotalHT')}</span><strong>{totalHT.toFixed(2)}</strong></div>
          <div className="order-detail-totals__row"><span>{t('orVatRate', { rate: tvaRate })}</span><strong>{(totalHT * tvaRate / 100).toFixed(2)}</strong></div>
          <div className="order-detail-totals__row order-detail-totals__ttc"><span>{t('orTotalTTC')}</span><strong>{ttc.toFixed(2)}</strong></div>
        </div>

        {receiveModal && (
          <ReceiveModal
            receiveModal={receiveModal}
            receiveQty={receiveQty}
            lang={lang}
            setReceiveQty={setReceiveQty}
            blNumber={receiveBlNumber}
            setBlNumber={setReceiveBlNumber}
            onConfirm={handleReceive}
            onClose={() => { setReceiveModal(null); setReceiveBlNumber(''); }}
          />
        )}
        {showForm && (
          <OrderForm
            order={editOrder}
            items={items}
            itemsLoaded={itemsLoaded}
            companies={companies}
            suppliers={suppliers}
            onSupplierAdded={(s) => setSuppliers(prev => [...prev, s])}
            lang={lang}
            isAdmin={isAdmin}
            onClose={() => { setShowForm(false); setEditOrder(null); }}
            onSave={() => { setShowForm(false); setEditOrder(null); fetchOrders(); }}
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
            className={`orders-tab-btn ${activeTab === 'orders' ? 'active' : ''}`}
            onClick={() => changeTab('orders')}
          >
            <ShoppingCart size={15} /> {t('navOrders')}

          </button>

          {can('orders.edit') && (
            <button
              className={`orders-tab-btn ${activeTab === 'requests' ? 'active' : ''}`}
              onClick={() => { changeTab('requests'); fetchPurchaseRequests(); }}
            >
              <ShoppingCart size={13} />
              {t('Demandesadmin')}
              {purchaseRequests.filter(r => r.status === 'pending').length > 0 && (
                <span className="orders-tab-badge orders-tab-badge--orange">
                  {purchaseRequests.filter(r => r.status === 'pending').length}
                </span>
              )}
            </button>
          )}

          {can('orders.edit') && (
            <button
              className={`orders-tab-btn ${activeTab === 'suivi' ? 'active' : ''}`}
              onClick={() => changeTab('suivi')}
            >
              <ClipboardList size={13} />
              {t('orTracking')}
            </button>
          )}

        </div>
        <div className="orders-header__actions">
          <button className="orders-icon-btn orders-icon-btn--excel" title='Excel' onClick={() => exportOrdersExcel(filteredOrders, lang)}>
            <Sheet size={16} />
          </button>
          {can('orders.edit') && (
            <button className="btn-primary" onClick={() => { setEditOrder(null); setShowForm(true); }}>
              <FilePlus size={15} />{t('orderNew')}
            </button>
          )}
        </div>
      </header>

      {/* ── Tab content ──────────────────────────────────────────── */}
      {activeTab === 'requests' ? (
        <PurchaseRequestsPanel
          requests={purchaseRequests}
          loading={prLoading}
          markingId={markingId}
          deletingId={deletingPrId}
          onMarkOrdered={markOrdered}
          onDelete={deletePurchaseRequest}
          onRefresh={fetchPurchaseRequests}
          isAdmin={isAdmin}
          lang={lang}
        />
      ) : activeTab === 'suivi' ? (
        <SuiviCommandesPanel />
      ) : (
        <>
          <div className="orders-stats">
            {[
              { label: 'orStatTotal', value: stats.total, color: '#f4f4f5' },
              { label: 'orStatDrafts', value: stats.brouillon, color: '#a1a1aa' },
              { label: 'orStatSent', value: stats.envoye, color: '#93c5fd' },
              { label: 'orStatPartial', value: stats.partielle, color: '#fcd34d' },
              { label: 'orStatReceived', value: stats.recue, color: '#86efac' },
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
                              ? <img loading="lazy" decoding="async" src={line.itemId.image} alt="" />
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
                        <span className="order-card-open-hint">{t('orSeeDetails')}</span>
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
          items={items}
          itemsLoaded={itemsLoaded}
          companies={companies}
          suppliers={suppliers}
          onSupplierAdded={(s) => setSuppliers(prev => [...prev, s])}
          lang={lang}
          onClose={() => { setShowForm(false); setEditOrder(null); }}
          onSave={() => { setShowForm(false); setEditOrder(null); fetchOrders(); }}
        />
      )}

      {receiveModal && (
        <ReceiveModal
          receiveModal={receiveModal}
          receiveQty={receiveQty}
          lang={lang}
          setReceiveQty={setReceiveQty}
          blNumber={receiveBlNumber}
          setBlNumber={setReceiveBlNumber}
          onConfirm={handleReceive}
          onClose={() => { setReceiveModal(null); setReceiveBlNumber(''); }}
        />
      )}
    </div>
  );
}

/* ── Receive Modal (shared between list & detail view) ──────────── */
function ReceiveModal({ receiveModal, receiveQty, lang, setReceiveQty, blNumber, setBlNumber, onConfirm, onClose }) {
  const { t } = useLanguage();
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--receive" onClick={e => e.stopPropagation()}>
        <h2>{t('orReceiveTitle')}</h2>
        <div className="or-modal-sub">
          <strong>{receiveModal.line.itemId?.designation?.[lang] || receiveModal.line.itemId?.designation?.fr}</strong>
          {t('orAlreadyReceived', { received: receiveModal.line.quantityReceived || 0, ordered: receiveModal.line.quantityOrdered })}
        </div>
        <div className="form-group">
          <label>{t('orTotalQtyReceived')}</label>
          <div className="or-qty-row">
          <input
            type="number"
            min={receiveModal.line.quantityReceived || 0}
            max={receiveModal.line.quantityOrdered}
            value={receiveQty}
            onChange={e => setReceiveQty(e.target.value)}
            autoFocus
          />
          <span>
            / {receiveModal.line.quantityOrdered}
          </span>
          </div>
        </div>
        <div className="form-group">
          <label>{t('orBlNumberLabel')}</label>
          <input
            type="text"
            placeholder={t('orBlPlaceholder')}
            value={blNumber}
            onChange={e => setBlNumber(e.target.value)}
          />
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>{t('cancel')}</button>
          <button
            className="primary or-confirm-receive"
            onClick={onConfirm}
            disabled={Number(receiveQty) <= (receiveModal.line.quantityReceived || 0) || !blNumber.trim()}
          >
            {t('orConfirmReception')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Supplier (Fournisseur) Modal ──────────────────────────────── */
function SupplierModal({ onClose, onSaved }) {
  const { t } = useLanguage();
  const [form, setForm] = useState({ name: '', code: '', contact: '', phone: '', email: '', address: '', city: '', ice: '', rc: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError(t('orNameRequired')); return; }
    setSaving(true); setError('');
    try {
      const r = await axios.post(`${API_URL}/fournisseurs`, form);
      onSaved(r.data);
    } catch (err) { setError(errorMessage(err, t('dlgError'))); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay modal-overlay--top" onClick={onClose}>
      <div className="modal modal--supplier" onClick={e => e.stopPropagation()}>
        <h2>{t('orNewSupplier')}</h2>
        <form onSubmit={submit}>
          <div className="form-grid-2">
            <div className="form-group"><label>{t('orNameReq')}</label><input value={form.name} onChange={set('name')} autoFocus /></div>
            <div className="form-group"><label>{t('orSupplierCode')}</label><input value={form.code} onChange={set('code')} /></div>
            <div className="form-group"><label>{t('orContact')}</label><input value={form.contact} onChange={set('contact')} /></div>
            <div className="form-group"><label>{t('orPhone')}</label><input value={form.phone} onChange={set('phone')} /></div>
            <div className="form-group"><label>{t('orEmail')}</label><input type="email" value={form.email} onChange={set('email')} /></div>
            <div className="form-group"><label>{t('orCity')}</label><input value={form.city} onChange={set('city')} /></div>
            <div className="form-group"><label>ICE</label><input value={form.ice} onChange={set('ice')} /></div>
            <div className="form-group"><label>RC</label><input value={form.rc} onChange={set('rc')} /></div>
          </div>
          <div className="form-group"><label>{t('orAddress')}</label><input value={form.address} onChange={set('address')} /></div>
          <div className="form-group"><label>{t('orNotes')}</label><textarea rows={2} value={form.notes} onChange={set('notes')} /></div>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" onClick={onClose}>{t('cancel')}</button>
            <button type="submit" className="primary" disabled={saving}>{saving ? '…' : t('orCreateSupplier')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Order Form ─────────────────────────────────────────────────── */
/* ── Image Preview Modal (fullscreen, same as Inventory) ───── */
function ImagePreviewModal({ src, alt, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return ReactDOM.createPortal(
    <div className="modal-overlay image-preview-overlay" onClick={onClose}>
      <div className="image-preview-modal" onClick={e => e.stopPropagation()}>
        <button type="button" className="image-preview-close" onClick={onClose}>
          <XCircle size={22} strokeWidth={2} />
        </button>
        <img src={src} alt={alt} className="image-preview-img" />
      </div>
    </div>,
    document.body
  );
}

/* Image that opens the fullscreen preview on click (manages its own modal) */
function ZoomableImg({ src, alt = '', className = '' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <img
        loading="lazy" decoding="async" src={src} alt={alt}
        className={`${className} zoomable-img`.trim()}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
      />
      {open && <ImagePreviewModal src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

function OrderForm({ order, items, itemsLoaded = true, companies, suppliers, onSupplierAdded, lang, isAdmin, onClose, onSave }) {
  const { t } = useLanguage();
  const today = new Date().toISOString().split('T')[0];
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);

  // Build super-categories and category maps from items list
  const superCatMap = {};
  items.forEach(it => {
    const sc = it.superCategory || 'autre';
    if (!superCatMap[sc]) superCatMap[sc] = { key: sc, label: sc, categories: {} };
    const catId = it.categoryId?.id || it.categoryId?._id;
    if (catId && it.categoryId) {
      superCatMap[sc].categories[catId] = {
        id: catId,
        name: it.categoryId.name?.[lang] || it.categoryId.name?.fr || catId,
        color: it.categoryId.color,
      };
    }
  });
  const superCats = Object.values(superCatMap);

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
      quantityOrdered: l.quantityOrdered,
      unitPrice: l.unitPrice || 0,
      note: l.note || '',
    })),
  } : {
    reference: '', companyId: companies[0]?.id || '', supplierId: '',
    categories: [],
    orderDate: today, expectedDate: '', notes: '', tva: 20, status: 'brouillon', lines: [],
  });

  const isLocked = order && order.status !== 'brouillon'; // admin-only edit beyond draft

  // Per-line search/filter state — pre-populate one entry per existing line when editing
  const [lineFilters, setLineFilters] = useState(
    () => (order?.lines || []).map(() => ({ search: '', superCat: '', category: '' }))
  );

  const addLine = () => {
    setForm(f => ({ ...f, lines: [...f.lines, { itemId: items[0]?.id || '', quantityOrdered: 1, unitPrice: 0, note: '' }] }));
    setLineFilters(f => [...f, { search: '', superCat: '', category: '' }]);
  };

  const removeLine = (idx) => {
    setForm(f => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }));
    setLineFilters(f => f.filter((_, i) => i !== idx));
  };

  const updateLine = (idx, field, val) =>
    setForm(f => ({ ...f, lines: f.lines.map((l, i) => i === idx ? { ...l, [field]: val } : l) }));

  const updateLineFilter = (idx, field, val) => {
    setLineFilters(f => f.map((lf, i) => i === idx ? { ...lf, [field]: val } : lf));

    // Keep the selected article in sync with what the dropdown shows: if the current article is no
    // longer in the filtered list, select the first match (a <select> whose value is not among its
    // options DISPLAYS the first option but keeps the old value → the wrong article was saved)
    if (field === 'search' || field === 'superCat' || field === 'category') {
      const nextFilters = lineFilters.map((lf, i) => i === idx ? { ...lf, [field]: val } : lf);
      const lf = nextFilters[idx];
      const matches = items.filter(it => {
        if (lf.superCat && (it.superCategory || 'autre') !== lf.superCat) return false;
        if (lf.category) {
          const catId = it.categoryId?.id || it.categoryId?._id;
          if (catId !== lf.category) return false;
        }
        if (lf.search) {
          const tokens = lf.search.toLowerCase().split(/\s+/).filter(Boolean);
          const name = (it.designation?.[lang] || it.designation?.fr || '').toLowerCase();
          const code = (it.codeInterne || '').toLowerCase();
          const supplierCodes = (it.supplierCodes || []).map(sc => (sc.code || '').toLowerCase()).join(' ');
          if (!tokens.every(tok => name.includes(tok) || code.includes(tok) || supplierCodes.includes(tok))) return false;
        }
        return true;
      });
      const currentId = String(form.lines[idx]?.itemId || '');
      if (matches.length > 0 && !matches.some(m => String(m.id) === currentId)) {
        updateLine(idx, 'itemId', matches[0].id);
      }
    }
  };
  const getFilteredItems = (idx) => {
    const lf = lineFilters[idx] || { search: '', superCat: '', category: '' };
    return items.filter(it => {
      if (lf.superCat && (it.superCategory || 'autre') !== lf.superCat) return false;
      if (lf.category) {
        const catId = it.categoryId?.id || it.categoryId?._id;
        if (catId !== lf.category) return false;
      }
      if (lf.search) {
        const tokens = lf.search.toLowerCase().split(/\s+/).filter(Boolean);
        const name = (it.designation?.[lang] || it.designation?.fr || '').toLowerCase();
        const code = (it.codeInterne || '').toLowerCase();
        const supplierCodes = (it.supplierCodes || []).map(sc => (sc.code || '').toLowerCase()).join(' ');
        if (!tokens.every(tok => name.includes(tok) || code.includes(tok) || supplierCodes.includes(tok))) return false;
      }
      return true;
    });
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.lines.length === 0) { await dialog.alert({ variant: 'warning', message: t('orAddOneLine') }); return; }
    const missing = form.lines.findIndex(l => !l.itemId || !items.some(it => String(it.id) === String(l.itemId)));
    if (itemsLoaded && missing !== -1) { await dialog.alert({ variant: 'warning', message: t('orLineChooseItem', { n: missing + 1 }) }); return; }
    if (form.categories.length === 0) { await dialog.alert({ variant: 'warning', message: t('orSelectOneCategory') }); return; }
    try {
      if (order) {
        await axios.put(`${API_URL}/orders/${order.id}`, form);
      } else {
        await axios.post(`${API_URL}/orders`, form);
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
            {t('orAlreadySentWarn')}
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
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => {
                  const isChecked = form.categories.includes(key);
                  const isDisabled = isLocked && !isAdmin;
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
                disabled={isLocked && !isAdmin}
              />
              {isLocked && isAdmin && (
                <p className="or-field-hint or-field-hint--warn">
                  {t('orBcNumberAdminWarn')}
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
              <button type="button" className="btn-add-line" onClick={addLine} disabled={!itemsLoaded}>
                {itemsLoaded ? t('orAddLine') : t('orLoadingItems')}
              </button>
            </div>

            {form.lines.length === 0 && (
              <p className="order-lines-empty">
                {t('orNoLines')}
              </p>
            )}

            {form.lines.map((line, idx) => {
              const lf = lineFilters[idx] || { search: '', superCat: '', category: '' };
              const filteredForLine = getFilteredItems(idx);
              const selectedItem = items.find(it => it.id === line.itemId || it._id === line.itemId);
              const scCategories = lf.superCat ? Object.values(superCatMap[lf.superCat]?.categories || {}) : [];

              return (
                <div key={idx} className="order-line-form order-line-form--rich">
                  <div className="order-line-filters">
                    <select
                      className="line-filter-select"
                      value={lf.superCat}
                      onChange={e => updateLineFilter(idx, 'superCat', e.target.value)}
                    >
                      <option value="">{t('orAllSuperCats')}</option>
                      {superCats.map(sc => (
                        <option key={sc.key} value={sc.key}>{sc.label}</option>
                      ))}
                    </select>

                    {scCategories.length > 0 && (
                      <select
                        className="line-filter-select"
                        value={lf.category}
                        onChange={e => updateLineFilter(idx, 'category', e.target.value)}
                      >
                        <option value="">{t('superCatAll')}</option>
                        {scCategories.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    )}

                    <input
                      className="line-filter-search"
                      type="text"
                      placeholder={t('orSearchItemPlaceholder')}
                      value={lf.search}
                      onChange={e => updateLineFilter(idx, 'search', e.target.value)}
                    />
                  </div>

                  <div className="order-line-main">
                    <div className="line-item-selector">
                      {selectedItem?.image && (
                        <button
                          type="button"
                          className="line-item-preview-btn"
                          onClick={() => setPreviewImage({ src: selectedItem.image, alt: selectedItem.designation?.[lang] || '' })}
                        >
                          <img loading="lazy" decoding="async" className="line-item-preview" src={selectedItem.image} alt="" />
                          <span className="line-item-zoom"><ZoomIn size={16} strokeWidth={2} /></span>
                        </button>
                      )}
                      {!selectedItem?.image && (
                        <div className="line-item-preview line-item-preview--placeholder"><Package size={16} /></div>
                      )}
                      <div className="form-group">
                        <label>{t('orArticle')}</label>
                        <select
                          value={line.itemId}
                          onChange={e => updateLine(idx, 'itemId', e.target.value)}
                        >
                          {/* The saved article is always shown, even when the search hides it,
                              so what is displayed is always what will be saved */}
                          {selectedItem && !filteredForLine.some(it => String(it.id) === String(selectedItem.id)) && (
                            <option value={selectedItem.id}>
                              {selectedItem.codeInterne ? `[${selectedItem.codeInterne}] ` : ''}{selectedItem.designation?.[lang] || selectedItem.designation?.fr} {t('orSelected')}
                            </option>
                          )}
                          {!selectedItem && (
                            <option value="">{filteredForLine.length === 0 ? t('orNoItemFound') : t('orChooseItem')}</option>
                          )}
                          {filteredForLine.map(it => (
                            <option key={it.id} value={it.id}>
                              {it.codeInterne ? `[${it.codeInterne}] ` : ''}{it.designation?.[lang] || it.designation?.fr}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="form-group order-line-qty">
                      <label>{t('orQty')}</label>
                      <input
                        type="number"
                        min={1}
                        value={line.quantityOrdered}
                        onChange={e => updateLine(idx, 'quantityOrdered', Number(e.target.value))}
                      />
                    </div>

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

                    <button type="button" className="btn-remove-line" onClick={() => removeLine(idx)}>×</button>
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
          <SupplierModal
            onClose={() => setShowSupplierModal(false)}
            onSaved={(s) => { onSupplierAdded(s); setForm(f => ({ ...f, supplierId: s.id })); setShowSupplierModal(false); }}
          />
        )}

        {previewImage && (
          <ImagePreviewModal
            src={previewImage.src}
            alt={previewImage.alt}
            onClose={() => setPreviewImage(null)}
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
function PurchaseRequestsPanel({ requests, loading, markingId, deletingId, onMarkOrdered, onDelete, onRefresh, isAdmin, lang }) {
  const { t } = useLanguage();
  const [filter, setFilter] = useState('pending'); // 'pending' | 'all'

  const visible = filter === 'pending'
    ? requests.filter(r => r.status === 'pending')
    : requests;

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  if (loading) {
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
              onClick={() => setFilter('pending')}
            >
              <Clock size={11} /> {t('orPending')}
            </button>
            <button
              className={`pr-filter-tab ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              {t('orSeeAll')}
            </button>
          </div>
          <button className="pr-refresh-btn orders-icon-btn orders-icon-btn--sm" onClick={onRefresh} title={t('orRefresh')}>
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="pr-empty">
          <span className="pr-empty__icon"><ShoppingCart size={20} /></span>
          <p>{filter === 'pending' ? t('orNoPendingRequests') : t('orNoRequests')}</p>
        </div>
      ) : (
        <div className="pr-table-wrap">
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
                      ? <ZoomableImg src={req.itemImage} alt={req.itemName} className="pr-img" />
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
function SuiviCommandesPanel() {
  const { t, currentLanguage: lang } = useLanguage();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [factureFilter, setFactureFilter] = useState('all'); // 'all' | 'recue' | 'non_recue'

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/order-tracking`);
      setRows(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const rowKey = (r) => `${r.orderId}::${r.blNumber}`;

  const updateField = async (row, field, value) => {
    const key = rowKey(row);
    setRows(prev => prev.map(r => rowKey(r) === key ? { ...r, [field]: value } : r));
    setSavingKey(key);
    try {
      await axios.patch(`${API_URL}/order-tracking`, {
        orderId: row.orderId,
        blNumber: row.blNumber,
        [field]: value,
      });
    } catch (e) {
      console.error(e);
      dialog.alert(t('errSave'));
      fetchRows();
    } finally { setSavingKey(null); }
  };

  const visibleRows = rows.filter(r => {
    if (factureFilter !== 'all' && r.factureStatus !== factureFilter) return false;
    if (searchTerm.trim()) {
      const tokens = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
      const haystack = [r.supplierName, r.orderNumber, r.blNumber, r.remarque].join(' ').toLowerCase();
      if (!tokens.every(tok => haystack.includes(tok))) return false;
    }
    return true;
  });

  const totals = visibleRows.reduce((acc, r) => ({
    bc: acc.bc + (r.montantBC || 0),
    bl: acc.bl + (r.montantBL || 0),
  }), { bc: 0, bl: 0 });

  if (loading) {
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
            {t(visibleRows.length !== 1 ? 'orLineMany' : 'orLineOne', { n: visibleRows.length })}
          </span>
        </div>
        <div className="pr-panel__tools">
          <div className="pr-filter-tabs">
            <button
              className={`pr-filter-tab ${factureFilter === 'all' ? 'active' : ''}`}
              onClick={() => setFactureFilter('all')}
            >
              {t('orAll')}
            </button>
            <button
              className={`pr-filter-tab ${factureFilter === 'non_recue' ? 'active' : ''}`}
              onClick={() => setFactureFilter('non_recue')}
            >
              {t('orInvoiceNotReceived')}
            </button>
            <button
              className={`pr-filter-tab ${factureFilter === 'recue' ? 'active' : ''}`}
              onClick={() => setFactureFilter('recue')}
            >
              {t('orInvoiceReceived')}
            </button>
          </div>
          <button className="pr-refresh-btn orders-icon-btn orders-icon-btn--sm" onClick={fetchRows} title={t('orRefresh')}>
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="pr-search">
        <div className="orders-controls">
          <input
            className="search-input"
            placeholder={t('orTrackingSearchPlaceholder')}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {visibleRows.length === 0 ? (
        <div className="pr-empty">
          <span className="pr-empty__icon"><ClipboardList size={20} /></span>
          <p>{t('orNoOrdersToShow')}</p>
        </div>
      ) : (
        <div className="pr-table-wrap">
          <table className="pr-table">
            <thead>
              <tr>
                <th>{t('orDate')}</th>
                <th>{t('orSupplier')}</th>
                <th>{t('orBcNo')}</th>
                <th>BL</th>
                <th>{t('orAmountBC')}</th>
                <th>{t('orAmountBL')}</th>
                <th>{t('orInvoice')}</th>
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
                    </td>
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
                <td colSpan={4} className="pr-totals-label">
                  {t('orTotalsShown')}
                </td>
                <td className="pr-num">{totals.bc.toFixed(2)}</td>
                <td className="pr-num">{totals.bl.toFixed(2)}</td>
                <td colSpan={5}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}