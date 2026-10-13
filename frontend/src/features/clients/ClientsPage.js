import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useLanguage } from '../../context/LanguageContext';
import { dialog, errorMessage } from '../../components/common/dialog';
import { Users, MapPin, Phone, Mail, Building2, Pencil, Trash2, Plus, UserRound } from 'lucide-react';
import './ClientsPage.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

export default function ClientsPage() {
  const { companies, selectedCompany } = useCompany();
  const { t } = useLanguage();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editClient, setEditClient] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try { const r = await axios.get(`${API_URL}/clients`); setClients(r.data); }
    catch(e) { console.error(e); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const handleDelete = async (client) => {
    if (!(await dialog.confirm({ title: t('deleteTitle'), message: t('clDeleteConfirm', { name: client.name }), danger: true, confirmLabel: t('deleteAction') }))) return;
    try {
      await axios.delete(`${API_URL}/clients/${client.id}`);
      fetchClients();
    } catch (e) { dialog.alert(errorMessage(e, t('errDelete'))); }
  };

  const filtered = clients.filter(c => {
    if (selectedCompany && c.companyId?.id !== selectedCompany && c.companyId?._id !== selectedCompany) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return c.name?.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q) || c.city?.toLowerCase().includes(q) || c.phone?.includes(q);
    }
    return true;
  });

  return (
    <div className="clients-page">
      <header className="clients-header">
        <div className="clients-header__title">
          <span className="clients-header__icon"><Users size={18} strokeWidth={2} /></span>
          <div>
            <h1>{t('clTitle')}</h1>
            <p className="clients-subtitle">{t('clCount', { n: clients.length })}</p>
          </div>
        </div>
        <button className="btn btn--primary" onClick={() => { setEditClient(null); setShowForm(true); }}>{t('clNew')}</button>
      </header>

      <div className="clients-controls">
        <input className="search-input" placeholder={t('clSearch')} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
      </div>

      {loading ? (
        <div className="clients-empty panel"><p>{t('loadingShort')}</p></div>
      ) : filtered.length === 0 ? (
        <div className="clients-empty panel">
          <span className="clients-empty__icon"><UserRound size={20} strokeWidth={1.8} /></span>
          <p>{t('clNone')}</p>
          <button className="btn btn--secondary" onClick={() => setShowForm(true)}><Plus size={14} />{t('clAddFirst')}</button>
        </div>
      ) : (
        <div className="clients-grid">
          {filtered.map(client => (
            <div key={client.id} className="client-card">
              <div className="client-card__top">
                <div className="client-avatar">{client.name.charAt(0).toUpperCase()}</div>
                <div className="client-info">
                  <h3>{client.name}</h3>
                  {client.company && <p className="client-company"><Building2 size={12} />{client.company}</p>}
                </div>
                {client.companyId && <span className="client-company-badge">{client.companyId.name}</span>}
              </div>
              {(client.city || client.phone || client.email) && (
                <ul className="client-meta">
                  {client.city && <li className="client-city"><MapPin size={13} /><span>{client.city}</span></li>}
                  {client.phone && <li className="client-phone"><Phone size={13} /><span>{client.phone}</span></li>}
                  {client.email && <li className="client-email"><Mail size={13} /><span>{client.email}</span></li>}
                </ul>
              )}
              {client.notes && <p className="client-notes">{client.notes}</p>}
              <div className="client-actions">
                <button className="btn btn--secondary btn--sm" onClick={() => { setEditClient(client); setShowForm(true); }}><Pencil size={13} />{t('edit')}</button>
                <button className="btn btn--danger btn--sm" onClick={() => handleDelete(client)}><Trash2 size={13} />{t('delete')}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <ClientForm
          client={editClient}
          companies={companies}
          onClose={() => { setShowForm(false); setEditClient(null); }}
          onSave={() => { setShowForm(false); setEditClient(null); fetchClients(); }}
        />
      )}
    </div>
  );
}

function ClientForm({ client, companies, onClose, onSave }) {
  const { t } = useLanguage();
  const [form, setForm] = useState(client ? {
    name: client.name, company: client.company || '', phone: client.phone || '',
    email: client.email || '', address: client.address || '', city: client.city || '',
    notes: client.notes || '', companyId: client.companyId?.id || client.companyId?._id || ''
  } : {
    name: '', company: '', phone: '', email: '', address: '', city: '', notes: '',
    companyId: companies[0]?.id || ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (client) { await axios.put(`${API_URL}/clients/${client.id}`, form); }
      else { await axios.post(`${API_URL}/clients`, form); }
      onSave();
    } catch(e) { dialog.alert(errorMessage(e, t('errSave'))); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal large client-modal" onClick={e => e.stopPropagation()}>
        <h2>{client ? t('clEditTitle') : t('clNewTitle')}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-grid-2">
            <div className="form-group">
              <label>{t('clFullName')}</label>
              <input required type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>{t('clCompany')}</label>
              <input type="text" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>{t('clPhone')}</label>
              <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>{t('clEmail')}</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>{t('clCity')}</label>
              <input type="text" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>{t('clLinkedCompany')}</label>
              <select value={form.companyId} onChange={e => setForm(f => ({ ...f, companyId: e.target.value }))}>
                <option value="">{t('clNoneOption')}</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>{t('clAddress')}</label>
            <input type="text" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>{t('clNotes')}</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose}>{t('cancel')}</button>
            <button type="submit" className="primary">{client ? t('update') : t('create')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
