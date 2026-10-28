import { useState, useEffect, useRef } from 'react';
import { LanguageProvider } from './context/LanguageContext';
import { InventoryProvider } from './context/InventoryContext';
import { ProjectProvider } from './context/ProjectContext';
import { CompanyProvider } from './context/CompanyContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useLanguage } from './context/LanguageContext';
import Header from './components/layout/Header';
import LoginPage from './features/admin/LoginPage';
import InventoryPage from './features/inventory/InventoryPage';
import ProjectsPage from './features/projects/ProjectsPage';
import AnalyticsPage from './features/analytics/AnalyticsPage';
import MovementsPage from './features/movements/MovementsPage';
import OrdersPage from './features/orders/OrdersPage';
import ClientsPage from './features/clients/ClientsPage';
import DevisPage from './features/devis/DevisPage';
import AdminPage from './features/admin/AdminPage';
import ChantierPage from './features/chantiers/ChantierPage';
import './App.css';
import AtelierTablesPage from './features/AtelierTables';
import { PAGE_PATHS, pageFromLocation, setUrl } from './routes';
import { DialogHost } from './components/common/dialog';

import { Lock } from 'lucide-react';
import { BlsToReceiveBanner } from './features/orders/BlsToReceive';
import GazLowBanner from './features/laquage/GazLowBanner';
import { DocViewerHost } from './features/projects/components/ProjectDocuments';
const PROJECTS_DEFAULT_ROLES = new Set(['LOGISTIQUE', 'Coordinateur', 'BARREMAN', 'Chef de chantier', 'Chef atelier']);
const CHANTIER_DEFAULT_ROLES = new Set(['chefChantier', 'BARREMAN']);
// Rôles qui reçoivent des commandes par catégorie (accessoires / poudre / verre)
// et doivent donc accéder à la page Commandes même sans la permission orders.view
const ORDERS_RECEIVING_ROLES = new Set(['Magasinier', 'Laquage', 'Coordinateur-vitrage']);
const LS_PAGE = 'app_active_page';

const pagePerms = {
  inventory: 'inventory.view', orders: 'orders.view', projects: 'projects.view',
  clients: 'clients.view', devis: 'devis.view', movements: 'movements.view',
  analytics: 'analytics.view', admin: 'admin.view', ateliertables: 'ateliertables.view',
  chantiers: 'chantiers.view',
};
// Fallback order when the requested page is not allowed for the account
const PAGE_ORDER = ['inventory', 'orders', 'projects', 'chantiers', 'clients', 'devis', 'movements', 'analytics', 'ateliertables', 'admin'];

function getDefaultPage(role) {
  if (CHANTIER_DEFAULT_ROLES.has(role)) return 'chantiers';
  if (PROJECTS_DEFAULT_ROLES.has(role)) return 'projects';
  return 'inventory';
}

