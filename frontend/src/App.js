import { useState } from 'react';
import { LanguageProvider } from './context/LanguageContext';
import { InventoryProvider } from './context/InventoryContext';
import { ProjectProvider } from './context/ProjectContext';
import Header from './components/layout/Header';
import InventoryPage from './features/inventory/InventoryPage';
import ProjectsPage from './features/projects/ProjectsPage';
import './App.css';

/**
 * App Component
 *
 * Root application component.
 * Adds navigation between Inventaire and Projets pages.
 * All existing structure preserved.
 */

function App() {
  const [activePage, setActivePage] = useState('inventory'); // 'inventory' | 'projects'

  return (
    <LanguageProvider>
      <InventoryProvider>
        <ProjectProvider>
          <div className="app">
            <Header activePage={activePage} onNavigate={setActivePage} />
            <main className="app__main">
              {activePage === 'inventory' && <InventoryPage />}
              {activePage === 'projects'  && <ProjectsPage />}
            </main>
          </div>
        </ProjectProvider>
      </InventoryProvider>
    </LanguageProvider>
  );
}

export default App;
