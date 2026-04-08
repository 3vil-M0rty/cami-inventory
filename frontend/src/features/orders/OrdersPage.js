import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useLanguage } from '../../context/LanguageContext';
import { useCompany } from '../../context/CompanyContext';
import './OrdersPage.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const STATUS_COLORS = {
  en_attente: { bg: '#fef3c7', text: '#92400e', label: { fr: 'En attente', en: 'Pending', it: 'In attesa' } },
  partielle:  { bg: '#dbeafe', text: '#1e40af', label: { fr: 'Partielle',  en: 'Partial',  it: 'Parziale' } },
  recue:      { bg: '#dcfce7', text: '#166534', label: { fr: 'Reçue',      en: 'Received', it: 'Ricevuta' } },
  annulee:    { bg: '#fee2e2', text: '#991b1b', label: { fr: 'Annulée',    en: 'Cancelled',it: 'Annullata'} },
};

export default function OrdersPage() {
  const { currentLanguage: lang, t } = useLanguage();
  const { companies, selectedCompany } = useCompany();
  const [orders, setOrders] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editOrder, setEditOrder] = useState(null);
  const [receiveModal, setReceiveModal] = useState(null); // { order, line }
  const [receiveQty, setReceiveQty] = useState(0);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/orders`);
      setOrders(res.data);
    } catch(e) { console.error(e); } finally { setLoading(false); }
  }, []);

  const fetchItems = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/inventory`);
      setItems(res.data);
    } catch(e) { console.error(e); }
  }, []);

  useEffect(() => { fetchOrders(); fetchItems(); }, [fetchOrders, fetchItems]);

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette commande ?')) return;
    await axios.delete(`${API_URL}/orders/${id}`);
    fetchOrders();
  };

  const handleReceive = async () => {
    if (!receiveModal) return;
    try {
      await axios.patch(`${API_URL}/orders/${receiveModal.order.id}/receive`, {
        lineId: receiveModal.line._id || receiveModal.line.id,
        quantityReceived: Number(receiveQty)
      });
      fetchOrders();
      setReceiveModal(null);
    } catch(e) { alert(e.response?.data?.error || 'Erreur'); }
  };

  const openReceive = (order, line) => {
    setReceiveModal({ order, line });
    setReceiveQty(line.quantityReceived || 0);
  };

  const filteredOrders = orders.filter(o => {
    if (selectedCompany && o.companyId?.id !== selectedCompany && o.companyId?._id !== selectedCompany) return false;
    if (filterStatus !== 'all' && o.status !== filterStatus) return false;
    if (searchTerm && !o.reference.toLowerCase().includes(searchTerm.toLowerCase()) && !o.supplier?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total: orders.length,
    enAttente: orders.filter(o => o.status === 'en_attente').length,
    partielle: orders.filter(o => o.status === 'partielle').length,
    recue: orders.filter(o => o.status === 'recue').length,
  };

  return (
    <div className="orders-page">
      <header className="orders-header">
        <div>
          <h1>📦 {t('navOrders')}</h1>
          <p className="orders-subtitle">Gestion des commandes fournisseurs</p>
        </div>
        <button className="btn-primary" onClick={() => { setEditOrder(null); setShowForm(true); }}>+ Nouvelle commande</button>
      </header>

      <div className="orders-stats">
        {[
          { label: 'Total', value: stats.total, color: '#6b7280' },
          { label: 'En attente', value: stats.enAttente, color: '#d97706' },
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
        <input className="search-input" placeholder="Rechercher (référence, fournisseur)..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        <div className="filter-tabs">
          {['all', 'en_attente', 'partielle', 'recue', 'annulee'].map(s => (
            <button key={s} className={`filter-tab ${filterStatus === s ? 'active' : ''}`} onClick={() => setFilterStatus(s)}>
              {s === 'all' ? 'Toutes' : STATUS_COLORS[s]?.label?.fr}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="loading-msg">Chargement...</div>
      ) : filteredOrders.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <p>Aucune commande trouvée</p>
          <button className="btn-primary" onClick={() => setShowForm(true)}>Créer la première commande</button>
        </div>
      ) : (
        <div className="orders-list">
          {filteredOrders.map(order => {
            const st = STATUS_COLORS[order.status] || STATUS_COLORS.en_attente;
            const totalOrdered = (order.lines || []).reduce((s, l) => s + l.quantityOrdered, 0);
            const totalReceived = (order.lines || []).reduce((s, l) => s + (l.quantityReceived || 0), 0);
            const progress = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;
            return (
              <div key={order.id} className="order-card">
                <div className="order-card-header">
                  <div className="order-card-title">
                    <h3>{order.reference}</h3>
                    {order.companyId && <span className="order-company-badge">{order.companyId.name}</span>}
                    {order.supplier && <span className="order-supplier">— {order.supplier}</span>}
                  </div>
                  <div className="order-card-meta">
                    <span className="status-badge" style={{ background: st.bg, color: st.text }}>{st.label[lang] || st.label.fr}</span>
                    <span className="order-date">{new Date(order.orderDate).toLocaleDateString('fr-FR')}</span>
                  </div>
                </div>

                <div className="order-progress-bar">
                  <div className="order-progress-fill" style={{ width: `${progress}%` }}></div>
                </div>
                <div className="order-progress-label">{totalReceived} / {totalOrdered} barres reçues ({progress}%)</div>

                <div className="order-lines">
                  {(order.lines || []).map((line, idx) => {
                    const item = line.itemId;
                    const received = line.quantityReceived || 0;
                    const pct = line.quantityOrdered > 0 ? Math.round((received / line.quantityOrdered) * 100) : 0;
                    const isComplete = received >= line.quantityOrdered;
                    return (
                      <div key={idx} className={`order-line ${isComplete ? 'line-complete' : ''}`}>
                        <div className="line-info">
                          <span className="line-name">{item?.designation?.[lang] || item?.designation?.fr || 'Article supprimé'}</span>
                          <span className="line-qty">{received}/{line.quantityOrdered}</span>
                          {isComplete && <span className="line-check">✓</span>}
                        </div>
                        {!isComplete && order.status !== 'annulee' && (
                          <button className="btn-receive" onClick={() => openReceive(order, line)}>
                            Réceptionner
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="order-card-actions">
                  <button className="btn-edit" onClick={() => { setEditOrder(order); setShowForm(true); }}>Modifier</button>
                  <button className="btn-delete" onClick={() => handleDelete(order.id)}>Supprimer</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <OrderForm
          order={editOrder}
          items={items}
          companies={companies}
          lang={lang}
          onClose={() => { setShowForm(false); setEditOrder(null); }}
          onSave={() => { setShowForm(false); setEditOrder(null); fetchOrders(); }}
        />
      )}

      {receiveModal && (
        <div className="modal-overlay" onClick={() => setReceiveModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, padding: 28 }}>
            <h2 style={{ marginBottom: 8 }}>Réceptionner des barres</h2>
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
              <span style={{ marginLeft: 8, fontSize: '0.85rem', color: '#888' }}>/ {receiveModal.line.quantityOrdered}</span>
            </div>
            <div className="modal-actions" style={{ marginTop: 20 }}>
              <button onClick={() => setReceiveModal(null)}>Annuler</button>
              <button
                className="primary"
                onClick={handleReceive}
                disabled={Number(receiveQty) <= (receiveModal.line.quantityReceived || 0)}
                style={{ background: '#16a34a' }}
              >
                ✓ Confirmer réception
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OrderForm({ order, items, companies, lang, onClose, onSave }) {
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState(order ? {
    reference: order.reference, companyId: order.companyId?.id || order.companyId?._id || '',
    supplier: order.supplier || '', orderDate: order.orderDate?.split('T')[0] || today,
    expectedDate: order.expectedDate?.split('T')[0] || '', notes: order.notes || '', status: order.status,
    lines: (order.lines || []).map(l => ({ itemId: l.itemId?.id || l.itemId?._id || l.itemId, quantityOrdered: l.quantityOrdered, unitPrice: l.unitPrice || 0, note: l.note || '' }))
  } : {
    reference: '', companyId: companies[0]?.id || '', supplier: '', orderDate: today, expectedDate: '', notes: '', status: 'en_attente', lines: []
  });

  const addLine = () => setForm(f => ({ ...f, lines: [...f.lines, { itemId: items[0]?.id || '', quantityOrdered: 1, unitPrice: 0, note: '' }] }));
  const removeLine = (idx) => setForm(f => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }));
  const updateLine = (idx, field, val) => setForm(f => ({ ...f, lines: f.lines.map((l, i) => i === idx ? { ...l, [field]: val } : l) }));

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
    } catch(e) { alert(e.response?.data?.error || 'Erreur'); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal xlarge" onClick={e => e.stopPropagation()}>
        <h2>{order ? 'Modifier la commande' : 'Nouvelle commande'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-grid-2">
            <div className="form-group">
              <label>Société *</label>
              <select required value={form.companyId} onChange={e => setForm(f => ({ ...f, companyId: e.target.value }))}>
                <option value="">Choisir...</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Référence *</label>
              <input required type="text" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Fournisseur</label>
              <input type="text" value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Date de commande *</label>
              <input required type="date" value={form.orderDate} onChange={e => setForm(f => ({ ...f, orderDate: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Date prévue de livraison</label>
              <input type="date" value={form.expectedDate} onChange={e => setForm(f => ({ ...f, expectedDate: e.target.value }))} />
            </div>
            {order && (
              <div className="form-group">
                <label>Statut</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="en_attente">En attente</option>
                  <option value="partielle">Partielle</option>
                  <option value="recue">Reçue</option>
                  <option value="annulee">Annulée</option>
                </select>
              </div>
            )}
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
            {form.lines.length === 0 && <p style={{ color: '#888', textAlign: 'center', padding: 16 }}>Aucune ligne. Cliquez sur "+ Ajouter ligne"</p>}
            {form.lines.map((line, idx) => (
              <div key={idx} className="order-line-form">
                <div className="form-group" style={{ flex: 3 }}>
                  <label>Article</label>
                  <select value={line.itemId} onChange={e => updateLine(idx, 'itemId', e.target.value)}>
                    {items.map(it => <option key={it.id} value={it.id}>{it.designation?.[lang] || it.designation?.fr}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Qté</label>
                  <input type="number" min={1} value={line.quantityOrdered} onChange={e => updateLine(idx, 'quantityOrdered', Number(e.target.value))} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Prix unit.</label>
                  <input type="number" min={0} step="0.01" value={line.unitPrice} onChange={e => updateLine(idx, 'unitPrice', Number(e.target.value))} />
                </div>
                <button type="button" className="btn-remove-line" onClick={() => removeLine(idx)}>×</button>
              </div>
            ))}
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose}>Annuler</button>
            <button type="submit" className="primary">{order ? 'Mettre à jour' : 'Créer la commande'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}