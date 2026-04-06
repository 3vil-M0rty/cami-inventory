import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import './LoginPage.css';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <svg width="40" height="40" viewBox="0 0 32 32" fill="none">
            <rect x="2" y="2" width="28" height="28" rx="6" stroke="#1a1a1a" strokeWidth="2"/>
            <path d="M8 16L14 10L18 14L24 8" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="14" cy="10" r="1.5" fill="#1a1a1a"/>
            <circle cx="18" cy="14" r="1.5" fill="#1a1a1a"/>
            <circle cx="24" cy="8" r="1.5" fill="#1a1a1a"/>
          </svg>
        </div>
        <h1 className="login-title">CAMI ALUMINIUM</h1>
        <p className="login-subtitle">Connectez-vous à votre espace</p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label>Nom d'utilisateur</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="admin"
              autoFocus
              autoComplete="username"
              required
            />
          </div>
          <div className="login-field">
            <label>Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

        <p className="login-hint">Contactez l'administrateur si vous avez oublié votre mot de passe.</p>
      </div>
    </div>
  );
}
