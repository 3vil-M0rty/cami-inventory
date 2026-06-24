import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useLanguage } from '../../context/LanguageContext';
import { useCompany } from '../../context/CompanyContext';
import './OrdersPage.css';
import { exportOrdersExcel, exportOrderPDF } from '../../utils/orderExport';
import { Search, FileText, FilePlus, LoaderCircle, Sheet, Calendar, Pencil, Trash2, ShoppingCart, CheckCheck, Clock, StepBack, CalendarClock, Package, Send, Lock, Ban, Plus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const STATUS_COLORS = {
  brouillon: { bg: '#f3f4f6', text: '#374151', label: { fr: 'Brouillon', en: 'Draft',     it: 'Bozza' } },
  envoye:    { bg: '#e0e7ff', text: '#3730a3', label: { fr: 'Envoyé',    en: 'Sent',      it: 'Inviato' } },
  partielle: { bg: '#dbeafe', text: '#1e40af', label: { fr: 'Partielle', en: 'Partial',   it: 'Parziale' } },
  recue:     { bg: '#dcfce7', text: '#166534', label: { fr: 'Reçue',     en: 'Received',  it: 'Ricevuta' } },
  annulee:   { bg: '#fee2e2', text: '#991b1b', label: { fr: 'Annulée',   en: 'Cancelled', it: 'Annullata' } },
};

export default function OrdersPage() {
  const { currentLanguage: lang, t } = useLanguage();
  const { companies, selectedCompany } = useCompany();
  const [orders, setOrders] = useState([]);
  const [items, setItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editOrder, setEditOrder] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null); // detail view
  const [receiveModal, setReceiveModal] = useState(null);
  const [receiveQty, setReceiveQty] = useState(0);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [exportingPdf, setExportingPdf] = useState(null);
  const [sendingId, setSendingId] = useState(null);

  // ── Purchase requests (admin → ACHAT) ─────────────────────────────
  const { can } = useAuth();
  const isAdmin = can('admin.view');
  const canReceive = can('orders.receive') || isAdmin;
  const [purchaseRequests, setPurchaseRequests] = useState([]);
  const [prLoading, setPrLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('orders'); // 'orders' | 'requests'
  const [markingId, setMarkingId] = useState(null);

  // who may touch THIS order
  const canEditOrder   = (o) => o.status === 'brouillon' ? can('orders.edit') : isAdmin;
  const canDeleteOrder = (o) => o.status === 'brouillon' ? (can('orders.delete') || isAdmin) : isAdmin;
  const canSendOrder   = (o) => o.status === 'brouillon' && can('orders.edit');
  const canCancelOrder = (o) => (o.status === 'envoye' || o.status === 'partielle') && isAdmin;

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/orders`);
      setOrders(res.data);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);

  const fetchItems = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/inventory`);
      setItems(res.data);
    } catch (e) { console.error(e); }
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
    if (!window.confirm('Supprimer cette demande ?')) return;
    setDeletingPrId(id);
    try {
      await axios.delete(`${API_URL}/purchase-requests/${id}`);
      setPurchaseRequests(prev => prev.filter(r => (r.id || r._id) !== id));
    } catch (e) { console.error(e); } finally { setDeletingPrId(null); }
  };

  useEffect(() => { fetchOrders(); fetchItems(); fetchSuppliers(); fetchPurchaseRequests(); }, [fetchOrders, fetchItems, fetchSuppliers, fetchPurchaseRequests]);

  // Keep selectedOrder in sync after a re-fetch
  useEffect(() => {
    if (selectedOrder) {
      const updated = orders.find(o => o.id === selectedOrder.id);
      if (updated) setSelectedOrder(updated);
    }
  }, [orders]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette commande ?')) return;
    try {
      await axios.delete(`${API_URL}/orders/${id}`);
      if (selectedOrder?.id === id) setSelectedOrder(null);
      fetchOrders();
    } catch (e) { alert(e.response?.data?.error || 'Erreur'); }
  };

  const handleSend = async (order) => {
    if (!window.confirm('Envoyer le bon de commande au fournisseur ?\nUn numéro sera attribué et il ne pourra plus être modifié par le service achat.')) return;
    setSendingId(order.id);
    try {
      await axios.post(`${API_URL}/orders/${order.id}/send`);
      await fetchOrders();
    } catch (e) { alert(e.response?.data?.error || 'Erreur'); }
    finally { setSendingId(null); }
  };

  const handleCancel = async (order) => {
    if (!window.confirm('Annuler ce bon de commande ?')) return;
    try {
      await axios.post(`${API_URL}/orders/${order.id}/cancel`);
      await fetchOrders();
    } catch (e) { alert(e.response?.data?.error || 'Erreur'); }
  };

  const handleReceive = async () => {
    if (!receiveModal) return;
    try {
      await axios.patch(`${API_URL}/orders/${receiveModal.order.id}/receive`, {
        lineId: receiveModal.line._id || receiveModal.line.id,
        quantityReceived: Number(receiveQty),
      });
      fetchOrders();
      setReceiveModal(null);
    } catch (e) { alert(e.response?.data?.error || 'Erreur'); }
  };

  const openReceive = (order, line) => {
    setReceiveModal({ order, line });
    setReceiveQty(line.quantityReceived || 0);
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
      ...(order.lines || []).map(l =>
        l.itemId?.designation?.[lang] || l.itemId?.designation?.fr || ''
      ),
    ].join(' ').toLowerCase();
    return tokens.every(tok => haystack.includes(tok));
  };

  const filteredOrders = orders.filter(o => {
    if (selectedCompany && o.companyId?.id !== selectedCompany && o.companyId?._id !== selectedCompany) return false;
    if (filterStatus !== 'all' && o.status !== filterStatus) return false;
    return matchesSearch(o);
  });

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
    } catch (e) { console.error(e); alert('Erreur export PDF'); }
    finally { setExportingPdf(null); }
  };

  const orderTitle = (o) => o.number || o.reference || (o.status === 'brouillon' ? 'Brouillon' : '—');

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
        <div className="order-detail-back">
          <div className="order-detail-actions">
            <button className="btn-back" onClick={() => setSelectedOrder(null)}>
              <StepBack size={15} />
              {t('backCommandes')}
            </button>

            <button
              className="btn-pdf"
              title='PDF'
              onClick={() => handleExportPDF(order)}
              disabled={exportingPdf === order.id}
            >
              {exportingPdf === order.id ? <LoaderCircle size={15} /> : <FileText size={15} />}
            </button>

            {canSendOrder(order) && (
              <button className="btn-send" onClick={() => handleSend(order)} disabled={sendingId === order.id}>
                {sendingId === order.id ? <LoaderCircle size={15} /> : <Send size={14} />} Envoyer
              </button>
            )}

            {canEditOrder(order) ? (
              <button className="btn-edit" title={t('edit')} onClick={() => { setEditOrder(order); setShowForm(true); }}>
                <Pencil size={15} />
              </button>
            ) : locked && (
              <span className="bc-lock" title="Verrouillé — admin uniquement"><Lock size={13} /> Verrouillé</span>
            )}

            {canCancelOrder(order) && (
              <button className="btn-cancel-order" onClick={() => handleCancel(order)}><Ban size={14} /> Annuler</button>
            )}

            {canDeleteOrder(order) && (
              <button className="btn-delete" title={t('delete')} onClick={() => handleDelete(order.id)}>
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </div>

        <div className="order-detail-header">
          <div>
            <h1 className="order-detail-ref">{orderTitle(order)}</h1>
            <div className="order-detail-meta">
              {order.companyId && <span className="order-company-badge">{order.companyId.name}</span>}
              {(order.supplierId?.name || order.supplier) && <span className="order-supplier">— {order.supplierId?.name || order.supplier}</span>}
              <span className="order-date" style={{ marginLeft: 8 }}>
                <Calendar size={15} /> {new Date(order.orderDate).toLocaleDateString('fr-FR')}
              </span>
              {order.expectedDate && (
                <span className="order-date">
                  <CalendarClock size={15} /> {new Date(order.expectedDate).toLocaleDateString('fr-FR')}
                </span>
              )}
              {order.sentAt && (
                <span className="order-date">
                  <Send size={13} /> {new Date(order.sentAt).toLocaleDateString('fr-FR')}{order.sentBy ? ` · ${order.sentBy}` : ''}
                </span>
              )}
            </div>
          </div>
          <span className="status-badge status-badge--lg" style={{ background: st.bg, color: st.text }}>
            {st.label[lang] || st.label.fr}
          </span>
        </div>

        <div className="order-detail-progress-wrap">
          <div className="order-progress-bar order-progress-bar--lg">
            <div className="order-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="order-progress-label">
            {totalReceived} / {totalOrdered}{t('articlesRecues') || ' articles reçus '}({progress}%)
          </div>
        </div>

        {order.notes && (
          <div className="order-detail-notes">
            <strong>Notes :</strong> {order.notes}
          </div>
        )}

        <div className="order-detail-lines">
          <h2 className="order-detail-lines-title">Articles commandés</h2>
          {(order.lines || []).map((line, idx) => {
            const item = line.itemId;
            const received = line.quantityReceived || 0;
            const isComplete = received >= line.quantityOrdered;
            const linePct = line.quantityOrdered > 0 ? Math.round((received / line.quantityOrdered) * 100) : 0;
            const supId = (order.supplierId?.id || order.supplierId?._id || '').toString();
            const codeFour = (item?.supplierCodes || []).find(sc => (sc.supplierId?._id || sc.supplierId)?.toString() === supId)?.code;
            return (
              <div key={idx} className={`order-detail-line ${isComplete ? 'line-complete' : ''}`}>
                <div className="detail-line-image">
                  {item?.image
                    ? <img src={item.image} alt={item.designation?.[lang] || ''} />
                    : <div className="detail-line-no-image"><Package size={15}/></div>
                  }
                </div>
                <div className="detail-line-body">
                  <div className="detail-line-name">
                    {item?.designation?.[lang] || item?.designation?.fr || 'Article supprimé'}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '2px 0' }}>
                    {item?.codeInterne && <span className="detail-line-code">Int: {item.codeInterne}</span>}
                    {codeFour && <span className="detail-line-code">Fourn: {codeFour}</span>}
                  </div>
                  {item?.categoryId && (
                    <span className="detail-line-cat" style={{ background: item.categoryId.color }}>
                      {item.categoryId.name?.[lang] || item.categoryId.name?.fr}
                    </span>
                  )}
                  {line.unitPrice > 0 && (
                    <span className="detail-line-price">{line.unitPrice.toFixed(2)} /u</span>
                  )}
                  {line.note && <p className="detail-line-note">📝 {line.note}</p>}
                </div>
                <div className="detail-line-qty-block">
                  <div className="detail-line-qty-bar">
                    <div className="detail-line-qty-fill" style={{ width: `${linePct}%`, background: isComplete ? '#16a34a' : '#2563eb' }} />
                  </div>
                  <div className="detail-line-qty-text">
                    {received} / {line.quantityOrdered}
                    {isComplete && <span className="line-check"> ✓</span>}
                  </div>
                </div>
                {!isComplete && canReceive && order.status !== 'annulee' && order.status !== 'brouillon' && (
                  <button className="btn-receive" onClick={() => openReceive(order, line)}>
                    Réceptionner
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Totals */}
        <div className="order-detail-totals">
          <div><span>Total HT</span><strong>{totalHT.toFixed(2)}</strong></div>
          <div><span>TVA ({tvaRate}%)</span><strong>{(totalHT * tvaRate / 100).toFixed(2)}</strong></div>
          <div className="order-detail-totals__ttc"><span>Total TTC</span><strong>{ttc.toFixed(2)}</strong></div>
        </div>

        {receiveModal && (
          <ReceiveModal
            receiveModal={receiveModal}
            receiveQty={receiveQty}
            lang={lang}
            setReceiveQty={setReceiveQty}
            onConfirm={handleReceive}
            onClose={() => setReceiveModal(null)}
          />
        )}

        {showForm && (
          <OrderForm
            order={editOrder}
            items={items}
            companies={companies}
            suppliers={suppliers}
            onSupplierAdded={(s) => setSuppliers(prev => [...prev, s])}
            lang={lang}
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
            onClick={() => setActiveTab('orders')}
          >
            <ShoppingCart size={15} /> {t('navOrders')}
           
          </button>
          <button
            className={`orders-tab-btn ${activeTab === 'requests' ? 'active' : ''}`}
            onClick={() => { setActiveTab('requests'); fetchPurchaseRequests(); }}
          >
            <ShoppingCart size={13} />
            {t('Demandesadmin')}
            {purchaseRequests.filter(r => r.status === 'pending').length > 0 && (
              <span className="orders-tab-badge orders-tab-badge--orange">
                {purchaseRequests.filter(r => r.status === 'pending').length}
              </span>
            )}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="super-cat-settings-btn" title='Excel' onClick={() => exportOrdersExcel(filteredOrders, lang)}>
            <Sheet size={15} color='GREEN' />
          </button>
          <button className="btn-primary" onClick={() => { setEditOrder(null); setShowForm(true); }}>
            <FilePlus size={15}/>{t('orderNew')}
          </button>
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
      ) : (
        <>
          <div className="orders-stats">
            {[
              { label: 'Total', value: stats.total, color: '#6b7280' },
              { label: 'Brouillons', value: stats.brouillon, color: '#6b7280' },
              { label: 'Envoyés', value: stats.envoye, color: '#4f46e5' },
              { label: 'Partielles', value: stats.partielle, color: '#2563eb' },
              { label: 'Reçues', value: stats.recue, color: '#16a34a' },
            ].map(s => (
              <div key={s.label} className="orders-stat-card" style={{ borderLeftColor: s.color }}>
                <span className="stat-value" style={{ color: s.color }}>{s.value}</span>
                <span className="stat-label">{s.label}</span>
              </div>
            ))}
          </div>

          <div className="orders-controls">
            <input
              className="search-input"
              placeholder="Rechercher (n° BC, fournisseur, article, notes…)"
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
                  {s === 'all' ? 'Toutes' : STATUS_COLORS[s]?.label?.fr}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="loading-msg">{t('loading')}</div>
          ) : filteredOrders.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><ShoppingCart size={15}/></div>
              <p>{t("noData")}</p>
            </div>
          ) : (
            <div className="orders-list">
              {filteredOrders.map(order => {
                const st = STATUS_COLORS[order.status] || STATUS_COLORS.brouillon;
                const totalOrdered = (order.lines || []).reduce((s, l) => s + l.quantityOrdered, 0);
                const totalReceived = (order.lines || []).reduce((s, l) => s + (l.quantityReceived || 0), 0);
                const progress = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;
                return (
                  <div
                    key={order.id}
                    className="order-card order-card--clickable"
                    onClick={() => setSelectedOrder(order)}
                  >
                    <div className="order-card-header">
                      <div className="order-card-title">
                        <h3>{orderTitle(order)}</h3>
                        {order.status === 'brouillon' && <span className="bc-draft-tag">Brouillon</span>}
                        {order.companyId && <span className="order-company-badge">{order.companyId.name}</span>}
                        {(order.supplierId?.name || order.supplier) && <span className="order-supplier">— {order.supplierId?.name || order.supplier}</span>}
                      </div>
                      <div className="order-card-meta">
                        <span className="status-badge" style={{ background: st.bg, color: st.text }}>
                          {st.label[lang] || st.label.fr}
                        </span>
                        <span className="order-date">{new Date(order.orderDate).toLocaleDateString('fr-FR')}</span>
                      </div>
                    </div>

                    <div className="order-progress-bar">
                      <div className="order-progress-fill" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="order-progress-label">
                      {totalReceived} / {totalOrdered} articles reçus ({progress}%)
                    </div>

                    <div className="order-card-thumbs">
                      {(order.lines || []).slice(0, 5).map((line, idx) => (
                        <div key={idx} className="order-card-thumb" title={line.itemId?.designation?.[lang] || ''}>
                          {line.itemId?.image
                            ? <img src={line.itemId.image} alt="" />
                            : <span>📦</span>
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
                        {(order.lines || []).length} article{(order.lines || []).length !== 1 ? 's' : ''}
                      </span>
                      <span className="order-card-open-hint">Voir détails →</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Modals — always rendered outside tab conditional */}
      {showForm && (
        <OrderForm
          order={editOrder}
          items={items}
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
          onConfirm={handleReceive}
          onClose={() => setReceiveModal(null)}
        />
      )}
    </div>
  );
}

/* ── Receive Modal (shared between list & detail view) ──────────── */
function ReceiveModal({ receiveModal, receiveQty, lang, setReceiveQty, onConfirm, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, padding: 28 }}>
        <h2 style={{ marginBottom: 8 }}>Réceptionner des articles</h2>
        <p style={{ color: '#555', marginBottom: 16 }}>
          <strong>{receiveModal.line.itemId?.designation?.[lang] || receiveModal.line.itemId?.designation?.fr}</strong>
        </p>
        <p style={{ fontSize: '0.88rem', color: '#888', marginBottom: 20 }}>
          Déjà reçu : {receiveModal.line.quantityReceived || 0} / {receiveModal.line.quantityOrdered}
        </p>
        <div className="form-group">
          <label>Quantité totale reçue (cumulative)</label>
          <input
            type="number"
            min={receiveModal.line.quantityReceived || 0}
            max={receiveModal.line.quantityOrdered}
            value={receiveQty}
            onChange={e => setReceiveQty(e.target.value)}
            autoFocus
            style={{ width: 120 }}
          />
          <span style={{ marginLeft: 8, fontSize: '0.85rem', color: '#888' }}>
            / {receiveModal.line.quantityOrdered}
          </span>
        </div>
        <div className="modal-actions" style={{ marginTop: 20 }}>
          <button onClick={onClose}>Annuler</button>
          <button
            className="primary"
            onClick={onConfirm}
            disabled={Number(receiveQty) <= (receiveModal.line.quantityReceived || 0)}
            style={{ background: '#16a34a' }}
          >
            ✓ Confirmer réception
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Supplier (Fournisseur) Modal ──────────────────────────────── */
function SupplierModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', code: '', contact: '', phone: '', email: '', address: '', city: '', ice: '', rc: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Le nom est requis'); return; }
    setSaving(true); setError('');
    try {
      const r = await axios.post(`${API_URL}/fournisseurs`, form);
      onSaved(r.data);
    } catch (err) { setError(err.response?.data?.error || 'Erreur'); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <h2 style={{ marginBottom: 14 }}>Nouveau fournisseur</h2>
        <form onSubmit={submit}>
          <div className="form-grid-2">
            <div className="form-group"><label>Nom *</label><input value={form.name} onChange={set('name')} autoFocus /></div>
            <div className="form-group"><label>Code fournisseur</label><input value={form.code} onChange={set('code')} /></div>
            <div className="form-group"><label>Contact</label><input value={form.contact} onChange={set('contact')} /></div>
            <div className="form-group"><label>Téléphone</label><input value={form.phone} onChange={set('phone')} /></div>
            <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={set('email')} /></div>
            <div className="form-group"><label>Ville</label><input value={form.city} onChange={set('city')} /></div>
            <div className="form-group"><label>ICE</label><input value={form.ice} onChange={set('ice')} /></div>
            <div className="form-group"><label>RC</label><input value={form.rc} onChange={set('rc')} /></div>
          </div>
          <div className="form-group"><label>Adresse</label><input value={form.address} onChange={set('address')} /></div>
          <div className="form-group"><label>Notes</label><textarea rows={2} value={form.notes} onChange={set('notes')} /></div>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" onClick={onClose}>Annuler</button>
            <button type="submit" className="primary" disabled={saving}>{saving ? '…' : 'Créer le fournisseur'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Order Form ─────────────────────────────────────────────────── */
function OrderForm({ order, items, companies, suppliers, onSupplierAdded, lang, onClose, onSave }) {
  const { t } = useLanguage();
  const today = new Date().toISOString().split('T')[0];
  const [showSupplierModal, setShowSupplierModal] = useState(false);

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

  const updateLineFilter = (idx, field, val) =>
    setLineFilters(f => f.map((lf, i) => i === idx ? { ...lf, [field]: val } : lf));

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
        if (!tokens.every(tok => name.includes(tok) || code.includes(tok))) return false;
      }
      return true;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.lines.length === 0) { alert('Ajoutez au moins une ligne'); return; }
    try {
      if (order) {
        await axios.put(`${API_URL}/orders/${order.id}`, form);
      } else {
        await axios.post(`${API_URL}/orders`, form);
      }
      onSave();
    } catch (e) { alert(e.response?.data?.error || 'Erreur'); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal xlarge" onClick={e => e.stopPropagation()}>
        <h2>{order ? `Modifier ${order.number || 'le brouillon'}` : t('orderNew')}</h2>
        {isLocked && (
          <div className="order-detail-notes" style={{ marginBottom: 14 }}>
            ⚠️ Bon de commande déjà envoyé — modification réservée à l'administrateur.
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="form-grid-2">
            <div className="form-group">
              <label>Société *</label>
              <select required value={form.companyId} onChange={e => setForm(f => ({ ...f, companyId: e.target.value }))}>
                <option value="">Choisir…</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Référence interne</label>
              <input type="text" placeholder="(facultatif)" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Fournisseur</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={form.supplierId} onChange={e => setForm(f => ({ ...f, supplierId: e.target.value }))} style={{ flex: 1 }}>
                  <option value="">— Choisir —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ''}</option>)}
                </select>
                <button type="button" className="btn-add-line" onClick={() => setShowSupplierModal(true)} title="Ajouter un fournisseur">
                  <Plus size={14} />
                </button>
              </div>
            </div>
            <div className="form-group">
              <label>Date de commande *</label>
              <input required type="date" value={form.orderDate} onChange={e => setForm(f => ({ ...f, orderDate: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Date prévue de livraison</label>
              <input type="date" value={form.expectedDate} onChange={e => setForm(f => ({ ...f, expectedDate: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>TVA (%)</label>
              <input type="number" min={0} step="0.1" value={form.tva} onChange={e => setForm(f => ({ ...f, tva: Number(e.target.value) }))} />
            </div>
          </div>

          <div className="form-group">
            <label>Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>

          <div className="order-lines-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>Articles commandés</h3>
              <button type="button" className="btn-add-line" onClick={addLine}>+ Ajouter ligne</button>
            </div>

            {form.lines.length === 0 && (
              <p style={{ color: '#888', textAlign: 'center', padding: 16 }}>
                Aucune ligne. Cliquez sur "+ Ajouter ligne"
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
                      <option value="">Toutes super-catégories</option>
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
                        <option value="">Toutes catégories</option>
                        {scCategories.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    )}

                    <input
                      className="line-filter-search"
                      type="text"
                      placeholder="Rechercher (nom ou code interne)…"
                      value={lf.search}
                      onChange={e => updateLineFilter(idx, 'search', e.target.value)}
                    />
                  </div>

                  <div className="order-line-main">
                    <div className="line-item-selector">
                      {selectedItem?.image && (
                        <img className="line-item-preview" src={selectedItem.image} alt="" />
                      )}
                      {!selectedItem?.image && (
                        <div className="line-item-preview line-item-preview--placeholder">📦</div>
                      )}
                      <div className="form-group" style={{ flex: 1, margin: 0 }}>
                        <label>Article</label>
                        <select
                          value={line.itemId}
                          onChange={e => updateLine(idx, 'itemId', e.target.value)}
                        >
                          {filteredForLine.length === 0 && (
                            <option value="">Aucun article trouvé</option>
                          )}
                          {filteredForLine.map(it => (
                            <option key={it.id} value={it.id}>
                              {it.codeInterne ? `[${it.codeInterne}] ` : ''}{it.designation?.[lang] || it.designation?.fr}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="form-group" style={{ flex: '0 0 90px' }}>
                      <label>Qté</label>
                      <input
                        type="number"
                        min={1}
                        value={line.quantityOrdered}
                        onChange={e => updateLine(idx, 'quantityOrdered', Number(e.target.value))}
                      />
                    </div>

                    <div className="form-group" style={{ flex: '0 0 110px' }}>
                      <label>Prix unit.</label>
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

                  <div className="form-group" style={{ margin: '8px 0 0' }}>
                    <label>Note de ligne</label>
                    <input
                      type="text"
                      placeholder="Remarque spécifique à cet article…"
                      value={line.note}
                      onChange={e => updateLine(idx, 'note', e.target.value)}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose}>Annuler</button>
            <button type="submit" className="primary">
              {order ? 'Mettre à jour' : 'Créer le brouillon'}
            </button>
          </div>
        </form>

        {showSupplierModal && (
          <SupplierModal
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
function PurchaseRequestsPanel({ requests, loading, markingId, deletingId, onMarkOrdered, onDelete, onRefresh, isAdmin, lang }) {
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
      <div style={{ padding: '60px 20px', textAlign: 'center', color: '#888' }}>
        <LoaderCircle size={24} style={{ animation: 'spin .7s linear infinite' }} />
        <p style={{ marginTop: 8 }}>Chargement des demandes…</p>
      </div>
    );
  }

  return (
    <div className="pr-panel">
      <div className="pr-panel__header">
        <div className="pr-panel__title">
          <ShoppingCart size={16} />
          <span>Demandes de commande</span>
          {pendingCount > 0 && (
            <span className="pr-badge">{pendingCount} en attente</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="pr-filter-tabs">
            <button
              className={`pr-filter-tab ${filter === 'pending' ? 'active' : ''}`}
              onClick={() => setFilter('pending')}
            >
              <Clock size={11} /> En attente
            </button>
            <button
              className={`pr-filter-tab ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              Tout voir
            </button>
          </div>
          <button className="pr-refresh-btn" onClick={onRefresh} title="Rafraîchir">
            🔄
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="pr-empty">
          <ShoppingCart size={36} strokeWidth={1} style={{ color: '#ccc' }} />
          <p>{filter === 'pending' ? 'Aucune demande en attente.' : 'Aucune demande trouvée.'}</p>
        </div>
      ) : (
        <div className="pr-table-wrap">
          <table className="pr-table">
            <thead>
              <tr>
                <th style={{ width: 52 }}>Image</th>
                <th>Article</th>
                <th>Qté demandée</th>
                <th>Note</th>
                <th>Demandé par</th>
                <th>Date</th>
                <th>Statut</th>
                <th style={{ width: 140 }}>Action</th>
                {isAdmin && <th style={{ width: 44 }}></th>}
              </tr>
            </thead>
            <tbody>
              {visible.map(req => (
                <tr key={req.id || req._id} className={`pr-row pr-row--${req.status}`}>
                  <td>
                    {req.itemImage
                      ? <img src={req.itemImage} alt={req.itemName} style={{ width: 44, height: 36, objectFit: 'contain', borderRadius: 6, border: '1px solid #e8e8e8', background: '#fff' }} />
                      : <span style={{ color: '#ccc', fontSize: 11 }}>—</span>
                    }
                  </td>
                  <td>
                    <strong style={{ fontSize: 13 }}>{req.itemName || '—'}</strong>
                  </td>
                  <td>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{req.quantity}</span>
                  </td>
                  <td>
                    <span style={{ fontSize: 12, color: '#555' }}>{req.note || <span style={{ color: '#ccc' }}>—</span>}</span>
                  </td>
                  <td>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{req.requestedBy || 'Admin'}</span>
                  </td>
                  <td>
                    <span style={{ fontSize: 11, color: '#888', whiteSpace: 'nowrap' }}>{fmtDate(req.createdAt)}</span>
                  </td>
                  <td>
                    {req.status === 'pending' ? (
                      <span className="pr-status pr-status--pending">
                        <Clock size={10} /> En attente
                      </span>
                    ) : (
                      <span className="pr-status pr-status--done">
                        <CheckCheck size={10} /> Commandé
                        {req.orderedAt && <><br /><span style={{ fontSize: 10, color: '#666' }}>{fmtDate(req.orderedAt)}</span></>}
                      </span>
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
                          ? <LoaderCircle size={12} style={{ animation: 'spin .7s linear infinite' }} />
                          : <CheckCheck size={13} />
                        }
                        Marquer commandé
                      </button>
                    ) : (
                      <span style={{ fontSize: 11, color: '#aaa' }}>Traité</span>
                    )}
                  </td>
                  {isAdmin && (
                    <td style={{ textAlign: 'center' }}>
                      <button
                        title="Supprimer"
                        disabled={deletingId === (req.id || req._id)}
                        onClick={() => onDelete(req.id || req._id)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: '#ddd', padding: 4, borderRadius: 4,
                          display: 'inline-flex', alignItems: 'center',
                          transition: 'color .15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = '#dc2626'}
                        onMouseLeave={e => e.currentTarget.style.color = '#ddd'}
                      >
                        {deletingId === (req.id || req._id)
                          ? <LoaderCircle size={13} style={{ animation: 'spin .7s linear infinite' }} />
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