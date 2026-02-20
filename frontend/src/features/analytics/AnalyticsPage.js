import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';
import { useLanguage } from '../../context/LanguageContext';
import './AnalyticsPage.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const ETAT_COLORS = {
  non_entame: '#9ca3af',
  en_cours: '#f59e0b',
  fabrique: '#3b82f6',
  livre: '#16a34a',
};

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="an-tooltip">
      {label && <p className="an-tooltip__label">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.fill }}>
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
}

function KpiCard({ label, value, icon, accent, sub }) {
  return (
    <div className="an-kpi" style={{ '--accent': accent }}>
      <div className="an-kpi__icon">{icon}</div>
      <div className="an-kpi__value">{value ?? '—'}</div>
      <div className="an-kpi__label">{label}</div>
      {sub && <div className="an-kpi__sub">{sub}</div>}
    </div>
  );
}

function Section({ title, wide, children }) {
  return (
    <div className={`an-section${wide ? ' an-section--wide' : ''}`}>
      <h3 className="an-section__title">{title}</h3>
      <div className="an-section__body">{children}</div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { t, currentLanguage: lang } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState('monthly'); // 'monthly' | 'annual' | 'daily'
  const [chartData, setChartData] = useState(null);
  const [chartLoading, setChartLoading] = useState(false);

  // Full page load — only runs once on mount
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await axios.get(`${API}/analytics/dashboard?period=monthly`);
      setData(res.data);
      setChartData(res.data.monthlyMovements);
    }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  // Chart-only reload when period changes — no full page refresh
  const changePeriod = useCallback(async (p) => {
    if (p === period) return;
    setPeriod(p);
    setChartLoading(true);
    try {
      const res = await axios.get(`${API}/analytics/dashboard?period=${p}`);
      setChartData(res.data.monthlyMovements);
    } catch (e) { /* silently keep old data */ }
    finally { setChartLoading(false); }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="an-state">{t('loading')}</div>;
  if (error) return <div className="an-state an-state--error">Erreur: {error} <button onClick={load}>{t('refresh')}</button></div>;
  if (!data) return null;

  const { kpis, chassisStatusCounts, projectConsumption, topItems, stockByCategory } = data;
  const monthlyMovements = chartData || [];

  const pieData = Object.entries(chassisStatusCounts)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: t(`etat_${k}`) || k, value: v, color: ETAT_COLORS[k] }));

  const monthLabels = {
    entrees: t('mvEntrees'),
    sorties: t('mvSorties'),
    project_use: t('mvProjectUse'),
    project_return: t('mvProjectReturn'),
  };

  const monthlyData = monthlyMovements.map(m => {
    let label = m.period;
    if (period === 'monthly') label = m.period.slice(5); // show MM
    return {
      month: label,
      [monthLabels.entrees]: m.entrees,
      [monthLabels.sorties]: m.sorties,
      [monthLabels.project_use]: m.project_use,
      [monthLabels.project_return]: m.project_return,
    };
  });

  
  const barLabel = t('mvBarsUsed');
  const projData = projectConsumption.map(p => ({
    name: p.reference || p.projectName,
    fullName: p.projectName,
    [barLabel]: p.totalBars,
  }));

  const maxTop = topItems[0]?.total || 1;

  return (
    <div className="analytics-page">
      <div className="an-header">
        <h2 className="an-header__title">{t('navAnalytics')}</h2>
        <button className="an-refresh-btn" onClick={load}>↻ {t('refresh')}</button>
      </div>

      {/* KPIs */}
      <div className="an-kpi-grid">
        <KpiCard label={t('kpiProjects')} value={kpis.totalProjects} icon="📁" accent="#3b82f6" />
        <KpiCard label={t('kpiInProgress')} value={kpis.projectsInProgress} icon="⚙️" accent="#f59e0b" />
        <KpiCard label={t('kpiItems')} value={kpis.totalItems} icon="📦" accent="#6366f1" />
        <KpiCard label={t('kpiCritical')} value={kpis.criticalItems} icon="⚠️" accent="#ef4444"
          sub={kpis.criticalItems > 0 ? t('kpiCriticalSub') : '✓ OK'} />
        <KpiCard label={t('kpiDeliveries')} value={kpis.deliveriesThisMonth} icon="🚚" accent="#16a34a" />
        <KpiCard label={t('kpiMovements')} value={kpis.totalMovements} icon="↕️" accent="#8b5cf6" />
      </div>

      <div className="an-grid">

        {/* Chassis status donut */}
        <Section title={t('anStatusTitle')}>
          {pieData.length === 0
            ? <p className="an-empty">{t('noData')}</p>
            : <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" innerRadius={60} outerRadius={105} paddingAngle={2}>
                  {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          }
        </Section>

        {/* Stock health by category */}
        <Section title={t('anCatTitle')}>
          {stockByCategory.length === 0
            ? <p className="an-empty">{t('noData')}</p>
            : <div className="an-cat-list">
              {stockByCategory.map((cat, i) => {
                const okPct = Math.round(cat.ok / cat.total * 100);
                const lowPct = Math.round(cat.low / cat.total * 100);
                const critPct = Math.round(cat.critical / cat.total * 100);
                return (
                  <div key={i} className="an-cat-row">
                    <div className="an-cat-row__name">
                      <span className="an-cat-dot" style={{ background: cat.catColor }} />
                      {cat.catName[lang] || cat.catName.fr}
                    </div>
                    <div className="an-cat-row__right">
                      <div className="an-minibar">
                        <div className="an-minibar__ok" style={{ width: `${okPct}%` }} />
                        <div className="an-minibar__low" style={{ width: `${lowPct}%` }} />
                        <div className="an-minibar__crit" style={{ width: `${critPct}%` }} />
                      </div>
                      <div className="an-cat-badges">
                        {cat.critical > 0 && <span className="an-badge an-badge--crit">⚠ {cat.critical}</span>}
                        {cat.low > 0 && <span className="an-badge an-badge--low">~ {cat.low}</span>}
                        <span className="an-badge an-badge--ok">{cat.total}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          }
        </Section>

        {/* Movements line chart with period toggle */}
        <Section title={
          <div className="an-section-title-row">
            <span>{t('anMonthlyTitle')}</span>
            <div className="an-period-toggle">
              {['daily','monthly','annual'].map(p => (
                <button key={p} className={`an-period-btn${period === p ? ' an-period-btn--active' : ''}`}
                  onClick={() => changePeriod(p)}>
                  {p === 'daily' ? t('periodDaily') : p === 'monthly' ? t('periodMonthly') : t('periodAnnual')}
                </button>
              ))}
            </div>
          </div>
        }>
          {chartLoading
            ? <div className="an-chart-loading"><span className="an-chart-spinner" /></div>
            : monthlyData.every(m => Object.values(m).slice(1).every(v => v === 0))
            ? <p className="an-empty">{t('noData')}</p>
            : <ResponsiveContainer width="100%" height={260}>
              <LineChart data={monthlyData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ebebeb" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} interval={period === 'daily' ? 6 : 0} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={8} />
                <Line type="monotone" dataKey={monthLabels.entrees} stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey={monthLabels.sorties} stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey={monthLabels.project_use} stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 3" />
                <Line type="monotone" dataKey={monthLabels.project_return} stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="2 4" />
              </LineChart>
            </ResponsiveContainer>
          }
        </Section>

        {/* Top 5 items */}
        <Section title={t('anTopTitle')}>
          {topItems.length === 0
            ? <p className="an-empty">{t('noData')}</p>
            : <div className="an-top-list">
              {topItems.map((item, i) => (
                <div key={i} className="an-top-row">
                  <span className="an-top-rank">#{i + 1}</span>
                  <div className="an-top-info">
                    <span className="an-top-name">{item.designation?.[lang] || item.designation?.fr || '—'}</span>
                    <div className="an-top-bar-wrap">
                      <div className="an-top-bar" style={{ width: `${Math.round(item.total / maxTop * 100)}%` }} />
                    </div>
                  </div>
                  <span className="an-top-val">{item.total}</span>
                </div>
              ))}
            </div>
          }
        </Section>

      </div>

      {/* Project consumption — full width */}
      <Section title={t('anConsTitle')} wide>
        {projData.length === 0
          ? <p className="an-empty">{t('noData')}</p>
          : <ResponsiveContainer width="100%" height={320}>
            <BarChart data={projData} margin={{ top: 10, right: 20, left: 0, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ebebeb" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey={barLabel} fill="#1a1a1a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        }
      </Section>
    </div>
  );
}