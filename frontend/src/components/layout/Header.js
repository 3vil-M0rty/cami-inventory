import { useLanguage } from '../../context/LanguageContext';
import './Header.css';

/**
 * Header Component
 * 
 * Main application header with branding and language selector
 */

const Header = () => {
  const { t, currentLanguage, changeLanguage, languages, languageLabels } = useLanguage();

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

       
      </div>
    </header>
  );
};

export default Header;
