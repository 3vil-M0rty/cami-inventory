import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, RadialBarChart, RadialBar,
} from 'recharts';
import { useLanguage } from '../../context/LanguageContext';
import { FolderOpen, Cog, Package, AlertTriangle, Truck, ArrowUpDown, RotateCw } from 'lucide-react';
import './AnalyticsLayout.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const ETAT_COLORS = {
  non_entame:    '#71717a',
  en_cours:      '#fbbf24',
  non_vitre:     '#c084fc',
  fabrique:      '#60a5fa',
  pret_a_livrer: '#fb923c',
  livre:         '#4ade80',
};

const ETAT_ORDER = ['non_entame','en_cours','non_vitre','fabrique','pret_a_livrer','livre'];

// ── Palette for categories ────────────────────────────────────────────────────
const CAT_PALETTE = ['#60a5fa','#fbbf24','#c084fc','#4ade80','#fb923c','#f472b6','#2dd4bf','#f87171'];

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n) {
  if (n === null || n === undefined) return '—';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

function pct(a, b) { return b === 0 ? 0 : Math.round(a / b * 100); }

// ── Custom Tooltip ────────────────────────────────────────────────────────────
function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--surface-3)', border: '1px solid var(--border-2)', borderRadius: 10,
      padding: '10px 14px', fontSize: 12, color: 'var(--text)',
      boxShadow: 'var(--sh-lg)',
    }}>
      {label && <p style={{ color: 'var(--text-3)', fontWeight: 700, marginBottom: 6, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.fill, margin: '2px 0', fontWeight: 600 }}>
          {p.name}: <span style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{p.value}</span>
        </p>
      ))}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, icon, color, delta, sub, index }) {
  return (
    <div className="an-kpi-card" style={{ '--an-c': color, animationDelay: `${index * 60}ms` }}>
      <div className="an-kpi-card__head">
        <div className="an-kpi-card__label">{label}</div>
        <span className="an-kpi-card__icon">{icon}</span>
      </div>
      <div className="an-kpi-card__value">{fmt(value)}</div>
      {sub && <div className="an-kpi-card__sub">{sub}</div>}
      {delta !== undefined && (
        <div style={{ fontSize: 11, color: delta >= 0 ? '#4ade80' : '#f87171', marginTop: 4, fontWeight: 600 }}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%
        </div>
      )}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Panel({ title, children, action, span2, style = {} }) {
  return (
    <div className="an-panel" style={{ gridColumn: span2 ? 'span 2' : undefined, ...style }}>
      <div className="an-panel__head">
        <div className="an-panel__title">{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ── Gauge ring ────────────────────────────────────────────────────────────────
function GaugeRing({ value, max, color, label, sub }) {
  const r = 38, circ = 2 * Math.PI * r;
  const filled = max > 0 ? (value / max) * circ : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width={96} height={96} viewBox="0 0 96 96">
        <circle cx={48} cy={48} r={r} fill="none" stroke="#26262b" strokeWidth={8} />
        <circle cx={48} cy={48} r={r} fill="none" stroke={color} strokeWidth={8}
          strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 48 48)" style={{ transition: 'stroke-dasharray .8s ease' }} />
        <text x={48} y={45} textAnchor="middle" fontSize={18} fontWeight={800} fill="#f4f4f5">{value}</text>
        <text x={48} y={62} textAnchor="middle" fontSize={10} fill="#8b8b94">{max > 0 ? pct(value, max) + '%' : '—'}</text>
      </svg>
      <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{sub}</div>}
    </div>
  );
}

// ── Sparkline bar ─────────────────────────────────────────────────────────────
function MiniBar({ value, max, color }) {
  const w = max > 0 ? pct(value, max) : 0;
  return (
    <div style={{ height: 6, background: 'var(--200)', borderRadius: 999, overflow: 'hidden', flex: 1 }}>
      <div style={{ height: '100%', width: `${w}%`, background: color, borderRadius: 999, transition: 'width .6s ease' }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function AnalyticsPage() {
  const { t, currentLanguage: lang } = useLanguage();
  const [data, setData]             = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [period, setPeriod]         = useState('monthly');
  const [chartData, setChartData]   = useState(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all'); // aluminium | accessoires | all

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await axios.get(`${API}/analytics/dashboard?period=monthly`);
      setData(res.data);
      setChartData(res.data.monthlyMovements);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  const changePeriod = useCallback(async (p) => {
    if (p === period) return;
    setPeriod(p);
    setChartLoading(true);
    try {
      const res = await axios.get(`${API}/analytics/dashboard?period=${p}`);
      setChartData(res.data.monthlyMovements);
    } catch {}
    finally { setChartLoading(false); }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div style={{ height: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 40, height: 40, border: '3px solid var(--200)', borderTopColor: 'var(--900)', borderRadius: '50%', animation: 'spin .7s linear infinite', margin: '0 auto 12px' }} />
        <div style={{ color: 'var(--text-3)', fontSize: 13 }}>{t('loading')}</div>
      </div>
    </div>
  );

  if (error) return (
    <div className="an-error">
      <span>{error}</span> <button className="btn btn--secondary btn--sm" onClick={load}><RotateCw size={13} />{t('refresh')}</button>
    </div>
  );

  if (!data) return null;

  const { kpis, chassisStatusCounts, projectConsumption, topItems, stockByCategory } = data;
  const monthlyMovements = chartData || [];

  // ── Derived stats ─────────────────────────────────────────────────────────
  const totalChassis = Object.values(chassisStatusCounts).reduce((a, b) => a + b, 0);
  const livreCount   = chassisStatusCounts.livre || 0;
  const pretCount    = (chassisStatusCounts.pret_a_livrer || 0);
  const fabricCount  = chassisStatusCounts.fabrique || 0;
  const progressRate = totalChassis > 0 ? pct(livreCount + fabricCount + pretCount, totalChassis) : 0;

  // Pie data
  const pieData = ETAT_ORDER
    .filter(k => (chassisStatusCounts[k] || 0) > 0)
    .map(k => ({ name: t(`etat_${k}`) || k, value: chassisStatusCounts[k], color: ETAT_COLORS[k] }));

  // Movement chart
  const periodLabels = { daily: t('periodDaily'), monthly: t('periodMonthly'), annual: t('periodAnnual') };
  const L = { e: t('mvEntrees'), s: t('mvSorties'), u: t('mvProjectUse'), r: t('mvProjectReturn') };
  const movData = monthlyMovements.map(m => ({
    p: period === 'monthly' ? m.period.slice(5) : m.period,
    [L.e]: m.entrees, [L.s]: m.sorties, [L.u]: m.project_use, [L.r]: m.project_return,
  }));

  // Filtered topItems
  const filteredTop = activeFilter === 'all'
    ? topItems
    : topItems.filter(i => (i.superCategory || '').includes(activeFilter));
  const maxTop = filteredTop[0]?.total || 1;

  // Stock health
  const totalItems = stockByCategory.reduce((a, c) => a + c.total, 0);
  const totalCrit  = stockByCategory.reduce((a, c) => a + c.critical, 0);
  const totalOk    = stockByCategory.reduce((a, c) => a + c.ok, 0);

  // Project consumption sorted
  const projSorted = [...projectConsumption].sort((a, b) => b.totalBars - a.totalBars).slice(0, 8);
  const maxBars    = projSorted[0]?.totalBars || 1;

  return (
    <div className="an-page">
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
        @keyframes spin { to { transform:rotate(360deg) } }
      `}</style>

      {/* ── Header ── */}
      <div className="an-page-header">
        <div>
          <h1 className="an-page-header__title">{t('navAnalytics')}</h1>
          <div className="an-page-header__sub">
            {new Date().toLocaleDateString(lang === 'fr' ? 'fr-FR' : lang === 'it' ? 'it-IT' : 'en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>
        <button className="btn btn--secondary" onClick={load}><RotateCw size={14} />{t('refresh')}</button>
      </div>

      {/* ── KPI Row ── */}
      <div className="an-row an-row--kpi">
        <KpiCard index={0} label={t('kpiProjects')} value={kpis.totalProjects} icon={<FolderOpen size={16} />} color="#60a5fa" />
        <KpiCard index={1} label={t('kpiInProgress')} value={kpis.projectsInProgress} icon={<Cog size={16} />} color="#fbbf24" />
        <KpiCard index={2} label={t('kpiItems')} value={kpis.totalItems} icon={<Package size={16} />} color="#a5b4fc" />
        <KpiCard index={3} label={t('kpiCritical')} value={kpis.criticalItems} icon={<AlertTriangle size={16} />} color="#f87171"
          sub={kpis.criticalItems > 0 ? `${pct(kpis.criticalItems, kpis.totalItems)}% ${t('kpiCriticalSub')}` : t('anKpiOk')} />
        <KpiCard index={4} label={t('kpiDeliveries')} value={kpis.deliveriesThisMonth} icon={<Truck size={16} />} color="#4ade80" />
        <KpiCard index={5} label={t('kpiMovements')} value={kpis.totalMovements} icon={<ArrowUpDown size={16} />} color="#c084fc" />
      </div>

      {/* ── Progress strip ── */}
      <div className="an-panel an-strip">
        <div className="an-panel__title">{t('anStatusTitle')}</div>
        <div className="an-strip__bar">
          {ETAT_ORDER.filter(k => (chassisStatusCounts[k] || 0) > 0).map(k => (
            <div key={k} style={{
              height: '100%',
              width: `${pct(chassisStatusCounts[k] || 0, totalChassis)}%`,
              background: ETAT_COLORS[k],
              transition: 'width .6s ease',
            }} title={`${t('etat_' + k)}: ${chassisStatusCounts[k]}`} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {ETAT_ORDER.filter(k => (chassisStatusCounts[k] || 0) > 0).map(k => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: ETAT_COLORS[k] }} />
              <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{chassisStatusCounts[k]}</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{t(`etat_${k}`)}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', flexShrink: 0 }}>
          <span style={{ color: '#4ade80', fontWeight: 800 }}>{progressRate}%</span> {t('anProgressRate')}
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className="an-row an-row--3">

        {/* Chassis gauges */}
        <Panel title={t('anChassisGauges')}>
          <div style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: 12 }}>
            <GaugeRing value={chassisStatusCounts.livre || 0} max={totalChassis} color={ETAT_COLORS.livre} label={t('etat_livre')} />
            <GaugeRing value={(chassisStatusCounts.pret_a_livrer || 0)} max={totalChassis} color={ETAT_COLORS.pret_a_livrer} label={t('etat_pret_a_livrer')} />
            <GaugeRing value={chassisStatusCounts.fabrique || 0} max={totalChassis} color={ETAT_COLORS.fabrique} label={t('etat_fabrique')} />
          </div>
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ETAT_ORDER.map(k => {
              const v = chassisStatusCounts[k] || 0;
              if (!v) return null;
              return (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: ETAT_COLORS[k], flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--text-2)', flex: 1 }}>{t(`etat_${k}`)}</span>
                  <MiniBar value={v} max={totalChassis} color={ETAT_COLORS[k]} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', width: 28, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                </div>
              );
            })}
          </div>
        </Panel>

        {/* Stock health */}
        <Panel title={t('anCatTitle')}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            {[
              { label: t('anStockOk'), value: totalOk, color: '#4ade80' },
              { label: t('anStockCrit'), value: totalCrit, color: '#f87171' },
            ].map(s => (
              <div key={s.label} style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {stockByCategory.slice(0, 6).map((cat, i) => (
              <div key={i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: CAT_PALETTE[i % CAT_PALETTE.length] }} />
                    <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>
                      {typeof cat.catName === 'object' ? (cat.catName[lang] || cat.catName.fr) : cat.catName}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {cat.critical > 0 && <span style={{ fontSize: 11, color: '#f87171', fontWeight: 700 }}>⚠ {cat.critical}</span>}
                    <span style={{ fontSize: 11, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>{cat.total}</span>
                  </div>
                </div>
                <div style={{ height: 6, background: 'var(--200)', borderRadius: 999, overflow: 'hidden', display: 'flex' }}>
                  <div style={{ height: '100%', width: `${pct(cat.ok, cat.total)}%`, background: '#4ade80' }} />
                  <div style={{ height: '100%', width: `${pct(cat.low, cat.total)}%`, background: '#fbbf24' }} />
                  <div style={{ height: '100%', width: `${pct(cat.critical, cat.total)}%`, background: '#f87171' }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* Pie donut */}
        <Panel title={t('anDistTitle')}>
          {pieData.length === 0
            ? <p className="an-nodata">{t('noData')}</p>
            : <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name"
                    cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={3}>
                    {pieData.map((e, i) => <Cell key={i} fill={e.color} stroke="transparent" />)}
                  </Pie>
                  <Tooltip content={<DarkTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                {pieData.map((e, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: e.color }} />
                    <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{e.name}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: e.color }}>{e.value}</span>
                  </div>
                ))}
              </div>
            </>
          }
        </Panel>
      </div>

      {/* ── Movements chart (full width) ── */}
      <div className="an-panel" style={{ marginBottom: 14 }}>
        <div className="an-panel__head">
          <div className="an-panel__title">{t('anMonthlyTitle')}</div>
          <div className="an-seg">
            {['daily', 'monthly', 'annual'].map(p => (
              <button key={p}
                className={`an-pill an-period-pill${period === p ? ' active' : ''}`}
                onClick={() => changePeriod(p)}
              >{periodLabels[p]}</button>
            ))}
          </div>
        </div>
        {chartLoading
          ? <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 28, height: 28, border: '2.5px solid var(--200)', borderTopColor: 'var(--900)', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
            </div>
          : <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={movData} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
                <defs>
                  {[
                    ['e', '#4ade80'], ['s', '#f87171'], ['u', '#60a5fa'], ['r', '#fbbf24']
                  ].map(([key, color]) => (
                    <linearGradient key={key} id={`an-grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="10%" stopColor={color} stopOpacity={0.25} />
                      <stop offset="90%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#26262b" vertical={false} />
                <XAxis dataKey="p" tick={{ fontSize: 11, fill: '#8b8b94' }} axisLine={false} tickLine={false}
                  interval={period === 'daily' ? 6 : 0} />
                <YAxis tick={{ fontSize: 11, fill: '#8b8b94' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<DarkTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#b4b4bd' }} />
                <Area type="monotone" dataKey={L.e} stroke="#4ade80" fill="url(#an-grad-e)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey={L.s} stroke="#f87171" fill="url(#an-grad-s)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey={L.u} stroke="#60a5fa" fill="url(#an-grad-u)" strokeWidth={2} dot={false} strokeDasharray="5 3" />
                <Area type="monotone" dataKey={L.r} stroke="#fbbf24" fill="url(#an-grad-r)" strokeWidth={2} dot={false} strokeDasharray="2 4" />
              </AreaChart>
            </ResponsiveContainer>
        }
      </div>

      {/* ── Bottom row: top items + project consumption ── */}
      <div className="an-row an-row--1-2">

        {/* Top consumed items */}
        <Panel title={t('anTopTitle')} action={
          <div className="an-seg">
            {['all', 'aluminium', 'accessoires'].map(f => (
              <button key={f}
                className={`an-pill${activeFilter === f ? ' active' : ''}`}
                onClick={() => setActiveFilter(f)}
              >{f === 'all' ? t('anFilterAll') : t(`anFilter_${f}`)}</button>
            ))}
          </div>
        }>
          {filteredTop.length === 0
            ? <p className="an-nodata">{t('noData')}</p>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filteredTop.slice(0, 6).map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 6, background: CAT_PALETTE[i % CAT_PALETTE.length] + '22',
                    border: `1px solid ${CAT_PALETTE[i % CAT_PALETTE.length]}44`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 800, color: CAT_PALETTE[i % CAT_PALETTE.length], flexShrink: 0,
                  }}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 4 }}>
                      {item.designation?.[lang] || item.designation?.fr || '—'}
                    </div>
                    <MiniBar value={item.total} max={maxTop} color={CAT_PALETTE[i % CAT_PALETTE.length]} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: CAT_PALETTE[i % CAT_PALETTE.length], flexShrink: 0, width: 36, textAlign: 'right' }}>
                    {item.total}
                  </div>
                </div>
              ))}
            </div>
          }
        </Panel>

        {/* Project aluminium consumption */}
        <Panel title={t('anConsTitle')}>
          {projSorted.length === 0
            ? <p className="an-nodata">{t('noData')}</p>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {projSorted.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ minWidth: 28, fontSize: 11, color: 'var(--text-3)', fontWeight: 600, fontFamily: 'var(--mono)', textAlign: 'right', flexShrink: 0 }}>
                    {p.reference || `P${i + 1}`}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.projectName}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>{p.barCount} {t('anBarsLabel')}</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--200)', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${pct(p.totalBars, maxBars)}%`,
                        background: `linear-gradient(90deg, #60a5fa, #818cf8)`,
                        borderRadius: 999,
                        transition: 'width .6s ease',
                      }} />
                    </div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', width: 36, textAlign: 'right', flexShrink: 0 }}>
                    {p.totalBars}
                  </div>
                </div>
              ))}
            </div>
          }
        </Panel>
      </div>
    </div>
  );
}