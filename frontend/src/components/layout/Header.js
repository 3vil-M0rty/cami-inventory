import React, { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import ChangePasswordModal from '../../features/admin/ChangePasswordModal';
import './Header.css';

const Header = ({ activePage, onNavigate }) => {
  const { t, currentLanguage, changeLanguage, languageLabels } = useLanguage();
  const { companies, selectedCompany, setSelectedCompany } = useCompany();
  const { user, logout, can } = useAuth();

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { key: 'inventory', label: t('navInventory'), perm: 'inventory.view' },
    { key: 'orders', label: 'Commandes', perm: 'orders.view' },
    { key: 'projects', label: t('navProjects'), perm: 'projects.view' },
    { key: 'clients', label: 'Clients', perm: 'clients.view' },
    { key: 'devis', label: 'Devis', perm: 'devis.view' },
    { key: 'movements', label: t('navMovements'), perm: 'movements.view' },
    { key: 'analytics', label: t('navAnalytics'), perm: 'analytics.view' },
    { key: 'admin', label: '⚙️ Admin', perm: 'admin.view' },
  ].filter(item => can(item.perm));

  return (
    <header className="header">
      <div className="header__container">
        {/* Brand */}
        <div className="header__brand">
          <div className="header__logo">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect x="2" y="2" width="28" height="28" rx="6" stroke="currentColor" strokeWidth="2" />
              <path d="M8 16L14 10L18 14L24 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="14" cy="10" r="1.5" fill="currentColor" />
              <circle cx="18" cy="14" r="1.5" fill="currentColor" />
              <circle cx="24" cy="8" r="1.5" fill="currentColor" />
            </svg>
          </div>
          <div className="header__text">
            <h1 className="header__title">{t('appTitle')}</h1>
            <p className="header__subtitle">{t('appSubtitle')}</p>
          </div>
        </div>

        {/* Desktop nav */}
        <nav className="header__nav desktop-only">
          {navItems.map(item => (
            <button
              key={item.key}
              className={`header__nav-btn ${activePage === item.key ? 'header__nav-btn--active' : ''}`}
              onClick={() => onNavigate(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Desktop actions */}
        <div className="header__actions desktop-only">
          {/* Company selector */}
          <div className="company-selector">
            <button className={`company-btn ${!selectedCompany ? 'company-btn--active' : ''}`} onClick={() => setSelectedCompany(null)}>Tout</button>
            {companies.map(c => (
              <button key={c.id} className={`company-btn ${selectedCompany === c.id ? 'company-btn--active' : ''}`}
                style={{ '--company-color': c.color }}
                onClick={() => setSelectedCompany(selectedCompany === c.id ? null : c.id)}>
                {c.name}
              </button>
            ))}
          </div>

          {/* Language selector */}
          <div className="language-selector">
            {Object.entries(languageLabels).map(([code]) => (
              <button key={code}
                className={`language-selector__btn ${currentLanguage === code ? 'language-selector__btn--active' : ''}`}
                onClick={() => changeLanguage(code)}>
                {code.toUpperCase()}
              </button>
            ))}
          </div>

          {/* User menu */}
          <div className="user-menu-wrap">
            <button className="user-menu-btn" onClick={() => setShowUserMenu(v => !v)}>
              <div className="user-avatar">{user?.displayName?.charAt(0).toUpperCase()}</div>
              <span className="user-name">{user?.displayName}</span>
              <span className="user-role-tag">{user?.role}</span>
              <span style={{ fontSize: 10, opacity: 0.7 }}>▼</span>
            </button>
            {showUserMenu && (
              <div className="user-dropdown" onClick={() => setShowUserMenu(false)}>
                <div className="user-dropdown-info">
                  <strong>{user?.displayName}</strong>
                  <span>@{user?.username}</span>
                  <span className="ud-role">{user?.role}</span>
                </div>
                <button className="ud-item" onClick={() => { setShowChangePwd(true); setShowUserMenu(false); }}>
                  🔒 Changer le mot de passe
                </button>
                <button className="ud-item ud-logout" onClick={logout}>
                  🚪 Se déconnecter
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Hamburger mobile toggle */}
        <button
          className="header__hamburger mobile-only"
          onClick={() => setMobileMenuOpen(v => !v)}
          aria-label="Toggle menu"
        >
          <span className={mobileMenuOpen ? 'open' : ''}></span>
          <span className={mobileMenuOpen ? 'open' : ''}></span>
          <span className={mobileMenuOpen ? 'open' : ''}></span>
        </button>
      </div>

      {/* Mobile menu */}
      <div className={`header__mobile-menu mobile-only ${mobileMenuOpen ? 'open' : ''}`}>
        <nav className="header__nav">
          {navItems.map(item => (
            <button
              key={item.key}
              className={`header__nav-btn ${activePage === item.key ? 'header__nav-btn--active' : ''}`}
              onClick={() => { onNavigate(item.key); setMobileMenuOpen(false); }}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="header__actions">
          {/* Company selector */}
          <div className="company-selector">
            <button className={`company-btn ${!selectedCompany ? 'company-btn--active' : ''}`} onClick={() => setSelectedCompany(null)}>Tout</button>
            {companies.map(c => (
              <button key={c.id} className={`company-btn ${selectedCompany === c.id ? 'company-btn--active' : ''}`}
                style={{ '--company-color': c.color }}
                onClick={() => setSelectedCompany(selectedCompany === c.id ? null : c.id)}>
                {c.name}
              </button>
            ))}
          </div>

          {/* Language selector */}
          <div className="language-selector">
            {Object.entries(languageLabels).map(([code]) => (
              <button key={code}
                className={`language-selector__btn ${currentLanguage === code ? 'language-selector__btn--active' : ''}`}
                onClick={() => changeLanguage(code)}>
                {code.toUpperCase()}
              </button>
            ))}
          </div>

          {/* User menu */}
          <div className="user-menu-wrap">
            <button className="user-menu-btn" onClick={() => setShowUserMenu(v => !v)}>
              <div className="user-avatar">{user?.displayName?.charAt(0).toUpperCase()}</div>
              <span className="user-name">{user?.displayName}</span>
              <span className="user-role-tag">{user?.role}</span>
              <span style={{ fontSize: 10, opacity: 0.7 }}>▼</span>
            </button>
            {showUserMenu && (
              <div className="user-dropdown" onClick={() => setShowUserMenu(false)}>
                <div className="user-dropdown-info">
                  <strong>{user?.displayName}</strong>
                  <span>@{user?.username}</span>
                  <span className="ud-role">{user?.role}</span>
                </div>
                <button className="ud-item" onClick={() => { setShowChangePwd(true); setShowUserMenu(false); }}>
                  🔒 Changer le mot de passe
                </button>
                <button className="ud-item ud-logout" onClick={logout}>
                  🚪 Se déconnecter
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showChangePwd && <ChangePasswordModal onClose={() => setShowChangePwd(false)} />}
    </header>
  );
};

export default Header;