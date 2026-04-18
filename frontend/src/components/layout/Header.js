import React, { useState, useRef } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import ChangePasswordModal from '../../features/admin/ChangePasswordModal';

import './Header.css';

const NAV_ICONS = {
  inventory:    '📦',
  orders:       '🛒',
  projects:     '🏗',
  clients:      '👥',
  devis:        '📄',
  movements:    '📊',
  analytics:    '📈',
  admin:        '⚙️',
  ateliertables:'🏭',
};

const Header = ({ activePage, onNavigate }) => {
  const { t, currentLanguage, changeLanguage, languageLabels } = useLanguage();
  const { companies, selectedCompany, setSelectedCompany }     = useCompany();
  const { user, logout, can }                                  = useAuth();

  const [showUserMenu,  setShowUserMenu]  = useState(false);
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [mobileOpen,    setMobileOpen]    = useState(false);

  const userMenuRef = useRef(null);

  const navItems = [
    { key: 'inventory',     label: t('navInventory'),     perm: 'inventory.view'    },
    { key: 'orders',        label: t('navOrders'),        perm: 'orders.view'       },
    { key: 'projects',      label: t('navProjects'),      perm: 'projects.view'     },
    { key: 'clients',       label: t('navClients'),       perm: 'clients.view'      },
    { key: 'devis',         label: t('navDevis'),         perm: 'devis.view'        },
    { key: 'movements',     label: t('navMovements'),     perm: 'movements.view'    },
    { key: 'analytics',     label: t('navAnalytics'),     perm: 'analytics.view'    },
    { key: 'admin',         label: t('navAdmin'),         perm: 'admin.view'        },
    { key: 'ateliertables', label: t('navAtelierTables'), perm: 'ateliertables.view'},
  ].filter(item => can(item.perm));

  const navigate = key => { onNavigate(key); setMobileOpen(false); };

  // Prevents the outside-click handler from firing before onClick
  const handleLogout = () => {
    setShowUserMenu(false);
    logout();
  };

  const handleChangePwd = () => {
    setShowChangePwd(true);
    setShowUserMenu(false);
  };

  // Dropdown — self-contained with its own backdrop to close on outside click
  const userDropdown = showUserMenu && (
    <>
      {/* Invisible full-screen backdrop — clicking outside closes menu */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 399 }}
        onClick={() => setShowUserMenu(false)}
      />
      <div className="hdr__dropdown" style={{ zIndex: 400 }}>
        <div className="hdr__dropdown-info">
          <strong>{user?.displayName}</strong>
          <span>@{user?.username}</span>
          <span className="hdr__dropdown-role">{user?.role}</span>
        </div>
        <button
          className="hdr__dropdown-item"
          onClick={handleChangePwd}>
          🔒 {t('changePassword')}
        </button>
        <button
          className="hdr__dropdown-item hdr__dropdown-logout"
          onClick={handleLogout}>
          🚪 {t('logout')}
        </button>
      </div>
    </>
  );

  const langPicker = (
    <div className="hdr__lang">
      {Object.keys(languageLabels).map(code => (
        <button key={code}
          className={`hdr__lang-btn ${currentLanguage === code ? 'active' : ''}`}
          onClick={() => changeLanguage(code)}>
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );

  const companyPills = (
    <>
      <button
        className={`hdr__company-pill ${!selectedCompany ? 'active' : ''}`}
        onClick={() => setSelectedCompany(null)}>
        {t('allCompanies')}
      </button>
      {companies.map(c => (
        <button key={c.id}
          className={`hdr__company-pill ${selectedCompany === c.id ? 'active' : ''}`}
          style={{ '--cc': c.color }}
          onClick={() => setSelectedCompany(selectedCompany === c.id ? null : c.id)}>
          <span className="hdr__company-dot" style={{ background: c.color }} />
          {c.name}
        </button>
      ))}
    </>
  );

  return (
    <>
      <header className="hdr">

        <div className="hdr__top">

          {/* Brand */}
          <div className="hdr__brand">
            <div className="hdr__logo">
              <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
                <rect x="2" y="2" width="28" height="28" rx="5" stroke="currentColor" strokeWidth="2"/>
                <path d="M8 16L14 10L18 14L24 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="14" cy="10" r="1.8" fill="currentColor"/>
                <circle cx="18" cy="14" r="1.8" fill="currentColor"/>
                <circle cx="24" cy="8"  r="1.8" fill="currentColor"/>
              </svg>
            </div>
            <div className="hdr__brand-text">
              <span className="hdr__title">{t('appTitle')}</span>
              <span className="hdr__subtitle">{t('appSubtitle')}</span>
            </div>
          </div>

          {/* Desktop controls */}
          <div className="hdr__controls desktop-only">
            <div className="hdr__companies">{companyPills}</div>
            {langPicker}
            <div className="hdr__user" ref={userMenuRef}>
              <button className="hdr__user-btn" onClick={() => setShowUserMenu(v => !v)}>
                <span className="hdr__avatar">{user?.displayName?.charAt(0).toUpperCase()}</span>
                <span className="hdr__username">{user?.displayName}</span>
                <span className="hdr__role">{user?.role}</span>
                <span className="hdr__chevron">▾</span>
              </button>
              {userDropdown}
            </div>
          </div>

          {/* Tablet / mobile top-bar controls */}
          <div className="hdr__controls mobile-only" style={{ gap: 8 }}>
            {langPicker}
            <div className="hdr__user" ref={userMenuRef}>
              <button className="hdr__user-btn" onClick={() => setShowUserMenu(v => !v)}>
                <span className="hdr__avatar">{user?.displayName?.charAt(0).toUpperCase()}</span>
                <span className="hdr__username">{user?.displayName}</span>
                <span className="hdr__role">{user?.role}</span>
                <span className="hdr__chevron">▾</span>
              </button>
              {userDropdown}
            </div>
            <button
              className={`hdr__hamburger ${mobileOpen ? 'open' : ''}`}
              onClick={() => setMobileOpen(v => !v)}
              aria-label="Menu"
              style={{ display: 'flex' }}>
              <span /><span /><span />
            </button>
          </div>

        </div>

        {/* Desktop nav row */}
        <nav className="hdr__nav desktop-only">
          {navItems.map(item => (
            <button key={item.key}
              className={`hdr__nav-btn ${activePage === item.key ? 'active' : ''}`}
              onClick={() => navigate(item.key)}>
              <span className="hdr__nav-icon">{NAV_ICONS[item.key]}</span>
              {item.label}
            </button>
          ))}
        </nav>

      </header>

      {/* Mobile / tablet drawer */}
      {mobileOpen && (
        <div className="hdr__mobile-overlay" onClick={() => setMobileOpen(false)}>
          <aside className="hdr__mobile-drawer" onClick={e => e.stopPropagation()}>

            <div className="hdr__mobile-top">
              <span className="hdr__title" style={{ fontSize: 16 }}>{t('appTitle')}</span>
              <button className="hdr__mobile-close" onClick={() => setMobileOpen(false)}>✕</button>
            </div>

            <div style={{ padding: '10px 12px 4px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
              <div className="hdr__mobile-label" style={{ marginBottom: 8 }}>{t('company') || 'Société'}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{companyPills}</div>
            </div>

            <nav className="hdr__mobile-nav">
              {navItems.map(item => (
                <button key={item.key}
                  className={`hdr__mobile-nav-btn ${activePage === item.key ? 'active' : ''}`}
                  onClick={() => navigate(item.key)}>
                  <span style={{ fontSize: 16 }}>{NAV_ICONS[item.key]}</span>
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="hdr__mobile-footer">
              <div className="hdr__mobile-section hdr__mobile-user">
                <span className="hdr__avatar hdr__avatar--lg">
                  {user?.displayName?.charAt(0).toUpperCase()}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user?.displayName}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.6, color: '#fff' }}>@{user?.username}</div>
                  <div style={{ marginTop: 3 }}>
                    <span className="hdr__role" style={{ fontSize: 10 }}>{user?.role}</span>
                  </div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button className="hdr__mobile-action-btn"
                    onClick={() => { setShowChangePwd(true); setMobileOpen(false); }}>
                    🔒
                  </button>
                  <button className="hdr__mobile-action-btn danger" onClick={handleLogout}>
                    🚪
                  </button>
                </div>
              </div>
            </div>

          </aside>
        </div>
      )}

      {showChangePwd && <ChangePasswordModal onClose={() => setShowChangePwd(false)} />}
    </>
  );
};

export default Header;