import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

export default function ChangePasswordModal({ onClose }) {
  const { authFetch } = useAuth();
  const [form, setForm]   = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.newPassword !== form.confirm) { setError('Les mots de passe ne correspondent pas'); return; }
    if (form.newPassword.length < 4) { setError('Mot de passe trop court (min 4 caractères)'); return; }
    const r = await authFetch(`${API_URL}/auth/change-password`, {
      method: 'POST',
      body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword })
    });
    const data = await r.json();
    if (!r.ok) { setError(data.error || 'Erreur'); return; }
    setSuccess(true);
    setTimeout(onClose, 1500);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400, padding: 28 }}>
        <h2 style={{ marginBottom: 20 }}>🔒 Changer le mot de passe</h2>
        {success ? (
          <div style={{ color: '#16a34a', fontWeight: 600, textAlign: 'center', padding: 20 }}>✅ Mot de passe mis à jour !</div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Mot de passe actuel</label>
              <input type="password" required value={form.currentPassword} onChange={e => setForm(f => ({ ...f, currentPassword: e.target.value }))} autoFocus />
            </div>
            <div className="form-group">
              <label>Nouveau mot de passe</label>
              <input type="password" required value={form.newPassword} onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Confirmer le nouveau mot de passe</label>
              <input type="password" required value={form.confirm} onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} />
            </div>
            {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, fontSize: '0.88rem', marginBottom: 12, border: '1px solid #fecaca' }}>{error}</div>}
            <div className="modal-actions">
              <button type="button" onClick={onClose}>Annuler</button>
              <button type="submit" className="primary">Changer</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
