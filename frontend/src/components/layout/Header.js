import { useLanguage } from '../../context/LanguageContext';
import './Header.css';

/**
 * Header Component
 *
 * Extended with Inventaire / Projets navigation tabs.
 * All existing styles preserved.
 */

const Header = ({ activePage, onNavigate }) => {
  const { t, currentLanguage, changeLanguage, languageLabels } = useLanguage();

  return (
    <header className="header">
      <div className="header__container">
        <div className="header__brand">
          <div className="header__logo">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect x="2" y="2" width="28" height="28" rx="6" stroke="currentColor" strokeWidth="2"/>
              <path d="M8 16L14 10L18 14L24 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="14" cy="10" r="1.5" fill="currentColor"/>
              <circle cx="18" cy="14" r="1.5" fill="currentColor"/>
              <circle cx="24" cy="8" r="1.5" fill="currentColor"/>
            </svg>
          </div>
          <div className="header__text">
            <h1 className="header__title">{t('appTitle')}</h1>
            <p className="header__subtitle">{t('appSubtitle')}</p>
          </div>
        </div>

        <nav className="header__nav">
          <button
            className={`header__nav-btn ${activePage === 'inventory' ? 'header__nav-btn--active' : ''}`}
            onClick={() => onNavigate('inventory')}
          >
            {t('navInventory')}
          </button>
          <button
            className={`header__nav-btn ${activePage === 'projects' ? 'header__nav-btn--active' : ''}`}
            onClick={() => onNavigate('projects')}
          >
            {t('navProjects')}
          </button>
        </nav>

        <div className="header__actions">
          <div className="language-selector">
            {Object.entries(languageLabels).map(([code, label]) => (
              <button
                key={code}
                className={`language-selector__btn ${currentLanguage === code ? 'language-selector__btn--active' : ''}`}
                onClick={() => changeLanguage(code)}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
