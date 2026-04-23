import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, RadialBarChart, RadialBar,
} from 'recharts';
import { useLanguage } from '../../context/LanguageContext';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const ETAT_COLORS = {
  non_entame:    '#4b5563',
  en_cours:      '#f59e0b',
  non_vitre:     '#a855f7',
  fabrique:      '#3b82f6',
  pret_a_livrer: '#f97316',
  livre:         '#22c55e',
};

const ETAT_ORDER = ['non_entame','en_cours','non_vitre','fabrique','pret_a_livrer','livre'];

// ── Palette for categories ────────────────────────────────────────────────────
const CAT_PALETTE = ['#3b82f6','#f59e0b','#a855f7','#22c55e','#f97316','#ec4899','#14b8a6','#ef4444'];

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
      background: '#0f0f0f', border: '1px solid #2a2a2a', borderRadius: 10,
      padding: '10px 14px', fontSize: 12, color: '#e5e7eb',
      boxShadow: '0 8px 32px rgba(0,0,0,.8)',
    }}>
      {label && <p style={{ color: '#6b7280', fontWeight: 700, marginBottom: 6, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.fill, margin: '2px 0', fontWeight: 600 }}>
          {p.name}: <span style={{ color: '#fff' }}>{p.value}</span>
        </p>
      ))}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, icon, color, delta, sub, index }) {
  return (
    <div style={{
      background: '#111', border: '1px solid #1f1f1f',
      borderRadius: 16, padding: '20px 22px',
      borderTop: `3px solid ${color}`,
      position: 'relative', overflow: 'hidden',
      animation: `fadeUp .4s ease both`,
      animationDelay: `${index * 60}ms`,
    }}>
      <div style={{
        position: 'absolute', top: 16, right: 16,
        fontSize: 22, opacity: .18, filter: 'grayscale(1)',
      }}>{icon}</div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: '#4b5563', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 900, color, letterSpacing: '-1px', lineHeight: 1 }}>{fmt(value)}</div>
      {sub && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>{sub}</div>}
      {delta !== undefined && (
        <div style={{ fontSize: 11, color: delta >= 0 ? '#22c55e' : '#ef4444', marginTop: 4, fontWeight: 600 }}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%
        </div>
      )}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Panel({ title, children, action, span2, style = {} }) {
  return (
    <div style={{
      background: '#111', border: '1px solid #1f1f1f', borderRadius: 16,
      padding: '20px 22px', gridColumn: span2 ? 'span 2' : undefined, ...style,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: '#4b5563' }}>{title}</div>
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
        <circle cx={48} cy={48} r={r} fill="none" stroke="#1f1f1f" strokeWidth={8} />
        <circle cx={48} cy={48} r={r} fill="none" stroke={color} strokeWidth={8}
          strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 48 48)" style={{ transition: 'stroke-dasharray .8s ease' }} />
        <text x={48} y={45} textAnchor="middle" fontSize={18} fontWeight={900} fill="#fff">{value}</text>
        <text x={48} y={62} textAnchor="middle" fontSize={10} fill="#6b7280">{max > 0 ? pct(value, max) + '%' : '—'}</text>
      </svg>
      <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: '#4b5563' }}>{sub}</div>}
    </div>
  );
}

