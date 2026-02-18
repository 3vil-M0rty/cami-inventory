import { useState } from 'react';
import { LanguageProvider } from './context/LanguageContext';
import { InventoryProvider } from './context/InventoryContext';
import { ProjectProvider } from './context/ProjectContext';
import Header from './components/layout/Header';
import InventoryPage from './features/inventory/InventoryPage';
import ProjectsPage from './features/projects/ProjectsPage';
import AnalyticsPage from './features/analytics/AnalyticsPage';
import MovementsPage from './features/movements/MovementsPage';
import './App.css';

function App() {
  const [activePage, setActivePage] = useState('inventory');
  // 'inventory' | 'projects' | 'analytics' | 'movements'

  return (
    <LanguageProvider>
      <InventoryProvider>
        <ProjectProvider>
          <div className="app">
            <Header activePage={activePage} onNavigate={setActivePage} />
            <main className="app__main">
              {activePage === 'inventory'  && <InventoryPage />}
              {activePage === 'projects'   && <ProjectsPage />}
              {activePage === 'analytics'  && <AnalyticsPage />}
              {activePage === 'movements'  && <MovementsPage />}
            </main>
          </div>
        </ProjectProvider>
      </InventoryProvider>
    </LanguageProvider>
  );
}

export default App;
