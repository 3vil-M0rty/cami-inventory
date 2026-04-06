import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import './ClientsPage.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

export default function ClientsPage() {
  const { companies, selectedCompany } = useCompany();
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

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer ce client ?')) return;
    await axios.delete(`${API_URL}/clients/${id}`);
    fetchClients();
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
        <div>
          <h1>👥 Clients</h1>
          <p className="clients-subtitle">{clients.length} client(s) enregistré(s)</p>
        </div>
        <button className="btn-primary" onClick={() => { setEditClient(null); setShowForm(true); }}>+ Nouveau client</button>
      </header>

      <div className="clients-controls">
        <input className="search-input" placeholder="Rechercher (nom, société, ville)..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
      </div>

      {loading ? (
        <div className="loading-msg">Chargement...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">👤</div>
          <p>Aucun client trouvé</p>
          <button className="btn-primary" onClick={() => setShowForm(true)}>Ajouter le premier client</button>
        </div>
      ) : (
        <div className="clients-grid">
          {filtered.map(client => (
            <div key={client.id} className="client-card">
              <div className="client-avatar">{client.name.charAt(0).toUpperCase()}</div>
              <div className="client-info">
                <h3>{client.name}</h3>
                {client.company && <p className="client-company">🏢 {client.company}</p>}
                {client.city && <p className="client-city">📍 {client.city}</p>}
                {client.phone && <p className="client-phone">📞 {client.phone}</p>}
                {client.email && <p className="client-email">✉️ {client.email}</p>}
                {client.companyId && <span className="client-company-badge">{client.companyId.name}</span>}
              </div>
              {client.notes && <p className="client-notes">{client.notes}</p>}
              <div className="client-actions">
                <button className="btn-edit" onClick={() => { setEditClient(client); setShowForm(true); }}>Modifier</button>
                <button className="btn-delete" onClick={() => handleDelete(client.id)}>Supprimer</button>
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
    } catch(e) { alert(e.response?.data?.error || 'Erreur'); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal large" onClick={e => e.stopPropagation()}>
        <h2>{client ? 'Modifier le client' : 'Nouveau client'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-grid-2">
            <div className="form-group">
              <label>Nom complet *</label>
              <input required type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Société / Entreprise</label>
              <input type="text" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Téléphone</label>
              <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Ville</label>
              <input type="text" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Société liée (CAMI / GIMAV)</label>
              <select value={form.companyId} onChange={e => setForm(f => ({ ...f, companyId: e.target.value }))}>
                <option value="">Aucune</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Adresse</label>
            <input type="text" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose}>Annuler</button>
            <button type="submit" className="primary">{client ? 'Mettre à jour' : 'Créer'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
