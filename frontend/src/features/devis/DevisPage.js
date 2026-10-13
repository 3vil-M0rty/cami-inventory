import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useLanguage } from '../../context/LanguageContext';
import { dialog, errorMessage } from '../../components/common/dialog';
import { FileText, Calendar, Clock, Layers, Eye, Pencil, Trash2, Plus, Printer, X } from 'lucide-react';
import './DevisPage.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

// label = translation key
const STATUS_CONFIG = {
  brouillon: { label: 'dvStBrouillon', bg: 'rgba(161,161,170,.12)', text: '#d4d4d8', bd: 'rgba(161,161,170,.3)' },
  envoye:    { label: 'dvStEnvoye',    bg: 'rgba(96,165,250,.12)',  text: '#93c5fd', bd: 'rgba(96,165,250,.3)' },
  accepte:   { label: 'dvStAccepte',   bg: 'rgba(74,222,128,.12)',  text: '#86efac', bd: 'rgba(74,222,128,.3)' },
  refuse:    { label: 'dvStRefuse',    bg: 'rgba(248,113,113,.12)', text: '#fca5a5', bd: 'rgba(248,113,113,.3)' },
};

export default function DevisPage() {
  const { companies, selectedCompany } = useCompany();
  const { t } = useLanguage();
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

  const handleDelete = async (d) => {
    if (!(await dialog.confirm({ title: t('deleteTitle'), message: t('dvDeleteConfirm', { ref: d.reference }), danger: true, confirmLabel: t('deleteAction') }))) return;
    try {
      await axios.delete(`${API_URL}/devis/${d.id}`);
      fetchAll();
    } catch (e) { dialog.alert(errorMessage(e, t('errDelete'))); }
  };

  const handleStatusChange = async (id, status) => {
    try {
      await axios.put(`${API_URL}/devis/${id}`, { status });
      fetchAll();
    } catch (e) { dialog.alert(errorMessage(e, t('errSave'))); }
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
        <div className="devis-header__title">
          <span className="devis-header__icon"><FileText size={18} strokeWidth={2} /></span>
          <div>
            <h1>{t('dvTitle')}</h1>
            <p className="devis-subtitle">{t('dvCount', { n: devisList.length })}</p>
          </div>
        </div>
        <button className="btn btn--primary" onClick={() => { setEditDevis(null); setShowForm(true); }}>{t('dvNew')}</button>
      </header>

      <div className="devis-controls">
        <input className="search-input" placeholder={t('dvSearch')} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        <div className="filter-tabs">
          {['all', ...Object.keys(STATUS_CONFIG)].map(s => (
            <button key={s} className={`filter-tab ${filterStatus === s ? 'active' : ''}`} onClick={() => setFilterStatus(s)}>
              {s === 'all' ? t('dvAll') : t(STATUS_CONFIG[s].label)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="devis-empty panel"><p>{t('loadingShort')}</p></div>
      ) : filtered.length === 0 ? (
        <div className="devis-empty panel">
          <span className="devis-empty__icon"><FileText size={20} strokeWidth={1.8} /></span>
          <p>{t('dvNone')}</p>
          <button className="btn btn--secondary" onClick={() => setShowForm(true)}><Plus size={14} />{t('dvCreateFirst')}</button>
        </div>
      ) : (
        <div className="devis-list">
          {filtered.map(d => {
            const st = STATUS_CONFIG[d.status] || STATUS_CONFIG.brouillon;
            const { ttc } = calcTotal(d);
            return (
              <div key={d.id} className="devis-card">
                <div className="devis-card-header">
                  <div className="devis-card-main">
                    <div className="devis-card-ref">
                      <h3>{d.reference}</h3>
                      <span className="devis-status-badge" style={{ background: st.bg, color: st.text, borderColor: st.bd }}>{t(st.label)}</span>
                    </div>
                    <p className="devis-client">
                      {d.clientId?.name || t('dvNoClient')}
                      {d.companyId && <span className="devis-company-badge">{d.companyId.name}</span>}
                    </p>
                  </div>
                  <div className="devis-amount">{ttc.toLocaleString('fr-FR', { style: 'currency', currency: 'MAD', maximumFractionDigits: 0 })}</div>
                </div>

                <div className="devis-meta">
                  <span><Calendar size={13} />{new Date(d.date).toLocaleDateString('fr-FR')}</span>
                  {d.validUntil && <span><Clock size={13} />{t('dvValidUntil', { date: new Date(d.validUntil).toLocaleDateString('fr-FR') })}</span>}
                  <span><Layers size={13} />{t('dvLines', { n: (d.lines || []).length })}</span>
                </div>

                <div className="devis-actions">
                  <button className="btn btn--secondary btn--sm" onClick={() => setPreviewDevis(d)}><Eye size={13} />{t('dvPreview')}</button>
                  <button className="btn btn--secondary btn--sm" onClick={() => { setEditDevis(d); setShowForm(true); }}><Pencil size={13} />{t('edit')}</button>
                  <select className="status-select" value={d.status} onChange={e => handleStatusChange(d.id, e.target.value)}>
                    {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{t(v.label)}</option>)}
                  </select>
                  <button className="btn btn--danger btn--sm devis-actions__delete" onClick={() => handleDelete(d)}><Trash2 size={13} />{t('delete')}</button>
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
  const { t, currentLanguage: lang } = useLanguage();
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
    } catch(e) { dialog.alert(errorMessage(e, t('errSave'))); }
  };

  const handleChassisTypeChange = (idx, value) => {
    const ct = chassisTypes.find(c => c.value === value);
    updateLine(idx, 'chassisType', value);
    if (ct) updateLine(idx, 'description', ct[lang] || ct.fr);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal xlarge devis-form-modal" onClick={e => e.stopPropagation()}>
        <h2>{devis ? t('dvEditTitle') : t('dvNewTitle')}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-grid-3">
            <div className="form-group">
              <label>{t('dvCompany')}</label>
              <select required value={form.companyId} onChange={e => setForm(f => ({ ...f, companyId: e.target.value }))}>
                <option value="">{t('dvChoose')}</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>{t('dvReference')}</label>
              <input required type="text" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>{t('dvClient')}</label>
              <select value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))}>
                <option value="">{t('dvNoClientOpt')}</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ''}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>{t('dvDate')}</label>
              <input required type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>{t('dvValidUntilLabel')}</label>
              <input type="date" value={form.validUntil} onChange={e => setForm(f => ({ ...f, validUntil: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>{t('dvTva')}</label>
              <input type="number" min={0} max={100} value={form.tva} onChange={e => setForm(f => ({ ...f, tva: Number(e.target.value) }))} />
            </div>
          </div>

          {/* Lines */}
          <div className="devis-lines-section">
            <div className="devis-lines-head">
              <h3>{t('dvLinesTitle')}</h3>
              <button type="button" className="btn btn--secondary btn--sm btn-add-line" onClick={addLine}>{t('dvAddChassis')}</button>
            </div>

            {form.lines.length === 0 && <p className="devis-lines-empty">{t('dvNoLines')}</p>}

            {form.lines.map((line, idx) => (
              <div key={idx} className="devis-line-form">
                <div className="line-form-row">
                  <div className="form-group" style={{ flex: 2 }}>
                    <label>{t('dvChassisType')}</label>
                    <select value={line.chassisType} onChange={e => handleChassisTypeChange(idx, e.target.value)}>
                      {chassisTypes.map(ct => <option key={ct.value} value={ct.value}>{ct[lang] || ct.fr}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ flex: 2 }}>
                    <label>{t('dvDescription')}</label>
                    <input type="text" value={line.description} onChange={e => updateLine(idx, 'description', e.target.value)} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>{t('dvRal')}</label>
                    <input type="text" placeholder={t('dvRalPh')} value={line.ralCode} onChange={e => updateLine(idx, 'ralCode', e.target.value)} />
                  </div>
                </div>
                <div className="line-form-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>{t('dvWidth')}</label>
                    <input type="number" min={0} value={line.largeur} onChange={e => updateLine(idx, 'largeur', Number(e.target.value))} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>{t('dvHeight')}</label>
                    <input type="number" min={0} value={line.hauteur} onChange={e => updateLine(idx, 'hauteur', Number(e.target.value))} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>{t('dvQty')}</label>
                    <input type="number" min={1} value={line.quantity} onChange={e => updateLine(idx, 'quantity', Number(e.target.value))} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>{t('dvUnitPrice')}</label>
                    <input type="number" min={0} step="0.01" value={line.unitPrice} onChange={e => updateLine(idx, 'unitPrice', Number(e.target.value))} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>{t('dvDiscount')}</label>
                    <input type="number" min={0} max={100} value={line.discount} onChange={e => updateLine(idx, 'discount', Number(e.target.value))} />
                  </div>
                  <div className="form-group line-total" style={{ flex: 1 }}>
                    <label>{t('dvTotalHT')}</label>
                    <div className="line-total-value">{calcLineTotal(line).toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</div>
                  </div>
                  <button type="button" className="btn-remove-line" onClick={() => removeLine(idx)} aria-label={t('delete')}><X size={15} /></button>
                </div>
              </div>
            ))}

            {form.lines.length > 0 && (
              <div className="devis-totals">
                <div className="total-row"><span>{t('dvTotalHT')}</span><strong>{totalHT.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</strong></div>
                <div className="total-row"><span>{t('dvTotalTVA', { n: form.tva })}</span><strong>{totalTVA.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</strong></div>
                <div className="total-row ttc"><span>{t('dvTotalTTC')}</span><strong>{totalTTC.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</strong></div>
              </div>
            )}
          </div>

          <div className="form-group">
            <label>{t('dvNotes')}</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose}>{t('cancel')}</button>
            <button type="submit" className="primary">{devis ? t('update') : t('dvCreate')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DevisPreview({ devis, calcTotal, chassisTypes, onClose }) {
  const { t, currentLanguage: lang } = useLanguage();
  const { ht, tva, ttc } = calcTotal(devis);
  const getChassisLabel = (val) => { const ct = chassisTypes.find(c => c.value === val); return ct ? (ct[lang] || ct.fr) : val; };

  const handlePrint = () => window.print();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal xlarge devis-preview" onClick={e => e.stopPropagation()}>
        <div className="preview-toolbar">
          <button onClick={handlePrint} className="btn btn--primary btn-print"><Printer size={14} />{t('dvPrint')}</button>
          <button onClick={onClose} className="btn btn--secondary"><X size={14} />{t('close')}</button>
        </div>

        <div className="devis-doc" id="devis-print">
          <div className="devis-doc-header">
            <div>
              <div className="doc-company-name">{devis.companyId?.name || 'CAMI'}</div>
              <div className="doc-company-info">{devis.companyId?.address}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="doc-title">{t('dvDocTitle')}</div>
              <div className="doc-ref">{devis.reference}</div>
              <div className="doc-date">{t('dvDocDate', { date: new Date(devis.date).toLocaleDateString('fr-FR') })}</div>
              {devis.validUntil && <div className="doc-date">{t('dvDocValid', { date: new Date(devis.validUntil).toLocaleDateString('fr-FR') })}</div>}
            </div>
          </div>

          {devis.clientId && (
            <div className="devis-doc-client">
              <strong>{t('dvDocClient')}</strong> {devis.clientId.name}
              {devis.clientId.company && <> — {devis.clientId.company}</>}
              {devis.clientId.address && <>, {devis.clientId.address}</>}
              {devis.clientId.city && <>, {devis.clientId.city}</>}
            </div>
          )}

          <table className="devis-table">
            <thead>
              <tr>
                <th>{t('dvColType')}</th>
                <th>{t('dvDescription')}</th>
                <th>{t('dvColDims')}</th>
                <th>{t('dvColRal')}</th>
                <th>{t('dvColQty')}</th>
                <th>{t('dvColUnit')}</th>
                <th>{t('dvColDiscount')}</th>
                <th>{t('dvTotalHT')}</th>
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
            <div className="doc-total-row"><span>{t('dvTotalHT')}</span><span>{ht.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</span></div>
            <div className="doc-total-row"><span>{t('dvTotalTVA', { n: devis.tva })}</span><span>{tva.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</span></div>
            <div className="doc-total-row ttc"><span>{t('dvTotalTTC')}</span><span>{ttc.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</span></div>
          </div>

          {devis.notes && <div className="devis-doc-notes"><strong>{t('dvDocNotes')}</strong> {devis.notes}</div>}
        </div>
      </div>
    </div>
  );
}
