import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { ArrowUp, ArrowDown, Cog, Inbox, X } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import './MovementsPage.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

// Same display as before the Mouvements page redesign (workshop tables consumption)
function fmt(val) {
  if (val === null || val === undefined) return '0';
  const n = parseFloat(val);
  if (isNaN(n)) return '0';
  return parseFloat(n.toFixed(2)).toString();
}
function fmtDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleDateString('fr-FR') + ' ' + date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/** "Ateliers" tab: consumption of the workshop tables (unchanged) */
export default function WorkshopTab({ reloadKey = 0 }) {
  const { t } = useLanguage();
  const [tableMovements, setTableMovements] = useState([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableError, setTableError] = useState(null);
  const [tableSearch, setTableSearch] = useState('');
  const [tableTypeFilter, setTableTypeFilter] = useState('all');

  const loadTableMovements = useCallback(async () => {
    setTableLoading(true); setTableError(null);
    try {
      const res = await axios.get(`${API}/table-consumption`);
      setTableMovements(res.data || []);
    } catch (e) { setTableError(e.message); }
    finally { setTableLoading(false); }
  }, []);
  useEffect(() => { loadTableMovements(); }, [loadTableMovements, reloadKey]);

  const TABLE_TYPE_LABELS = {
    chassis_assignment: t('mvChassisAssign'),
    manual_in: t('mvManualIn'),
    manual_out: t('mvManualOut'),
  };
  const TABLE_TYPE_META = {
    chassis_assignment: { color: '#fbbf24', bg: 'rgba(251,191,36,.10)', icon: Cog },
    manual_in: { color: '#4ade80', bg: 'rgba(74,222,128,.10)', icon: ArrowUp },
    manual_out: { color: '#f87171', bg: 'rgba(248,113,113,.10)', icon: ArrowDown },
  };

  const filteredTableMovements = tableMovements.filter(m => {
    if (tableTypeFilter !== 'all' && m.type !== tableTypeFilter) return false;
    if (!tableSearch.trim()) return true;
    const q = tableSearch.toLowerCase();
    return (
      (m.label || '').toLowerCase().includes(q) ||
      (m.tableName || '').toLowerCase().includes(q) ||
      (m.projectName || '').toLowerCase().includes(q) ||
      (m.chassisRef || '').toLowerCase().includes(q)
    );
  });

  return (
        <div>
          {/* Summary chips for table movements */}
          <div className="mv-summary">
            {Object.entries(TABLE_TYPE_META).map(([type, meta]) => {
              const total = filteredTableMovements
                .filter(m => m.type === type)
                .reduce((s, m) => s + (m.quantity || 0), 0);
              return (
                <div key={type} className="mv-chip" style={{ '--mv-c': meta.color, '--mv-bg': meta.bg }}>
                  <span className="mv-chip__icon">{meta.icon && <meta.icon size={13} strokeWidth={2.4} />}</span>
                  <span className="mv-chip__label">{TABLE_TYPE_LABELS[type]}</span>
                  <span className="mv-chip__val">{fmt(total)}</span>
                </div>
              );
            })}
          </div>

          {/* Filters */}
          <div className="mv-filters">
            <input
              className="mv-search"
              type="text"
              placeholder={t('mvWsSearch')}
              value={tableSearch}
              onChange={e => setTableSearch(e.target.value)}
            />
            <select className="mv-select" value={tableTypeFilter} onChange={e => setTableTypeFilter(e.target.value)}>
              <option value="all">{t('mvAllTypes')}</option>
              {Object.entries(TABLE_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            {(tableSearch || tableTypeFilter !== 'all') && (
              <button className="mv-clear-btn" onClick={() => { setTableSearch(''); setTableTypeFilter('all'); }}>
                <X size={13} />{t('mvClear')}
              </button>
            )}
          </div>

          {/* Table */}
          {tableLoading ? (
            <div className="mv-state">{t('loadingShort')}</div>
          ) : tableError ? (
            <div className="mv-state mv-state--error">{t('errorWithMsg', { msg: tableError })}</div>
          ) : filteredTableMovements.length === 0 ? (
            <div className="mv-state"><span className="mv-state__icon"><Inbox size={20} strokeWidth={1.8} /></span>{t('mvNoWorkshop')}</div>
          ) : (
            <div className="mv-table-wrap">
              <table className="mv-table">
                <thead>
                  <tr>
                    <th>{t('mvColDate')}</th>
                    <th>{t('mvColType')}</th>
                    <th>{t('mvColTable')}</th>
                    <th>{t('mvColAccessory')}</th>
                    <th className="td-right">{t('mvColQty')}</th>
                    <th>{t('mvColUnit')}</th>
                    <th>{t('mvColProject')}</th>
                    <th>{t('mvColChassis')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTableMovements.map((m, i) => {
                    const meta = TABLE_TYPE_META[m.type] || { color: '#a1a1aa', bg: 'rgba(161,161,170,.10)', icon: null };
                    const isOut = m.type === 'chassis_assignment' || m.type === 'manual_out';
                    return (
                      <tr key={m._id || i}>
                        <td className="mv-col-date">{fmtDate(m.date || m.createdAt)}</td>
                        <td>
                          <span className="mv-type-badge" style={{ color: meta.color, background: meta.bg, borderColor: meta.color + '4d' }}>
                            {meta.icon && <meta.icon size={13} strokeWidth={2.4} />} {TABLE_TYPE_LABELS[m.type] || m.type}
                          </span>
                        </td>
                        <td><strong>{m.tableName || '—'}</strong></td>
                        <td className="mv-col-item">{m.label || '—'}</td>
                        <td className="td-right">
                          <span className="mv-qty" style={{ color: meta.color }}>
                            {isOut ? '−' : '+'}{fmt(m.quantity)}
                          </span>
                        </td>
                        <td>{m.unit || '—'}</td>
                        <td className="mv-col-project">{m.projectName || '—'}</td>
                        <td>{m.chassisRef ? <code className="mv-code">{m.chassisRef}</code> : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mv-count">{t('mvLines', { n: filteredTableMovements.length })}</div>
            </div>
          )}
        </div>
  );
}
