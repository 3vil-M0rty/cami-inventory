import { useState, useEffect } from 'react';
import { LanguageProvider } from './context/LanguageContext';
import { InventoryProvider } from './context/InventoryContext';
import { ProjectProvider } from './context/ProjectContext';
import { CompanyProvider } from './context/CompanyContext';
import { AuthProvider, useAuth } from './context/AuthContext';
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

const PROJECTS_DEFAULT_ROLES = new Set(['LOGISTIQUE', 'Coordinateur', 'BARREMAN']);
const CHANTIER_DEFAULT_ROLES = new Set(['chefChantier', 'BARREMAN']);
const LS_PAGE = 'app_active_page';

function getDefaultPage(role) {
  if (CHANTIER_DEFAULT_ROLES.has(role)) return 'chantiers';
  if (PROJECTS_DEFAULT_ROLES.has(role)) return 'projects';
  return 'inventory';
}

function AppInner() {
  const { user, loading, can } = useAuth();
  const [activePage, setActivePage] = useState('inventory');
  const [pageInitialized, setPageInitialized] = useState(false);

  useEffect(() => {
    if (!loading && !pageInitialized) {
      if (user) {
        const saved = localStorage.getItem(LS_PAGE);
        setActivePage(saved || getDefaultPage(user.role));
      }
      setPageInitialized(true);
    }
  }, [loading, user, pageInitialized]);

  const navigate = (page) => {
    localStorage.setItem(LS_PAGE, page);
    setActivePage(page);
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#f0f0f0', flexDirection: 'column', gap: 12
      }}>
        <div style={{ width: 36, height: 36, border: '3px solid #e5e7eb', borderTopColor: '#1a1a1a', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ color: '#888', fontSize: '0.9rem' }}>Vérification de la session...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLogin={(loggedInUser) => {
      const defaultPage = getDefaultPage(loggedInUser?.role);
      localStorage.setItem(LS_PAGE, defaultPage);
      setPageInitialized(false);
      setActivePage(defaultPage);
    }} />;
  }

  const pagePerms = {
    inventory: 'inventory.view', orders: 'orders.view', projects: 'projects.view',
    clients: 'clients.view', devis: 'devis.view', movements: 'movements.view',
    analytics: 'analytics.view', admin: 'admin.view', ateliertables: 'ateliertables.view',
    chantiers: 'chantiers.view',
  };
  const currentAllowed = !pagePerms[activePage] || can(pagePerms[activePage]);

  return (
    <CompanyProvider>
      <InventoryProvider>
        <ProjectProvider>
          <div className="app">
            <Header activePage={activePage} onNavigate={navigate} />
            <main className="app__main">
              {!currentAllowed ? (
                <div style={{ textAlign: 'center', padding: 80 }}>
                  <div style={{ fontSize: '3rem', marginBottom: 12 }}>🔒</div>
                  <h2 style={{ color: '#374151' }}>Accès refusé</h2>
                  <p style={{ color: '#888' }}>Vous n'avez pas la permission d'accéder à cette page.</p>
                </div>
              ) : (
                <>
                  {activePage === 'inventory'     && can('inventory.view')      && <InventoryPage />}
                  {activePage === 'orders'        && can('orders.view')         && <OrdersPage />}
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
    </LanguageProvider>
  );
}

export default App;