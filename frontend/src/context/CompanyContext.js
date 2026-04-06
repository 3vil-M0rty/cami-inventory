import { createContext, useContext, useState, useEffect } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
const CompanyContext = createContext(null);

export const CompanyProvider = ({ children }) => {
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState(null); // null = all

  useEffect(() => {
    fetch(`${API_URL}/companies`)
      .then(r => r.json())
      .then(data => { setCompanies(data); })
      .catch(console.error);
  }, []);

  const updateCompany = async (id, data) => {
    const r = await fetch(`${API_URL}/companies/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const updated = await r.json();
    setCompanies(prev => prev.map(c => c.id === id ? updated : c));
    return updated;
  };

  return (
    <CompanyContext.Provider value={{ companies, selectedCompany, setSelectedCompany, updateCompany }}>
      {children}
    </CompanyContext.Provider>
  );
};

export const useCompany = () => {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error('useCompany must be used within CompanyProvider');
  return ctx;
};
