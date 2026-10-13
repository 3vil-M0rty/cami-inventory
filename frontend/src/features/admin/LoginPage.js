import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';

import './LoginPage.css';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const { t, currentLanguage, changeLanguage, languageLabels } = useLanguage();

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

  const langPicker = (
    <div className="hdr__lang">
      {Object.keys(languageLabels).map(code => (
        <button key={code}
          className={`hdr__lang-btn ${currentLanguage === code ? 'active' : ''}`}
          type="button" title={languageLabels[code]}
          onClick={() => changeLanguage(code)}>
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo" aria-hidden="true">
          <svg viewBox="0 0 32 32" fill="none">
            <rect x="2" y="2" width="28" height="28" rx="5" stroke="currentColor" strokeWidth="2" />
            <path d="M8 16L14 10L18 14L24 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="14" cy="10" r="1.8" fill="currentColor" />
            <circle cx="18" cy="14" r="1.8" fill="currentColor" />
            <circle cx="24" cy="8" r="1.8" fill="currentColor" />
          </svg>
        </div>
        <h1 className="login-title">{t('appTitle')}</h1>
        <p className="login-subtitle">{t('connectez')}</p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label>{t('utilisateur')}</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder={t('anLoginUserPlaceholder')}
              autoFocus
              autoComplete="username"
              required
            />
          </div>
          <div className="login-field">
            <label>{t('mdp')}</label>
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
            {loading ? t('login_loading') : t('login_button')}
          </button>
        </form>

        <p className="login-hint">{t('mdpoubliécontactezadmin')}</p>
        {langPicker}
      </div>
    </div>
  );
}
