import { LanguageProvider } from './context/LanguageContext';
import { InventoryProvider } from './context/InventoryContext';
import Header from './components/layout/Header';
import InventoryPage from './features/inventory/InventoryPage';
import './App.css';

/**
 * App Component
 * 
 * Root application component
 * Sets up context providers and main layout
 */

function App() {
  return (
    <LanguageProvider>
      <InventoryProvider>
        <div className="app">
          <Header />
          <main className="app__main">
            <InventoryPage />
          </main>
        </div>
      </InventoryProvider>
    </LanguageProvider>
  );
}

export default App;
