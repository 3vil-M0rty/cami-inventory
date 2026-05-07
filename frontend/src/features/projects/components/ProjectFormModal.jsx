// components/ProjectFormModal.jsx
import { useState, useEffect } from 'react';
import axios from 'axios';
import RalPicker from './RalPicker';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

export default function ProjectFormModal({ language, project, companies, tab, t, onClose, onSave }) {
  const [clients, setClients] = useState([]);

  const [formData, setFormData] = useState(project ? {
    name:      project.name,
    reference: project.reference,
    ralCode:   project.ralCode,
    ralColor:  project.ralColor || '#ffffff',
    date:      project.date ? project.date.split('T')[0] : '',
    companyId: project.companyId?.id || project.companyId?._id || '',
    clientId:  project.clientId?.id  || project.clientId?._id  || '',
    tab:       project.tab || tab || 'aluminium',
  } : {
    name: '', reference: '', ralCode: '', ralColor: '#ffffff',
    date: new Date().toISOString().split('T')[0],
    companyId: companies[0]?.id || '',
    clientId: '',
    tab: tab || 'aluminium',   // always locked to the current tab
  });

  useEffect(() => {
    axios.get(`${API_URL}/clients`).then(r => setClients(r.data)).catch(console.error);
  }, []);

  const set = (key, val) => setFormData(prev => ({ ...prev, [key]: val }));

  const filteredClients = formData.companyId
    ? clients.filter(c =>
        !c.companyId ||
        c.companyId?.id === formData.companyId ||
        c.companyId?._id === formData.companyId
      )
    : clients;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal large" onClick={e => e.stopPropagation()}>
        <h2>{project ? t('edit') : t('addProject')}</h2>

        {/* Company selector */}
        <div className="project-form-company-selector">
          <label style={{ fontWeight: 700, marginBottom: 8, display: 'block' }}>{t('society')} *</label>
          <div className="company-choice-btns">
            {companies.map(c => (
              <button key={c.id} type="button"
                className={`company-choice-btn ${formData.companyId === c.id ? 'active' : ''}`}
                onClick={() => set('companyId', c.id)}>
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={e => { e.preventDefault(); onSave(formData); }}>
          <div className="form-row">
            <div className="form-group">
              <label>{t('projectName')}</label>
              <input type="text" required value={formData.name}
                onChange={e => set('name', e.target.value)} />
            </div>
            <div className="form-group">
              <label>{t('reference')}</label>
              <input type="text" required value={formData.reference}
                onChange={e => set('reference', e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label>{t('ralCode')} / {t('poudre') || 'Poudre'}</label>
            <RalPicker
              language={language}
              value={formData.ralCode}
              colorValue={formData.ralColor}
              t={t}
              onChange={({ ralCode, ralColor }) =>
                setFormData(prev => ({ ...prev, ralCode, ralColor }))
              }
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>{t('date')}</label>
              <input type="date" required value={formData.date}
                onChange={e => set('date', e.target.value)} />
            </div>
            <div className="form-group">
              <label>
                {t('navClients')} (optionnel)
              </label>
              <select value={formData.clientId} onChange={e => set('clientId', e.target.value)}>
                <option value="">——</option>
                {filteredClients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.company ? ` (${c.company})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose}>{t('cancel')}</button>
            <button type="submit" className="primary">
              {project ? t('update') : t('create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}