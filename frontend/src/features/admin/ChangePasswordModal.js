import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import './AdminPage.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

export default function ChangePasswordModal({ onClose }) {
  const { authFetch } = useAuth();
  const { t } = useLanguage();
  const [form, setForm]   = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.newPassword !== form.confirm) { setError(t('acPwMismatch')); return; }
    if (form.newPassword.length < 4) { setError(t('acPwTooShort')); return; }
    const r = await authFetch(`${API_URL}/auth/change-password`, {
      method: 'POST',
      body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword })
    });
    const data = await r.json();
    if (!r.ok) { setError(data.error || t('errSave')); return; }
    setSuccess(true);
    setTimeout(onClose, 1500);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal cpw-modal" onClick={e => e.stopPropagation()}>
        <h2 className="cpw-title">
          <span className="cpw-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
          </span>
          {t('acChangePwTitle')}
        </h2>
        {success ? (
          <div className="cpw-success">
            <span className="cpw-success-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
            </span>
            {t('acPwUpdated')}
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>{t('acCurrentPw')}</label>
              <input type="password" required value={form.currentPassword} onChange={e => setForm(f => ({ ...f, currentPassword: e.target.value }))} autoFocus />
            </div>
            <div className="form-group">
              <label>{t('acNewPw')}</label>
              <input type="password" required value={form.newPassword} onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>{t('acConfirmPw')}</label>
              <input type="password" required value={form.confirm} onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} />
            </div>
            {error && <div className="form-error">{error}</div>}
            <div className="modal-actions">
              <button type="button" onClick={onClose}>{t('cancel')}</button>
              <button type="submit" className="primary">{t('acChange')}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
