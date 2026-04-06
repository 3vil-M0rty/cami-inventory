import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import './DevisPage.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const STATUS_CONFIG = {
  brouillon: { label: 'Brouillon', bg: '#f3f4f6', text: '#374151' },
  envoye:    { label: 'Envoyé',    bg: '#dbeafe', text: '#1e40af' },
  accepte:   { label: 'Accepté',   bg: '#dcfce7', text: '#166534' },
  refuse:    { label: 'Refusé',    bg: '#fee2e2', text: '#991b1b' },
};

export default function DevisPage() {
  const { companies, selectedCompany } = useCompany();
  const [devisList, setDevisList] = useState([]);
  const [clients, setClients] = useState([]);
  const [chassisTypes, setChassisTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editDevis, setEditDevis] = useState(null);
  const [previewDevis, setPreviewDevis] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [dRes, cRes, ctRes] = await Promise.all([
        axios.get(`${API_URL}/devis`),
        axios.get(`${API_URL}/clients`),
        axios.get(`${API_URL}/chassis-types`)
      ]);
      setDevisList(dRes.data);
      setClients(cRes.data);
      setChassisTypes(ctRes.data);
    } catch(e) { console.error(e); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer ce devis ?')) return;
    await axios.delete(`${API_URL}/devis/${id}`);
    fetchAll();
  };

  const handleStatusChange = async (id, status) => {
    await axios.put(`${API_URL}/devis/${id}`, { status });
    fetchAll();
  };

  const filtered = devisList.filter(d => {
    if (selectedCompany && d.companyId?.id !== selectedCompany && d.companyId?._id !== selectedCompany) return false;
    if (filterStatus !== 'all' && d.status !== filterStatus) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return d.reference?.toLowerCase().includes(q) || d.clientId?.name?.toLowerCase().includes(q);
    }
    return true;
  });

  const calcTotal = (d) => {
    const ht = (d.lines || []).reduce((s, l) => {
      const disc = l.discount || 0;
      return s + l.quantity * l.unitPrice * (1 - disc / 100);
    }, 0);
    return { ht, tva: ht * (d.tva || 20) / 100, ttc: ht * (1 + (d.tva || 20) / 100) };
  };

  return (
    <div className="devis-page">
      <header className="devis-header">
        <div>
          <h1>📄 Devis</h1>
          <p className="devis-subtitle">{devisList.length} devis enregistré(s)</p>
        </div>
        <button className="btn-primary" onClick={() => { setEditDevis(null); setShowForm(true); }}>+ Nouveau devis</button>
      </header>

      <div className="devis-controls">
        <input className="search-input" placeholder="Rechercher (référence, client)..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        <div className="filter-tabs">
          {['all', ...Object.keys(STATUS_CONFIG)].map(s => (
            <button key={s} className={`filter-tab ${filterStatus === s ? 'active' : ''}`} onClick={() => setFilterStatus(s)}>
              {s === 'all' ? 'Tous' : STATUS_CONFIG[s].label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="loading-msg">Chargement...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <p>Aucun devis trouvé</p>
          <button className="btn-primary" onClick={() => setShowForm(true)}>Créer le premier devis</button>
        </div>
      ) : (
        <div className="devis-list">
          {filtered.map(d => {
            const st = STATUS_CONFIG[d.status] || STATUS_CONFIG.brouillon;
            const { ttc } = calcTotal(d);
            return (
              <div key={d.id} className="devis-card">
                <div className="devis-card-header">
                  <div>
                    <h3>{d.reference}</h3>
                    <p className="devis-client">{d.clientId?.name || 'Client non défini'}</p>
                    {d.companyId && <span className="devis-company-badge">{d.companyId.name}</span>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="devis-amount">{ttc.toLocaleString('fr-FR', { style: 'currency', currency: 'MAD', maximumFractionDigits: 0 })}</div>
                    <span className="status-badge" style={{ background: st.bg, color: st.text }}>{st.label}</span>
                  </div>
                </div>

                <div className="devis-meta">
                  <span>📅 {new Date(d.date).toLocaleDateString('fr-FR')}</span>
                  {d.validUntil && <span>⏰ Valide jusqu'au {new Date(d.validUntil).toLocaleDateString('fr-FR')}</span>}
                  <span>🪟 {(d.lines || []).length} ligne(s)</span>
                </div>

                <div className="devis-actions">
                  <button className="btn-preview" onClick={() => setPreviewDevis(d)}>👁 Aperçu</button>
                  <button className="btn-edit" onClick={() => { setEditDevis(d); setShowForm(true); }}>Modifier</button>
                  <select className="status-select" value={d.status} onChange={e => handleStatusChange(d.id, e.target.value)}>
                    {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <button className="btn-delete" onClick={() => handleDelete(d.id)}>Supprimer</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <DevisForm
          devis={editDevis}
          clients={clients}
          companies={companies}
          chassisTypes={chassisTypes}
          onClose={() => { setShowForm(false); setEditDevis(null); }}
          onSave={() => { setShowForm(false); setEditDevis(null); fetchAll(); }}
        />
      )}

      {previewDevis && (
        <DevisPreview
          devis={previewDevis}
          calcTotal={calcTotal}
          chassisTypes={chassisTypes}
          onClose={() => setPreviewDevis(null)}
        />
      )}
    </div>
  );
}

function DevisForm({ devis, clients, companies, chassisTypes, onClose, onSave }) {
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState(devis ? {
    reference: devis.reference, clientId: devis.clientId?.id || devis.clientId?._id || '',
    companyId: devis.companyId?.id || devis.companyId?._id || '',
    date: devis.date?.split('T')[0] || today,
    validUntil: devis.validUntil?.split('T')[0] || '',
    status: devis.status, tva: devis.tva || 20, notes: devis.notes || '',
    lines: (devis.lines || []).map(l => ({ ...l }))
  } : {
    reference: `DEV-${Date.now().toString().slice(-6)}`,
    clientId: clients[0]?.id || '', companyId: companies[0]?.id || '',
    date: today, validUntil: '', status: 'brouillon', tva: 20, notes: '', lines: []
  });

  const addLine = () => setForm(f => ({
    ...f,
    lines: [...f.lines, {
      chassisType: chassisTypes[0]?.value || '',
      description: chassisTypes[0]?.fr || '',
      largeur: 0, hauteur: 0, quantity: 1, unitPrice: 0, discount: 0, ralCode: ''
    }]
  }));
  const removeLine = idx => setForm(f => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }));
  const updateLine = (idx, field, val) => setForm(f => ({ ...f, lines: f.lines.map((l, i) => i === idx ? { ...l, [field]: val } : l) }));

  const calcLineTotal = (l) => l.quantity * l.unitPrice * (1 - (l.discount || 0) / 100);
  const totalHT = form.lines.reduce((s, l) => s + calcLineTotal(l), 0);
  const totalTVA = totalHT * form.tva / 100;
  const totalTTC = totalHT + totalTVA;

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (devis) { await axios.put(`${API_URL}/devis/${devis.id}`, form); }
      else { await axios.post(`${API_URL}/devis`, form); }
      onSave();
    } catch(e) { alert(e.response?.data?.error || 'Erreur'); }
  };

  const handleChassisTypeChange = (idx, value) => {
    const ct = chassisTypes.find(t => t.value === value);
    updateLine(idx, 'chassisType', value);
    if (ct) updateLine(idx, 'description', ct.fr);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal xlarge" onClick={e => e.stopPropagation()}>
        <h2>{devis ? 'Modifier le devis' : 'Nouveau devis'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-grid-3">
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
              <label>Client</label>
              <select value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))}>
                <option value="">Sans client</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ''}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Date *</label>
              <input required type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Valide jusqu'au</label>
              <input type="date" value={form.validUntil} onChange={e => setForm(f => ({ ...f, validUntil: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>TVA (%)</label>
              <input type="number" min={0} max={100} value={form.tva} onChange={e => setForm(f => ({ ...f, tva: Number(e.target.value) }))} />
            </div>
          </div>

          {/* Lines */}
          <div className="devis-lines-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>Lignes du devis (Châssis)</h3>
              <button type="button" className="btn-add-line" onClick={addLine}>+ Ajouter châssis</button>
            </div>

            {form.lines.length === 0 && <p style={{ color: '#888', textAlign: 'center', padding: 20 }}>Aucune ligne. Ajoutez des châssis.</p>}

            {form.lines.map((line, idx) => (
              <div key={idx} className="devis-line-form">
                <div className="line-form-row">
                  <div className="form-group" style={{ flex: 2 }}>
                    <label>Type de châssis</label>
                    <select value={line.chassisType} onChange={e => handleChassisTypeChange(idx, e.target.value)}>
                      {chassisTypes.map(ct => <option key={ct.value} value={ct.value}>{ct.fr}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ flex: 2 }}>
                    <label>Description</label>
                    <input type="text" value={line.description} onChange={e => updateLine(idx, 'description', e.target.value)} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Code RAL</label>
                    <input type="text" placeholder="ex: RAL 7016" value={line.ralCode} onChange={e => updateLine(idx, 'ralCode', e.target.value)} />
                  </div>
                </div>
                <div className="line-form-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Largeur (mm)</label>
                    <input type="number" min={0} value={line.largeur} onChange={e => updateLine(idx, 'largeur', Number(e.target.value))} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Hauteur (mm)</label>
                    <input type="number" min={0} value={line.hauteur} onChange={e => updateLine(idx, 'hauteur', Number(e.target.value))} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Quantité</label>
                    <input type="number" min={1} value={line.quantity} onChange={e => updateLine(idx, 'quantity', Number(e.target.value))} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Prix unitaire</label>
                    <input type="number" min={0} step="0.01" value={line.unitPrice} onChange={e => updateLine(idx, 'unitPrice', Number(e.target.value))} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Remise (%)</label>
                    <input type="number" min={0} max={100} value={line.discount} onChange={e => updateLine(idx, 'discount', Number(e.target.value))} />
                  </div>
                  <div className="form-group line-total" style={{ flex: 1 }}>
                    <label>Total HT</label>
                    <div className="line-total-value">{calcLineTotal(line).toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</div>
                  </div>
                  <button type="button" className="btn-remove-line" onClick={() => removeLine(idx)}>×</button>
                </div>
              </div>
            ))}

            {form.lines.length > 0 && (
              <div className="devis-totals">
                <div className="total-row"><span>Total HT</span><strong>{totalHT.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</strong></div>
                <div className="total-row"><span>TVA ({form.tva}%)</span><strong>{totalTVA.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</strong></div>
                <div className="total-row ttc"><span>Total TTC</span><strong>{totalTTC.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</strong></div>
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Notes / Conditions</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose}>Annuler</button>
            <button type="submit" className="primary">{devis ? 'Mettre à jour' : 'Créer le devis'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DevisPreview({ devis, calcTotal, chassisTypes, onClose }) {
  const { ht, tva, ttc } = calcTotal(devis);
  const getChassisLabel = (val) => chassisTypes.find(t => t.value === val)?.fr || val;

  const handlePrint = () => window.print();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal xlarge devis-preview" onClick={e => e.stopPropagation()}>
        <div className="preview-toolbar">
          <button onClick={handlePrint} className="btn-print">🖨️ Imprimer</button>
          <button onClick={onClose}>✕ Fermer</button>
        </div>

        <div className="devis-doc" id="devis-print">
          <div className="devis-doc-header">
            <div>
              <div className="doc-company-name">{devis.companyId?.name || 'CAMI'}</div>
              <div className="doc-company-info">{devis.companyId?.address}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="doc-title">DEVIS</div>
              <div className="doc-ref">{devis.reference}</div>
              <div className="doc-date">Date : {new Date(devis.date).toLocaleDateString('fr-FR')}</div>
              {devis.validUntil && <div className="doc-date">Valide jusqu'au : {new Date(devis.validUntil).toLocaleDateString('fr-FR')}</div>}
            </div>
          </div>

          {devis.clientId && (
            <div className="devis-doc-client">
              <strong>Client :</strong> {devis.clientId.name}
              {devis.clientId.company && <> — {devis.clientId.company}</>}
              {devis.clientId.address && <>, {devis.clientId.address}</>}
              {devis.clientId.city && <>, {devis.clientId.city}</>}
            </div>
          )}

          <table className="devis-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Description</th>
                <th>Dimensions</th>
                <th>RAL</th>
                <th>Qté</th>
                <th>Prix unit.</th>
                <th>Remise</th>
                <th>Total HT</th>
              </tr>
            </thead>
            <tbody>
              {(devis.lines || []).map((line, idx) => {
                const lineTotal = line.quantity * line.unitPrice * (1 - (line.discount || 0) / 100);
                return (
                  <tr key={idx}>
                    <td>{getChassisLabel(line.chassisType)}</td>
                    <td>{line.description}</td>
                    <td>{line.largeur && line.hauteur ? `${line.largeur}×${line.hauteur}` : '—'}</td>
                    <td>{line.ralCode || '—'}</td>
                    <td style={{ textAlign: 'center' }}>{line.quantity}</td>
                    <td style={{ textAlign: 'right' }}>{line.unitPrice.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</td>
                    <td style={{ textAlign: 'center' }}>{line.discount ? `${line.discount}%` : '—'}</td>
                    <td style={{ textAlign: 'right' }}><strong>{lineTotal.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</strong></td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="devis-doc-totals">
            <div className="doc-total-row"><span>Total HT</span><span>{ht.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</span></div>
            <div className="doc-total-row"><span>TVA ({devis.tva}%)</span><span>{tva.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</span></div>
            <div className="doc-total-row ttc"><span>Total TTC</span><span>{ttc.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</span></div>
          </div>

          {devis.notes && <div className="devis-doc-notes"><strong>Notes :</strong> {devis.notes}</div>}
        </div>
      </div>
    </div>
  );
}