// ── Sparkline bar ─────────────────────────────────────────────────────────────
function MiniBar({ value, max, color }) {
  const w = max > 0 ? pct(value, max) : 0;
  return (
    <div style={{ height: 4, background: '#1f1f1f', borderRadius: 2, overflow: 'hidden', flex: 1 }}>
      <div style={{ height: '100%', width: `${w}%`, background: color, borderRadius: 2, transition: 'width .6s ease' }} />
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
        <div style={{ width: 40, height: 40, border: '3px solid #1f1f1f', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin .7s linear infinite', margin: '0 auto 12px' }} />
        <div style={{ color: '#4b5563', fontSize: 13 }}>{t('loading')}</div>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>
      {error} <button onClick={load} style={{ marginLeft: 12, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>{t('refresh')}</button>
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
    <div style={{ padding: '24px 28px', maxWidth: 1440, margin: '0 auto' }}>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
        @keyframes spin { to { transform:rotate(360deg) } }
        .an-pill { padding:4px 12px;border-radius:20px;border:1px solid #2a2a2a;background:#0f0f0f;color:#6b7280;font-size:11px;font-weight:600;cursor:pointer;transition:all .15s;letter-spacing:.04em;font-family:inherit; }
        .an-pill:hover { border-color:#3b3b3b;color:#e5e7eb; }
        .an-pill.active { background:#3b82f6;border-color:#3b82f6;color:#fff; }
        .an-period-pill.active { background:#1f1f1f;border-color:#3b3b3b;color:#e5e7eb; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px' }}>{t('navAnalytics')}</div>
          <div style={{ fontSize: 12, color: '#4b5563', marginTop: 4 }}>
            {new Date().toLocaleDateString(lang === 'fr' ? 'fr-FR' : lang === 'it' ? 'it-IT' : 'en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>
        <button onClick={load} style={{
          padding: '8px 16px', background: '#1a1a1a', border: '1px solid #2a2a2a',
          borderRadius: 10, color: '#9ca3af', fontSize: 12, fontWeight: 600,
          cursor: 'pointer', transition: 'all .15s', fontFamily: 'inherit',
        }}
          onMouseEnter={e => e.target.style.borderColor = '#3b82f6'}
          onMouseLeave={e => e.target.style.borderColor = '#2a2a2a'}
        >↻ {t('refresh')}</button>
      </div>

      {/* ── KPI Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 20 }}>
        <KpiCard index={0} label={t('kpiProjects')} value={kpis.totalProjects} icon="📁" color="#3b82f6" />
        <KpiCard index={1} label={t('kpiInProgress')} value={kpis.projectsInProgress} icon="⚙️" color="#f59e0b" />
        <KpiCard index={2} label={t('kpiItems')} value={kpis.totalItems} icon="📦" color="#6366f1" />
        <KpiCard index={3} label={t('kpiCritical')} value={kpis.criticalItems} icon="⚠️" color="#ef4444"
          sub={kpis.criticalItems > 0 ? `${pct(kpis.criticalItems, kpis.totalItems)}% ${t('kpiCriticalSub')}` : '✓ OK'} />
        <KpiCard index={4} label={t('kpiDeliveries')} value={kpis.deliveriesThisMonth} icon="🚚" color="#22c55e" />
        <KpiCard index={5} label={t('kpiMovements')} value={kpis.totalMovements} icon="↕️" color="#a855f7" />
      </div>

      {/* ── Progress strip ── */}
      <div style={{ background: '#111', border: '1px solid #1f1f1f', borderRadius: 14, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '.08em', flexShrink: 0 }}>{t('anStatusTitle')}</div>
        <div style={{ flex: 1, minWidth: 200, height: 8, background: '#1a1a1a', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
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
              <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>{chassisStatusCounts[k]}</span>
              <span style={{ fontSize: 10, color: '#4b5563' }}>{t(`etat_${k}`)}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#6b7280', flexShrink: 0 }}>
          <span style={{ color: '#22c55e', fontWeight: 700 }}>{progressRate}%</span> {t('anProgressRate') || 'avancement'}
        </div>
      </div>

      {/* ── Main grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>

        {/* Chassis gauges */}
        <Panel title={t('anChassisGauges') || 'État des châssis'}>
          <div style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: 12 }}>
            <GaugeRing value={chassisStatusCounts.livre || 0} max={totalChassis} color="#22c55e" label={t('etat_livre')} />
            <GaugeRing value={(chassisStatusCounts.pret_a_livrer || 0)} max={totalChassis} color="#f97316" label={t('etat_pret_a_livrer') || 'Prêt'} />
            <GaugeRing value={chassisStatusCounts.fabrique || 0} max={totalChassis} color="#3b82f6" label={t('etat_fabrique')} />
          </div>
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ETAT_ORDER.map(k => {
              const v = chassisStatusCounts[k] || 0;
              if (!v) return null;
              return (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: ETAT_COLORS[k], flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#9ca3af', flex: 1 }}>{t(`etat_${k}`)}</span>
                  <MiniBar value={v} max={totalChassis} color={ETAT_COLORS[k]} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#e5e7eb', width: 28, textAlign: 'right' }}>{v}</span>
                </div>
              );
            })}
          </div>
        </Panel>

        {/* Stock health */}
        <Panel title={t('anCatTitle')}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            {[
              { label: t('anStockOk') || 'OK', value: totalOk, color: '#22c55e' },
              { label: t('anStockCrit') || 'Critique', value: totalCrit, color: '#ef4444' },
            ].map(s => (
              <div key={s.label} style={{ flex: 1, background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 10, color: '#4b5563', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {stockByCategory.slice(0, 6).map((cat, i) => (
              <div key={i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: CAT_PALETTE[i % CAT_PALETTE.length] }} />
                    <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>
                      {typeof cat.catName === 'object' ? (cat.catName[lang] || cat.catName.fr) : cat.catName}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {cat.critical > 0 && <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 700 }}>⚠ {cat.critical}</span>}
                    <span style={{ fontSize: 10, color: '#4b5563' }}>{cat.total}</span>
                  </div>
                </div>
                <div style={{ height: 4, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden', display: 'flex' }}>
                  <div style={{ height: '100%', width: `${pct(cat.ok, cat.total)}%`, background: '#22c55e' }} />
                  <div style={{ height: '100%', width: `${pct(cat.low, cat.total)}%`, background: '#f59e0b' }} />
                  <div style={{ height: '100%', width: `${pct(cat.critical, cat.total)}%`, background: '#ef4444' }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* Pie donut */}
        <Panel title={t('anDistTitle') || 'Distribution statuts'}>
          {pieData.length === 0
            ? <p style={{ color: '#4b5563', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>{t('noData')}</p>
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
                    <span style={{ fontSize: 11, color: '#6b7280' }}>{e.name}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: e.color }}>{e.value}</span>
                  </div>
                ))}
              </div>
            </>
          }
        </Panel>
      </div>

      {/* ── Movements chart (full width) ── */}
      <div style={{ background: '#111', border: '1px solid #1f1f1f', borderRadius: 16, padding: '20px 22px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: '#4b5563' }}>{t('anMonthlyTitle')}</div>
          <div style={{ display: 'flex', gap: 6 }}>
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
              <div style={{ width: 28, height: 28, border: '2.5px solid #1f1f1f', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
            </div>
          : <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={movData} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
                <defs>
                  {[
                    [L.e, '#22c55e'], [L.s, '#ef4444'], [L.u, '#3b82f6'], [L.r, '#f59e0b']
                  ].map(([key, color]) => (
                    <linearGradient key={key} id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="10%" stopColor={color} stopOpacity={0.25} />
                      <stop offset="90%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                <XAxis dataKey="p" tick={{ fontSize: 11, fill: '#4b5563' }} axisLine={false} tickLine={false}
                  interval={period === 'daily' ? 6 : 0} />
                <YAxis tick={{ fontSize: 11, fill: '#4b5563' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<DarkTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#6b7280' }} />
                <Area type="monotone" dataKey={L.e} stroke="#22c55e" fill={`url(#grad-${L.e})`} strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey={L.s} stroke="#ef4444" fill={`url(#grad-${L.s})`} strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey={L.u} stroke="#3b82f6" fill={`url(#grad-${L.u})`} strokeWidth={2} dot={false} strokeDasharray="5 3" />
                <Area type="monotone" dataKey={L.r} stroke="#f59e0b" fill={`url(#grad-${L.r})`} strokeWidth={2} dot={false} strokeDasharray="2 4" />
              </AreaChart>
            </ResponsiveContainer>
        }
      </div>

      {/* ── Bottom row: top items + project consumption ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14 }}>

        {/* Top consumed items */}
        <Panel title={t('anTopTitle')} action={
          <div style={{ display: 'flex', gap: 5 }}>
            {['all', 'aluminium', 'accessoires'].map(f => (
              <button key={f}
                className={`an-pill${activeFilter === f ? ' active' : ''}`}
                onClick={() => setActiveFilter(f)}
              >{f === 'all' ? t('allCompanies')?.replace('sociétés', '') || 'Tout' : f}</button>
            ))}
          </div>
        }>
          {filteredTop.length === 0
            ? <p style={{ color: '#4b5563', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>{t('noData')}</p>
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
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#e5e7eb', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 4 }}>
                      {item.designation?.[lang] || item.designation?.fr || '—'}
                    </div>
                    <MiniBar value={item.total} max={maxTop} color={CAT_PALETTE[i % CAT_PALETTE.length]} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: CAT_PALETTE[i % CAT_PALETTE.length], flexShrink: 0, width: 36, textAlign: 'right' }}>
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
            ? <p style={{ color: '#4b5563', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>{t('noData')}</p>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {projSorted.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 28, fontSize: 10, color: '#4b5563', fontWeight: 700, textAlign: 'right', flexShrink: 0 }}>
                    {p.reference || `P${i + 1}`}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.projectName}</span>
                      <span style={{ fontSize: 11, color: '#6b7280' }}>{p.barCount} {t('anBarsLabel') || 'barres'}</span>
                    </div>
                    <div style={{ height: 6, background: '#1a1a1a', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${pct(p.totalBars, maxBars)}%`,
                        background: `linear-gradient(90deg, #3b82f6, #6366f1)`,
                        borderRadius: 3,
                        transition: 'width .6s ease',
                      }} />
                    </div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 900, color: '#fff', width: 36, textAlign: 'right', flexShrink: 0 }}>
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