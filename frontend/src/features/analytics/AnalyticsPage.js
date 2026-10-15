import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import axios from 'axios';
import {
  RefreshCw, Truck, FolderKanban, Gauge, AlertTriangle, PackageX, Clock, ShoppingCart, FileCheck2,
  CheckCircle2, CircleDot, AlertOctagon, ArrowUpRight, ArrowDownRight, Minus, Table2, BarChart3, ChevronRight, Inbox,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useCompany } from '../../context/CompanyContext';
import { PAGE_PATHS, setUrl } from '../../routes';
import './Dashboard.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

// Production pipeline, in order. Colours are CSS tokens (validated for both themes, see Dashboard.css)
const ETATS = ['non_entame', 'en_cours', 'non_vitre', 'fabrique', 'pret_a_livrer', 'livre'];
const DONE = ['non_vitre', 'fabrique', 'pret_a_livrer', 'livre']; // fabricated or further
const RANGES = ['7d', '30d', '90d', '12m', 'ytd'];
const TABS = ['aluminium', 'vitrage', 'laquage'];
const LOCALES = { fr: 'fr-FR', it: 'it-IT', en: 'en-GB' };
const STATUS_LABEL = {
  non_entame: 'etat_non_entame', en_cours: 'etat_en_cours', non_vitre: 'etat_non_vitre', fabrique: 'etat_fabrique',
  pret_a_livrer: 'etat_pret_a_livrer', livre: 'etat_livre', cloture: 'chStCloture',
};
const TAB_LABEL = { aluminium: 'superCatAluminium', laquage: 'pjTabLaquage', vitrage: 'pjTabVitrage' };

const sum = (o, keys) => keys.reduce((s, k) => s + (o?.[k] || 0), 0);
const pctOf = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

// ── Number / date formatting ────────────────────────────────────────────────
function useFormat(lang) {
  return useMemo(() => {
    const loc = LOCALES[lang] || 'fr-FR';
    const nf = new Intl.NumberFormat(loc, { maximumFractionDigits: 2 });
    const cf = new Intl.NumberFormat(loc, { notation: 'compact', maximumFractionDigits: 1 });
    const money = new Intl.NumberFormat(loc, { style: 'currency', currency: 'MAD', maximumFractionDigits: 0 });
    const moneyC = new Intl.NumberFormat(loc, { style: 'currency', currency: 'MAD', notation: 'compact', maximumFractionDigits: 1 });
    const d = (opts) => new Intl.DateTimeFormat(loc, { timeZone: 'UTC', ...opts });
    const day = d({ day: '2-digit', month: '2-digit' });
    const dayLong = d({ day: 'numeric', month: 'short', year: 'numeric' });
    const month = d({ month: 'short', year: '2-digit' });
    const monthLong = d({ month: 'long', year: 'numeric' });
    const time = new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit' });
    // fr-FR groups thousands with a narrow no-break space the app font has no glyph for → regular no-break space
    const sp = (str) => str.replace(/\u202f/g, '\u00a0');
    return {
      n: (v) => sp(nf.format(v || 0)),
      c: (v) => sp(Math.abs(v || 0) >= 10000 ? cf.format(v) : nf.format(v || 0)),
      money: (v) => sp(Math.abs(v || 0) >= 1000000 ? moneyC.format(v) : money.format(v || 0)),
      moneyFull: (v) => sp(money.format(v || 0)),
      date: (v) => (v ? dayLong.format(new Date(v)) : '—'),
      time: (v) => time.format(new Date(v)),
      // bucket key → short axis label / long tooltip label
      bucket: (key, bucket) => {
        if (bucket === 'month') { const [y, m] = key.split('-'); return month.format(new Date(Date.UTC(+y, +m - 1, 1))); }
        return day.format(new Date(`${key}T00:00:00Z`));
      },
      bucketLong: (key, bucket, t) => {
        if (bucket === 'month') { const [y, m] = key.split('-'); return monthLong.format(new Date(Date.UTC(+y, +m - 1, 1))); }
        const label = dayLong.format(new Date(`${key}T00:00:00Z`));
        return bucket === 'week' ? t('dbWeekOf', { date: label }) : label;
      },
    };
  }, [lang]);
}

