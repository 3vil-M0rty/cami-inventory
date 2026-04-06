import { useState } from 'react';
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
import './App.css';

function AppInner() {
  const { user, loading, can } = useAuth();
  const [activePage, setActivePage] = useState('inventory');

  // While verifying saved token
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

  // Not authenticated — show login
  if (!user) {
    return <LoginPage />;
  }

  const pagePerms = {
    inventory: 'inventory.view', orders: 'orders.view', projects: 'projects.view',
    clients: 'clients.view', devis: 'devis.view', movements: 'movements.view',
    analytics: 'analytics.view', admin: 'admin.view',
  };
  const currentAllowed = !pagePerms[activePage] || can(pagePerms[activePage]);

  return (
    <CompanyProvider>
      <InventoryProvider>
        <ProjectProvider>
          <div className="app">
            <Header activePage={activePage} onNavigate={setActivePage} />
            <main className="app__main">
              {!currentAllowed ? (
                <div style={{ textAlign: 'center', padding: 80 }}>
                  <div style={{ fontSize: '3rem', marginBottom: 12 }}>🔒</div>
                  <h2 style={{ color: '#374151' }}>Accès refusé</h2>
                  <p style={{ color: '#888' }}>Vous n'avez pas la permission d'accéder à cette page.</p>
                </div>
              ) : (
                <>
                  {activePage === 'inventory'  && can('inventory.view')  && <InventoryPage />}
                  {activePage === 'orders'     && can('orders.view')     && <OrdersPage />}
                  {activePage === 'projects'   && can('projects.view')   && <ProjectsPage />}
                  {activePage === 'clients'    && can('clients.view')    && <ClientsPage />}
                  {activePage === 'devis'      && can('devis.view')      && <DevisPage />}
                  {activePage === 'analytics'  && can('analytics.view')  && <AnalyticsPage />}
                  {activePage === 'movements'  && can('movements.view')  && <MovementsPage />}
                  {activePage === 'admin'      && can('admin.view')      && <AdminPage />}
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