function AppInner() {
  const { user, loading, can } = useAuth();
  const { t } = useLanguage();
  const [activePage, setActivePage] = useState('inventory');
  const [pageInitialized, setPageInitialized] = useState(false);

  // Page comes from the URL (/commandes, /projets…); "/" falls back to the last page / role default.
  // Runs on load and again on each login (the last page saved on this device may be another user's → role default).
  const pageUserRef = useRef(undefined);
  useEffect(() => {
    if (loading) return;
    const uid = user?.id || null;
    if (pageUserRef.current === uid) return;
    const isLogin = pageUserRef.current === null;
    pageUserRef.current = uid;
    if (user) {
      const page = pageFromLocation() || (!isLogin && localStorage.getItem(LS_PAGE)) || getDefaultPage(user.role);
      setActivePage(page);
      localStorage.setItem(LS_PAGE, page);
      if (!pageFromLocation()) setUrl(PAGE_PATHS[page] || '/', { replace: true });
    }
    setPageInitialized(true);
  }, [loading, user]);

  const pageAllowed = (page) => (page === 'orders'
    ? can('orders.view') || ORDERS_RECEIVING_ROLES.has(user?.role)
    : (!pagePerms[page] || can(pagePerms[page])));

  // Page not allowed for this account (last page of another user on this device, old link…) → first allowed page
  useEffect(() => {
    if (!user || !pageInitialized || pageAllowed(activePage)) return;
    const target = [getDefaultPage(user.role), ...PAGE_ORDER].find(pageAllowed);
    if (!target) return;
    localStorage.setItem(LS_PAGE, target);
    setActivePage(target);
    setUrl(PAGE_PATHS[target] || '/', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, pageInitialized, activePage]);

  // Browser back / forward buttons
  useEffect(() => {
    const onPop = () => {
      const page = pageFromLocation();
      if (page) { setActivePage(page); localStorage.setItem(LS_PAGE, page); }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = (page) => {
    localStorage.setItem(LS_PAGE, page);
    setActivePage(page);
    if (PAGE_PATHS[page]) {
      setUrl(PAGE_PATHS[page]);
      // let the open page react (e.g. Commandes clicked while a BC detail is open → back to the list)
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#f0f0f0', flexDirection: 'column', gap: 12
      }}>
        <div style={{ width: 36, height: 36, border: '3px solid #e5e7eb', borderTopColor: '#1a1a1a', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ color: '#888', fontSize: '0.9rem' }}>{t('acCheckingSession')}</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLogin={(loggedInUser) => {
      // A link opened before logging in (e.g. /commandes/123) is kept; otherwise the role's default page
      const page = pageFromLocation() || getDefaultPage(loggedInUser?.role);
      localStorage.setItem(LS_PAGE, page);
      setActivePage(page);
      if (!pageFromLocation()) setUrl(PAGE_PATHS[page] || '/', { replace: true });
    }} />;
  }

  // ── Accès à "orders" : permission classique OU rôle de réception par catégorie ──
  const canAccessOrders = can('orders.view') || ORDERS_RECEIVING_ROLES.has(user?.role);

  const currentAllowed = pageAllowed(activePage);

  return (
    <CompanyProvider>
      <InventoryProvider>
        <ProjectProvider>
          <div className="app">
            <Header activePage={activePage} onNavigate={navigate} />
            <DocViewerHost />{/* in-app document viewer (BL, factures, documents des projets) */}
            {/* propane gas of the oven: ACHATS « commandé » when at 40 % or less, then the admin updates the % */}
            {(can('orders.edit') || can('admin.view')) && <GazLowBanner />}
            {canAccessOrders && (
              <BlsToReceiveBanner onOpenList={() => {
                setUrl(PAGE_PATHS.orders, { query: { onglet: 'reception' } });
                window.dispatchEvent(new PopStateEvent('popstate'));
              }} />
            )}
            <main className="app__main">
              {!currentAllowed ? (
                <div style={{ textAlign: 'center', padding: 80 }}>
                  <div style={{ width: 56, height: 56, margin: '0 auto 14px', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-3)' }}><Lock size={24} /></div>
                  <h2 style={{ color: 'var(--text)' }}>{t('acAccessDenied')}</h2>
                  <p style={{ color: 'var(--text-3)' }}>{t('acNoPermission')}</p>
                </div>
              ) : (
                <>
                  {activePage === 'inventory'     && can('inventory.view')      && <InventoryPage />}
                  {activePage === 'orders'        && canAccessOrders            && <OrdersPage />}
                  {activePage === 'projects'      && can('projects.view')       && <ProjectsPage />}
                  {activePage === 'clients'       && can('clients.view')        && <ClientsPage />}
                  {activePage === 'devis'         && can('devis.view')          && <DevisPage />}
                  {activePage === 'analytics'     && can('analytics.view')      && <AnalyticsPage />}
                  {activePage === 'movements'     && can('movements.view')      && <MovementsPage />}
                  {activePage === 'admin'         && can('admin.view')          && <AdminPage />}
                  {activePage === 'ateliertables' && can('ateliertables.view')  && <AtelierTablesPage />}
                  {activePage === 'chantiers'     && can('chantiers.view')      && <ChantierPage />}
                </>
              )}
            </main>
          </div>
        </ProjectProvider>
      </InventoryProvider>
    </CompanyProvider>
  );
}

function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
      {/* Custom alert / confirm / prompt dialogs and toasts (no browser pop-ups) */}
      <DialogHost />
    </LanguageProvider>
  );
}

export default App;