// ── Floating tooltip (one for the page) ────────────────────────────────────
const TipContext = React.createContext(() => {});
function TipLayer({ tip }) {
  if (!tip) return null;
  const left = Math.min(tip.x + 14, window.innerWidth - 240);
  return (
    <div className="db-tip" style={{ left, top: tip.y + 14 }} role="status">
      {tip.title && <div className="db-tip__title">{tip.title}</div>}
      {tip.rows.map((r, i) => (
        <div key={i} className="db-tip__row">
          {r.color && <span className="db-tip__key" style={{ background: r.color }} />}
          <strong className="db-tip__val">{r.value}</strong>
          <span className="db-tip__lab">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Sparkline (thin line + area wash, current period dot) ──────────────────
function Sparkline({ values, color = 'var(--viz-1)', height = 34 }) {
  const w = 120;
  if (!values?.length) return null;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  const pts = values.map((v, i) => [i * step, height - 3 - (v / max) * (height - 6)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  // The svg stretches with the tile, so the end dot is HTML (stays round)
  return (
    <div className="db-spark" aria-hidden="true">
      <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none">
        <path d={`${d} L${w},${height} L0,${height} Z`} fill={color} opacity=".1" />
        <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="db-spark__dot" style={{ top: `${(last[1] / height) * 100}%`, background: color }} />
    </div>
  );
}

// ── Delta vs previous period ────────────────────────────────────────────────
function Delta({ now, prev, t, upIsGood = true }) {
  if (!prev && !now) return null;
  if (!prev) return <span className="db-delta db-delta--flat">{t('dbDeltaNew')}</span>;
  const d = Math.round(((now - prev) / prev) * 100);
  const dir = d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
  const good = dir === 'flat' ? 'flat' : ((dir === 'up') === upIsGood ? 'good' : 'bad');
  const Icon = dir === 'up' ? ArrowUpRight : dir === 'down' ? ArrowDownRight : Minus;
  return (
    <span className={`db-delta db-delta--${good}`} title={t('dbVsPrev')}>
      <Icon size={13} strokeWidth={2.5} />{d > 0 ? '+' : ''}{d}%<span className="db-delta__vs"> {t('dbVsPrevShort')}</span>
    </span>
  );
}

// ── Stat tile ───────────────────────────────────────────────────────────────
function Tile({ icon: Icon, label, value, sub, delta, spark, sparkColor, meter, tone, hero, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} className={`db-tile${hero ? ' db-tile--hero' : ''}${tone ? ` db-tile--${tone}` : ''}${onClick ? ' db-tile--link' : ''}`} onClick={onClick}>
      <div className="db-tile__head">
        <span className="db-tile__icon"><Icon size={15} strokeWidth={2.2} /></span>
        <span className="db-tile__label">{label}</span>
      </div>
      <div className="db-tile__body">
        <div className="db-tile__main">
          <div className="db-tile__value">{value}</div>
          {delta}
        </div>
        {spark && <Sparkline values={spark} color={sparkColor} height={hero ? 56 : 34} />}
      </div>
      {meter != null && (
        <div className="db-meter" aria-hidden="true"><div className="db-meter__fill" style={{ width: `${Math.min(100, meter)}%` }} /></div>
      )}
      {sub && <div className="db-tile__sub">{sub}</div>}
    </Tag>
  );
}

// ── Panel with optional chart ↔ table switch ────────────────────────────────
function Panel({ title, sub, children, table, t, className = '', action }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className={`db-panel ${className}`}>
      <header className="db-panel__head">
        <div>
          <h3 className="db-panel__title">{title}</h3>
          {sub && <div className="db-panel__sub">{sub}</div>}
        </div>
        <div className="db-panel__actions">
          {action}
          {table && (
            <button type="button" className="db-iconbtn" onClick={() => setAsTable(v => !v)}
              title={asTable ? t('dbShowChart') : t('dbShowTable')} aria-label={asTable ? t('dbShowChart') : t('dbShowTable')}>
              {asTable ? <BarChart3 size={14} /> : <Table2 size={14} />}
            </button>
          )}
        </div>
      </header>
      {asTable ? table : children}
    </section>
  );
}

// ── Horizontal stacked bar (2px surface gaps, rounded outer ends) ──────────
function StackBar({ segments, total, height = 14, scale = 1, tipTitle, labels = false, fmt }) {
  const setTip = React.useContext(TipContext);
  if (!total) return <div className="db-stack db-stack--empty" style={{ height }} />;
  const visible = segments.filter(s => s.value > 0);
  const tipFor = (s) => ({ title: tipTitle, rows: [{ color: s.color, value: `${fmt(s.value)} · ${pctOf(s.value, total)}%`, label: s.label }] });
  return (
    <div className="db-stack" style={{ height, width: `${Math.max(scale * 100, 2)}%` }}>
      {visible.map(s => {
        const show = labels && (s.value / total) * 100 >= 7;
        return (
          <div key={s.key} className="db-stack__seg" style={{ flexGrow: s.value, background: s.color }} tabIndex={0}
            onPointerMove={e => setTip({ x: e.clientX, y: e.clientY, ...tipFor(s) })}
            onPointerLeave={() => setTip(null)}
            onFocus={e => { const r = e.currentTarget.getBoundingClientRect(); setTip({ x: r.left, y: r.bottom, ...tipFor(s) }); }}
            onBlur={() => setTip(null)}>
            {show && <span className={`db-stack__lab db-stack__lab--${s.ink || 'light'}`}>{fmt(s.value)}</span>}
          </div>
        );
      })}
    </div>
  );
}

// ── Legend (swatch + label + value) ─────────────────────────────────────────
function Legend({ items, fmt, total }) {
  return (
    <ul className="db-legend">
      {items.map(it => (
        <li key={it.key} className={it.value ? '' : 'db-legend__item--zero'}>
          <span className="db-legend__sw" style={{ background: it.color }} />
          <span className="db-legend__lab">{it.label}</span>
          <strong className="db-legend__val">{fmt(it.value)}</strong>
          {total > 0 && <span className="db-legend__pct">{pctOf(it.value, total)}%</span>}
        </li>
      ))}
    </ul>
  );
}

// ── Column chart (1–2 series, one y axis, hover band + tooltip) ────────────
function niceMax(v) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}
function Columns({ data, series, labelOf, titleOf, fmtAxis, fmtVal, height = 200 }) {
  const setTip = React.useContext(TipContext);
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const padL = 40, padB = 26, padT = 10;
  const plotW = Math.max(0, width - padL - 4), plotH = height - padB - padT;
  const max = niceMax(Math.max(0, ...data.flatMap(d => series.map(s => d[s.key] || 0))));
  const band = data.length ? plotW / data.length : 0;
  const gap = 2;
  const barW = Math.max(2, Math.min(24, (band * 0.7 - gap * (series.length - 1)) / series.length));
  const groupW = barW * series.length + gap * (series.length - 1);
  const y = (v) => padT + plotH - (v / max) * plotH;
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max];
  const every = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(plotW / 54))));
  // column with a 4px rounded data-end, square at the baseline
  const bar = (x, v, w) => {
    const h = Math.max(0, (v / max) * plotH);
    if (h <= 0) return '';
    const r = Math.min(4, w / 2, h);
    const b = padT + plotH, top = b - h;
    return `M${x},${b} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${b} Z`;
  };
  const show = (i, clientX, clientY) => {
    setHover(i);
    const d = data[i];
    setTip({ x: clientX, y: clientY, title: titleOf(d), rows: series.map(s => ({ color: s.color, value: fmtVal(d[s.key] || 0), label: s.label })) });
  };
  return (
    <div ref={ref} className="db-cols" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={series.map(s => s.label).join(', ')}
          onPointerLeave={() => { setHover(null); setTip(null); }}>
          {ticks.map((tv, i) => (
            <g key={i}>
              <line x1={padL} x2={width - 4} y1={y(tv)} y2={y(tv)} className={i === 0 ? 'db-axis' : 'db-gridline'} />
              <text x={padL - 8} y={y(tv)} className="db-tick" textAnchor="end" dominantBaseline="middle">{fmtAxis(tv)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const x0 = padL + i * band;
            const gx = x0 + (band - groupW) / 2;
            return (
              <g key={d.key}>
                {hover === i && <rect x={x0} y={padT} width={band} height={plotH} className="db-band" />}
                {series.map((s, si) => (
                  <path key={s.key} d={bar(gx + si * (barW + gap), d[s.key] || 0, barW)} fill={s.color} />
                ))}
                {i % every === 0 && (
                  <text x={x0 + band / 2} y={height - 8} className="db-tick" textAnchor="middle">{labelOf(d)}</text>
                )}
                <rect x={x0} y={padT} width={band} height={plotH + padB} fill="transparent" tabIndex={0}
                  onPointerMove={e => show(i, e.clientX, e.clientY)}
                  onFocus={e => { const r = e.currentTarget.getBoundingClientRect(); show(i, r.left + r.width / 2, r.top + 20); }}
                  onBlur={() => { setHover(null); setTip(null); }} />
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

// ── Horizontal bars, one series (value at the tip) ──────────────────────────
function HBars({ rows, fmt, color = 'var(--viz-1)' }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return (
    <ul className="db-hbars">
      {rows.map(r => (
        <li key={r.key} className="db-hbars__row">
          <div className="db-hbars__lab" title={r.label}>
            {r.code && <span className="db-code">{r.code}</span>}{r.label}
          </div>
          <div className="db-hbars__track">
            <div className="db-hbars__bar" style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%`, background: color }} />
            <span className="db-hbars__val">{fmt(r.value)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Production in progress, with Tous / Aluminium / Vitrage / Laquage tabs ──
function ProductionPanel({ t, f, P, etatLabel, etatSegs }) {
  const [tab, setTab] = useState(() => { try { const v = localStorage.getItem('db_prod_tab'); return v === 'all' || TABS.includes(v) ? v : 'all'; } catch { return 'all'; } });
  const pick = (v) => { setTab(v); try { localStorage.setItem('db_prod_tab', v); } catch { } };
  const all = tab === 'all';
  const counts = all ? P.activeEtats : (P.byTab?.[tab] || {});
  const total = sum(counts, ETATS);
  const projects = all ? P.projects.active : (P.projectsByTab?.[tab] || 0);
  const remp = all ? P.remplissages : (P.remplissagesByTab?.[tab] || { total: 0, livre: 0 });
  const piecesOf = (tb) => sum(P.byTab?.[tb], ETATS);
  const maxTab = Math.max(1, ...TABS.map(piecesOf));
  const name = all ? t('dbPipelineAll') : t(TAB_LABEL[tab]);

  return (
    <Panel t={t} title={t('dbPipeline')} sub={t('dbPipelineSub', { n: f.n(total), p: projects })}
      table={<DataTable
        cols={[{ key: 'tab', label: '' }, ...ETATS.map(e => ({ key: e, label: etatLabel(e), num: true })), { key: 'total', label: t('dbTotal'), num: true }]}
        rows={[
          ...TABS.map(tb => ({ tab: t(TAB_LABEL[tb]), ...Object.fromEntries(ETATS.map(e => [e, f.n(P.byTab[tb][e])])), total: f.n(piecesOf(tb)) })),
          { tab: <strong>{t('dbTotal')}</strong>, ...Object.fromEntries(ETATS.map(e => [e, <strong key={e}>{f.n(P.activeEtats[e])}</strong>])), total: <strong>{f.n(P.activePieces)}</strong> },
        ]} />}>
      <div className="db-subtabs" role="tablist" aria-label={t('dbPipeline')}>
        {['all', ...TABS].map(v => (
          <button key={v} type="button" role="tab" aria-selected={tab === v} className={`db-subtabs__btn${tab === v ? ' is-active' : ''}`} onClick={() => pick(v)}>
            {v === 'all' ? t('dbAllTabs') : t(TAB_LABEL[v])}<span>{f.n(v === 'all' ? P.activePieces : piecesOf(v))}</span>
          </button>
        ))}
      </div>
      {total === 0 ? <p className="db-empty"><FolderKanban size={18} />{t('dbNoProduction')}</p> : (
        <>
          <div className="db-prod-head">
            <strong>{pctOf(sum(counts, DONE), total)}%</strong>
            <span>{t('dbProdDone', { done: f.n(sum(counts, DONE)), total: f.n(total) })}</span>
          </div>
          <StackBar segments={etatSegs(counts)} total={total} height={30} labels fmt={f.n} tipTitle={name} />
          <Legend items={etatSegs(counts)} fmt={f.n} total={total} />
          {all && (
            <div className="db-rows">
              {TABS.map(tb => {
                const tot = piecesOf(tb);
                return (
                  <button key={tb} type="button" className="db-rows__row db-rows__row--link" onClick={() => pick(tb)} title={t(TAB_LABEL[tb])}>
                    <span className="db-rows__lab">{t(TAB_LABEL[tb])}</span>
                    <span className="db-rows__bar">
                      <StackBar segments={etatSegs(P.byTab[tb])} total={tot} height={12} scale={tot / maxTab} fmt={f.n} tipTitle={t(TAB_LABEL[tb])} />
                    </span>
                    <span className="db-rows__val">{f.n(tot)}<span>{tot ? ` · ${pctOf(sum(P.byTab[tb], DONE), tot)}%` : ''}</span></span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
      {remp.total > 0 && (
        <div className="db-foot">{t('dbRemplissages', { done: f.n(remp.livre), total: f.n(remp.total) })}</div>
      )}
    </Panel>
  );
}

// ── Most used items, by super-category and sub-category ────────────────────
// Ranking only: quantities are never added up across articles (each keeps its own unit),
// so the tabs / chips show how many articles were used, the bars show each article's quantity.
function ConsumptionPanel({ t, lang, f, M }) {
  const [sc, setSc] = useState('all');
  const [cat, setCat] = useState('all');
  const items = M.consumed || M.topConsumed || [];
  const scs = M.consumedSuperCategories || [];
  const cats = (M.consumedCategories || []).filter(c => sc !== 'all' && c.superCategory === sc);
  const label = (l, fallback) => l?.[lang] || l?.fr || fallback;
  const inSc = items.filter(c => sc === 'all' || c.superCategory === sc);
  const noCat = inSc.filter(c => !c.categoryId || !cats.some(k => k.id === c.categoryId)).length;
  const shown = inSc.filter(c => cat === 'all' || (cat === 'none' ? (!c.categoryId || !cats.some(k => k.id === c.categoryId)) : c.categoryId === cat));
  const top = shown.slice(0, 10);
  const countSc = (key) => items.filter(c => c.superCategory === key).length;
  const countCat = (id) => inSc.filter(c => c.categoryId === id).length;
  const pickSc = (key) => { setSc(key); setCat('all'); };
  const selName = cat === 'all'
    ? (sc === 'all' ? t('dbAllCategories') : label(scs.find(x => x.key === sc)?.label, sc))
    : cat === 'none' ? t('dbNoSubCategory') : label(cats.find(c => c.id === cat)?.name, '—');

  return (
    <Panel t={t} title={t('dbTopConsumed')} sub={t('dbTopConsumedSub')}
      table={<DataTable cols={[{ key: 'a', label: t('dbColItem') }, { key: 's', label: t('dbColCategory') }, { key: 'q', label: t('dbColQty'), num: true }]}
        rows={shown.map(c => {
          const k = (M.consumedCategories || []).find(x => x.id === c.categoryId);
          const scLab = label(scs.find(x => x.key === c.superCategory)?.label, c.superCategory);
          return { a: `${c.code ? `${c.code} · ` : ''}${c.designation?.[lang] || c.name}`, s: k ? `${scLab} › ${label(k.name, '')}` : scLab, q: f.n(c.quantity) };
        })} />}>
      {items.length === 0 ? <p className="db-empty"><Inbox size={18} />{t('dbNoConsumption')}</p> : (
        <>
          {scs.length > 1 && (
            <div className="db-subtabs" role="tablist" aria-label={t('dbSuperCategory')}>
              <button type="button" role="tab" aria-selected={sc === 'all'} className={`db-subtabs__btn${sc === 'all' ? ' is-active' : ''}`} onClick={() => pickSc('all')}>
                {t('dbAll')}<span>{items.length}</span>
              </button>
              {scs.map(x => (
                <button key={x.key} type="button" role="tab" aria-selected={sc === x.key} className={`db-subtabs__btn${sc === x.key ? ' is-active' : ''}`} onClick={() => pickSc(x.key)}>
                  {label(x.label, x.key)}<span>{countSc(x.key)}</span>
                </button>
              ))}
            </div>
          )}
          {sc !== 'all' && (cats.length > 0 || noCat > 0) && (
            <div className="db-chips" aria-label={t('dbSubCategory')}>
              <button type="button" className={`db-chipbtn${cat === 'all' ? ' is-active' : ''}`} onClick={() => setCat('all')}>
                {t('dbAllSub')}<span>{inSc.length}</span>
              </button>
              {cats.map(c => (
                <button key={c.id} type="button" className={`db-chipbtn${cat === c.id ? ' is-active' : ''}`} onClick={() => setCat(c.id)}>
                  {c.color && <i style={{ background: c.color }} />}{label(c.name, '—')}<span>{countCat(c.id)}</span>
                </button>
              ))}
              {noCat > 0 && cats.length > 0 && (
                <button type="button" className={`db-chipbtn${cat === 'none' ? ' is-active' : ''}`} onClick={() => setCat('none')}>
                  {t('dbNoSubCategory')}<span>{noCat}</span>
                </button>
              )}
            </div>
          )}
          <div className="db-consum-head">
            <span>{selName}</span>
            <span>{shown.length > top.length ? t('dbTopOf', { n: top.length, total: shown.length }) : t('dbArticlesCount', { n: shown.length })}</span>
          </div>
          {top.length === 0 ? <p className="db-empty"><Inbox size={18} />{t('dbNoConsumption')}</p> : (
            <HBars fmt={f.n} rows={top.map(c => ({ key: c.id, label: c.designation?.[lang] || c.name, code: c.code, value: c.quantity }))} />
          )}
        </>
      )}
    </Panel>
  );
}

function DataTable({ cols, rows }) {
  return (
    <div className="db-table-wrap">
      <table className="db-table">
        <thead><tr>{cols.map(c => <th key={c.key} className={c.num ? 'num' : ''}>{c.label}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{cols.map(c => <td key={c.key} className={c.num ? 'num' : ''}>{r[c.key]}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function StatusChip({ status, t }) {
  return (
    <span className="db-chip">
      <span className="db-chip__dot" style={{ background: status === 'cloture' ? 'var(--et-livre)' : `var(--et-${status})` }} />
      {t(STATUS_LABEL[status] || status)}
    </span>
  );
}

// Go to another page through the URL (the App and the target page read it)
const goTo = (path, query) => { setUrl(path, { query }); window.dispatchEvent(new PopStateEvent('popstate')); };

// ═════════════════════════════════════════════════════════════════════════════
export default function AnalyticsPage() {
  const { t, currentLanguage: lang } = useLanguage();
  const { selectedCompany, companies } = useCompany();
  const f = useFormat(lang);
  const [range, setRange] = useState(() => { try { const r = localStorage.getItem('db_range'); return RANGES.includes(r) ? r : '90d'; } catch { return '90d'; } });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tip, setTip] = useState(null);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true); setError('');
    try {
      const res = await axios.get(`${API}/analytics/overview`, { params: { range, companyId: selectedCompany || undefined } });
      if (id === reqId.current) setData(res.data);
    } catch (e) {
      if (id === reqId.current) setError(e.response?.data?.error || e.message);
    } finally { if (id === reqId.current) setLoading(false); }
  }, [range, selectedCompany]);
  useEffect(() => { load(); }, [load]);
  const changeRange = (r) => { setRange(r); try { localStorage.setItem('db_range', r); } catch { } };

  const etatLabel = (e) => t(STATUS_LABEL[e]);
  const etatSegs = (counts) => ETATS.map(e => ({ key: e, value: counts?.[e] || 0, color: `var(--et-${e})`, label: etatLabel(e), ink: e === 'non_entame' ? 'auto' : 'light' }));

  if (!data) {
    return (
      <div className="db">
        <div className="db-state">
          {error
            ? <><AlertTriangle size={18} /> {t('dbLoadError', { msg: error })} <button type="button" className="db-btn" onClick={load}>{t('retry')}</button></>
            : <><RefreshCw size={16} className="db-spin" /> {t('loading')}</>}
        </div>
      </div>
    );
  }

  const P = data.production, S = data.stock, M = data.movements, O = data.orders, D = data.devis;
  const company = companies?.find(c => c.id === selectedCompany);
  const bucketTitle = (d) => f.bucketLong(d.key, data.bucket, t);
  const bucketLabel = (d) => f.bucket(d.key, data.bucket);
  const donePieces = sum(P.activeEtats, DONE);
  const lastDay = new Date(new Date(data.to).getTime() - 86400000);

  const STOCK_STATES = [
    { key: 'ok', label: t('dbStockOk'), color: 'var(--st-good)', Icon: CheckCircle2 },
    { key: 'couvert', label: t('dbStockCovered'), color: 'var(--st-warning)', Icon: CircleDot },
    { key: 'alerte', label: t('dbStockAlert'), color: 'var(--st-serious)', Icon: AlertTriangle },
    { key: 'rupture', label: t('dbStockOut'), color: 'var(--st-critical)', Icon: AlertOctagon },
  ];
  const stockTotals = Object.fromEntries(STOCK_STATES.map(s => [s.key, S.bySuperCategory.reduce((a, r) => a + (r[s.key] || 0), 0)]));
  const scName = (r) => r.label?.[lang] || r.label?.fr || r.key;

  const flowSeries = [
    { key: 'in', label: t('dbFlowIn'), color: 'var(--viz-1)' },
    { key: 'out', label: t('dbFlowOut'), color: 'var(--viz-2)' },
  ];

  return (
    <TipContext.Provider value={setTip}>
      <div className={`db${loading ? ' db--loading' : ''}`}>
        {/* ── Header + the one filter row ── */}
        <div className="db-head">
          <div>
            <h1 className="db-head__title">{t('dbTitle')}</h1>
            <div className="db-head__sub">
              {t('dbPeriod', { from: f.date(data.from), to: f.date(lastDay) })}
              {company && <> · <strong>{company.name}</strong></>}
              {' · '}{t('dbUpdatedAt', { time: f.time(data.generatedAt) })}
            </div>
          </div>
          <div className="db-filters">
            <div className="db-seg" role="radiogroup" aria-label={t('dbRange')}>
              {RANGES.map(r => (
                <button key={r} type="button" role="radio" aria-checked={range === r}
                  className={`db-seg__btn${range === r ? ' is-active' : ''}`} onClick={() => changeRange(r)}>
                  {t(`dbRange_${r}`)}
                </button>
              ))}
            </div>
            <button type="button" className="db-iconbtn db-iconbtn--lg" onClick={load} title={t('dbRefresh')} aria-label={t('dbRefresh')}>
              <RefreshCw size={15} className={loading ? 'db-spin' : ''} />
            </button>
          </div>
        </div>
        {error && <div className="db-error"><AlertTriangle size={14} /> {t('dbLoadError', { msg: error })}</div>}

        {/* ── KPI row ── */}
        <div className={`db-kpis db-kpis--${O ? 6 : 4}`}>
          <Tile hero icon={Truck} label={t('dbKpiDelivered')} value={f.n(P.delivered.now)}
            delta={<Delta now={P.delivered.now} prev={P.delivered.prev} t={t} />}
            spark={P.delivered.series.map(d => d.value)} sparkColor="var(--viz-1)"
            sub={P.delivered.undated ? t('dbKpiDeliveredUndated', { n: P.delivered.undated }) : t('dbKpiDeliveredSub')} />
          <Tile icon={FolderKanban} label={t('dbKpiActive')} value={f.n(P.projects.active)}
            sub={t('dbKpiActiveSub', { a: P.projects.byStatus.en_cours || 0, b: P.projects.byStatus.pret_a_livrer || 0 })}
            onClick={() => goTo(PAGE_PATHS.projects)} />
          <Tile icon={Gauge} label={t('dbKpiProgress')} value={`${pctOf(donePieces, P.activePieces)}%`} meter={pctOf(donePieces, P.activePieces)}
            sub={t('dbKpiProgressSub', { done: f.n(donePieces), total: f.n(P.activePieces) })} />
          <Tile icon={PackageX} label={t('dbKpiAlerts')} value={f.n(S.alerte + S.rupture)} tone={S.rupture ? 'critical' : S.alerte ? 'serious' : 'good'}
            sub={t('dbKpiAlertsSub', { out: S.rupture, covered: S.couvert })}
            onClick={() => goTo(PAGE_PATHS.inventory)} />
          {O && (
            <Tile icon={Clock} label={t('dbKpiLate')} value={f.n(O.late)} tone={O.late ? 'serious' : 'good'}
              sub={t('dbKpiLateSub', { n: O.open })} onClick={() => goTo(PAGE_PATHS.orders, { onglet: 'suivi' })} />
          )}
          {O && (
            <Tile icon={ShoppingCart} label={t('dbKpiSpend')} value={f.money(O.spendNow)}
              delta={<Delta now={O.spendNow} prev={O.spendPrev} t={t} upIsGood={false} />}
              spark={O.spend.map(d => d.value)} sparkColor="var(--viz-1)"
              sub={t('dbKpiSpendSub', { n: O.ordersNow })} />
          )}
        </div>

        {/* ── Production ── */}
        <div className="db-grid db-grid--2-1">
          <ProductionPanel t={t} f={f} P={P} etatLabel={etatLabel} etatSegs={etatSegs} />

          <Panel t={t} title={t('dbDeliveries')} sub={t(`dbBucket_${data.bucket}`)}
            table={<DataTable cols={[{ key: 'p', label: t('dbPeriodCol') }, { key: 'v', label: t('dbPieces'), num: true }]}
              rows={P.delivered.series.map(d => ({ p: bucketTitle(d), v: f.n(d.value) }))} />}>
            {P.delivered.now === 0
              ? <p className="db-empty"><Truck size={18} />{t('dbNoDeliveries')}</p>
              : <Columns data={P.delivered.series} series={[{ key: 'value', label: t('dbPiecesDelivered'), color: 'var(--viz-1)' }]}
                  labelOf={bucketLabel} titleOf={bucketTitle} fmtAxis={f.c} fmtVal={f.n} height={232} />}
          </Panel>
        </div>

        {/* ── Active projects ── */}
        <Panel t={t} title={t('dbProjects')} sub={t('dbProjectsSub')} className="db-panel--flush"
          action={<button type="button" className="db-link" onClick={() => goTo(PAGE_PATHS.projects)}>{t('dbSeeAll')} <ChevronRight size={14} /></button>}>
          {P.activeProjects.length === 0 ? <p className="db-empty"><FolderKanban size={18} />{t('dbNoProjects')}</p> : (
            <div className="db-table-wrap">
              <table className="db-table db-table--rows">
                <thead><tr>
                  <th>{t('dbColProject')}</th><th className="hide-sm">{t('dbColClient')}</th><th className="hide-sm">{t('dbColTab')}</th>
                  <th className="hide-sm">{t('dbColStatus')}</th><th className="db-col-progress">{t('dbColProgress')}</th><th className="num">{t('dbPieces')}</th><th className="num hide-sm">{t('dbColSince')}</th>
                </tr></thead>
                <tbody>
                  {P.activeProjects.map(p => {
                    const done = sum(p.counts, DONE);
                    const days = Math.max(0, Math.floor((Date.now() - new Date(p.date)) / 86400000));
                    return (
                      <tr key={p.id} className="is-link" tabIndex={0}
                        onClick={() => goTo(`${PAGE_PATHS.projects}/${p.id}`, { client: p.tgalu ? 'tgalu' : null, onglet: p.tab === 'aluminium' ? null : p.tab })}
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.click(); }}>
                        <td><div className="db-proj"><strong>{p.name}</strong><span>{p.reference}</span></div></td>
                        <td className="hide-sm">{p.client || '—'}{p.tgalu && <span className="db-tag">TGALU</span>}</td>
                        <td className="hide-sm">{t(TAB_LABEL[p.tab])}</td>
                        <td className="hide-sm"><StatusChip status={p.status} t={t} /></td>
                        <td className="db-col-progress">
                          <div className="db-progress">
                            <div className="db-progress__bar"><StackBar segments={etatSegs(p.counts)} total={p.pieces} height={8} fmt={f.n} tipTitle={p.name} /></div>
                            <span>{pctOf(done, p.pieces)}%</span>
                          </div>
                        </td>
                        <td className="num">{f.n(p.pieces)}</td>
                        <td className="num hide-sm" title={f.date(p.date)}>{t('dbDays', { n: days })}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* ── Stock ── */}
        <div className="db-grid db-grid--1-1">
          <Panel t={t} title={t('dbStock')} sub={t('dbStockSub', { n: f.n(S.items) })}
            table={<DataTable cols={[{ key: 'c', label: '' }, ...STOCK_STATES.map(s => ({ key: s.key, label: s.label, num: true })), { key: 'total', label: t('dbTotal'), num: true }]}
              rows={S.bySuperCategory.map(r => ({ c: scName(r), ...Object.fromEntries(STOCK_STATES.map(s => [s.key, f.n(r[s.key])])), total: f.n(r.total) }))} />}>
            {S.items === 0 ? <p className="db-empty"><Inbox size={18} />{t('dbNoItems')}</p> : (
              <>
                <ul className="db-legend db-legend--status">
                  {STOCK_STATES.map(s => (
                    <li key={s.key} className={stockTotals[s.key] ? '' : 'db-legend__item--zero'}>
                      <s.Icon size={13} style={{ color: s.color }} />
                      <span className="db-legend__lab">{s.label}</span>
                      <strong className="db-legend__val">{f.n(stockTotals[s.key])}</strong>
                    </li>
                  ))}
                </ul>
                <div className="db-rows">
                  {S.bySuperCategory.map(r => (
                    <div key={r.key} className="db-rows__row">
                      <div className="db-rows__lab">{scName(r)}</div>
                      <div className="db-rows__bar">
                        <StackBar total={r.total} height={12} fmt={f.n} tipTitle={scName(r)}
                          segments={STOCK_STATES.map(s => ({ key: s.key, value: r[s.key], color: s.color, label: s.label }))} />
                      </div>
                      <div className="db-rows__val">{f.n(r.total)}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Panel>

          <Panel t={t} title={t('dbRestock')} sub={S.alertCount > S.alerts.length ? t('dbRestockMore', { n: S.alertCount }) : t('dbRestockSub')} className="db-panel--flush">
            {S.alerts.length === 0 ? <p className="db-empty db-empty--good"><CheckCircle2 size={18} />{t('dbNoAlerts')}</p> : (
              <div className="db-table-wrap">
                <table className="db-table">
                  <thead><tr><th>{t('dbColItem')}</th><th className="num">{t('dbColStock')}</th><th className="num hide-sm">{t('dbColOrdered')}</th><th className="num hide-sm">{t('dbColThreshold')}</th><th className="num">{t('dbColMissing')}</th></tr></thead>
                  <tbody>
                    {S.alerts.map(a => (
                      <tr key={a.id}>
                        <td>
                          <div className="db-item">
                            {a.quantity <= 0
                              ? <AlertOctagon size={14} style={{ color: 'var(--st-critical)' }} aria-label={t('dbStockOut')} />
                              : <AlertTriangle size={14} style={{ color: 'var(--st-serious)' }} aria-label={t('dbStockAlert')} />}
                            <span title={a.designation?.[lang] || a.name}>{a.code && <span className="db-code">{a.code}</span>}{a.designation?.[lang] || a.name}</span>
                          </div>
                        </td>
                        <td className="num">{f.n(a.quantity)}</td>
                        <td className="num hide-sm">{f.n(a.ordered)}</td>
                        <td className="num hide-sm">{f.n(a.threshold)}</td>
                        <td className="num"><strong>{f.n(a.missing)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        {/* ── Movements ── */}
        <div className="db-grid db-grid--1-1">
          <Panel t={t} title={t('dbFlow')} sub={t('dbFlowSub', { n: f.n(M.opsNow) })}
            action={<Delta now={M.opsNow} prev={M.opsPrev} t={t} />}
            table={<DataTable cols={[{ key: 'p', label: t('dbPeriodCol') }, { key: 'in', label: t('dbFlowIn'), num: true }, { key: 'out', label: t('dbFlowOut'), num: true }]}
              rows={M.flow.map(d => ({ p: bucketTitle(d), in: f.n(d.in), out: f.n(d.out) }))} />}>
            {M.opsNow === 0 ? <p className="db-empty"><Inbox size={18} />{t('dbNoMovements')}</p> : (
              <>
                <ul className="db-legend">
                  {flowSeries.map(s => (
                    <li key={s.key}><span className="db-legend__sw" style={{ background: s.color }} /><span className="db-legend__lab">{s.label}</span>
                      <strong className="db-legend__val">{f.n(s.key === 'in' ? M.inNow : M.outNow)}</strong></li>
                  ))}
                </ul>
                <Columns data={M.flow} series={flowSeries} labelOf={bucketLabel} titleOf={bucketTitle} fmtAxis={f.c} fmtVal={f.n} height={200} />
              </>
            )}
          </Panel>

          <ConsumptionPanel t={t} lang={lang} f={f} M={M} />
        </div>

        {/* ── Purchasing & quotes ── */}
        {(O || D) && (
          <div className={`db-grid${O && D ? ' db-grid--2-1' : ''}`}>
            {O && (
              <Panel t={t} title={t('dbOrders')} className="db-panel--flush"
                action={<button type="button" className="db-link" onClick={() => goTo(PAGE_PATHS.orders)}>{t('dbSeeAll')} <ChevronRight size={14} /></button>}>
                <div className="db-minis">
                  <div className="db-mini"><span>{t('dbOrdersOpen')}</span><strong>{f.n(O.open)}</strong></div>
                  <div className="db-mini"><span>{t('dbOrdersLate')}</span><strong className={O.late ? 'is-bad' : ''}>{f.n(O.late)}</strong></div>
                  <div className="db-mini"><span>{t('dbOrdersReceptions')}</span><strong>{f.n(O.receptionsNow)}</strong></div>
                  <div className="db-mini"><span>{t('dbOrdersRequests')}</span><strong>{f.n(O.pendingRequests)}</strong></div>
                </div>
                {O.lateList.length === 0 ? <p className="db-empty db-empty--good"><CheckCircle2 size={18} />{t('dbNoLate')}</p> : (
                  <div className="db-table-wrap">
                    <table className="db-table db-table--rows">
                      <thead><tr><th>{t('dbColOrder')}</th><th className="hide-sm">{t('dbColSupplier')}</th><th className="num">{t('dbColExpected')}</th><th className="num">{t('dbColLate')}</th><th className="num hide-sm">{t('dbColReceived')}</th></tr></thead>
                      <tbody>
                        {O.lateList.map(o => (
                          <tr key={o.id} className="is-link" tabIndex={0} onClick={() => goTo(`${PAGE_PATHS.orders}/${o.id}`)}
                            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.click(); }}>
                            <td><strong>{o.number}</strong></td>
                            <td className="hide-sm">{o.supplier || '—'}</td>
                            <td className="num">{f.date(o.expectedDate)}</td>
                            <td className="num"><span className="db-late"><Clock size={12} />{t('dbDays', { n: o.daysLate })}</span></td>
                            <td className="num hide-sm">{o.receivedPct}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            )}
            {D && (
              <Panel t={t} title={t('dbDevis')} sub={t('dbDevisSub', { n: f.n(D.total) })}>
                <div className="db-devis">
                  <div className="db-devis__rate">
                    <span className="db-devis__big">{D.acceptanceRate == null ? '—' : `${D.acceptanceRate}%`}</span>
                    <span className="db-devis__lab">{t('dbDevisRate')}</span>
                    {D.acceptanceRate != null && <div className="db-meter"><div className="db-meter__fill" style={{ width: `${D.acceptanceRate}%` }} /></div>}
                  </div>
                  <div className="db-minis db-minis--2">
                    <div className="db-mini"><span>{t('dbDevisAccepted')}</span><strong>{f.n(D.counts.accepte)}</strong></div>
                    <div className="db-mini"><span>{t('dbDevisRefused')}</span><strong>{f.n(D.counts.refuse)}</strong></div>
                    <div className="db-mini"><span>{t('dbDevisSent')}</span><strong>{f.n(D.counts.envoye)}</strong></div>
                    <div className="db-mini"><span>{t('dbDevisDraft')}</span><strong>{f.n(D.counts.brouillon)}</strong></div>
                  </div>
                  <div className="db-devis__amount">
                    <FileCheck2 size={15} />
                    <div><span>{t('dbDevisAmount')}</span><strong>{f.moneyFull(D.acceptedAmount)}</strong></div>
                    <Delta now={D.acceptedAmount} prev={D.acceptedPrev} t={t} />
                  </div>
                </div>
              </Panel>
            )}
          </div>
        )}

        <p className="db-note">{t('dbNote')}</p>
      </div>
      <TipLayer tip={tip} />
    </TipContext.Provider>
  );
}
