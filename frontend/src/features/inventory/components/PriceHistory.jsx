// Purchase prices of an article (Admin / ACHAT only): the last price, taken from the purchase orders,
// the prices per supplier (last price paid + catalogue price typed on the article) and the history window
// with a chart (one line per supplier). Prices are HT, in MAD, shown per purchase unit when the article
// has one (per kg for a « 1 rouleau = 50 kg » article), else per stock unit.
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { LineChart, X, Loader2, Trophy, Banknote } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { unitLabel } from '../units';
import './PriceHistory.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

// who sees the articles' purchase prices: Admin and ACHAT (same rule as the server, canSeeItemPrices)
export const useCanSeePrices = () => {
  const { can } = useAuth();
  return can('admin.view') || can('orders.edit');
};

export const fmtMoney = (v, lang = 'fr') => {
  const loc = lang === 'it' ? 'it-IT' : lang === 'en' ? 'en-GB' : 'fr-FR';
  return new Intl.NumberFormat(loc, { style: 'currency', currency: 'MAD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
};
const fmtDay = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');

// The unit the prices are compared in, for this article: its purchase unit (kg, carton…) or its stock unit
export function priceBasis(item) {
  if (item?.purchaseUnit && item.purchaseFactor > 0) return { unit: item.purchaseUnit, perStock: item.purchaseFactor };
  return { unit: item?.unit || '', perStock: 1 };
}
// price of a line, in the article's comparison unit
const inBasis = (pricePerStock, basis) => Math.round(pricePerStock * basis.perStock * 1e4) / 1e4;
// a catalogue price typed in `unit`, in the article's comparison unit
const catalogInBasis = (c, item, basis) => {
  const perStock = item?.purchaseUnit && item.purchaseFactor > 0 && c.unit === item.purchaseUnit ? item.purchaseFactor : 1;
  return inBasis(c.price / perStock, basis);
};

// Supplier colours: fixed order (validated categorical palette, light / dark steps in PriceHistory.css),
// given by the supplier's first appearance in time so a filter never repaints a supplier
const SERIES = 8;

// History of an article, fetched once per window (shared by the summary and the history window)
const cache = new Map();
export function usePriceHistory(itemId) {
  const [data, setData] = useState(() => cache.get(itemId) || null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!itemId) return;
    let alive = true;
    axios.get(`${API_URL}/inventory/${itemId}/price-history`)
      .then(r => {
        // older servers sent the points only
        const d = Array.isArray(r.data) ? { points: r.data, catalog: [] } : { points: r.data?.points || [], catalog: r.data?.catalog || [] };
        cache.set(itemId, d);
        if (alive) setData(d);
      })
      .catch(e => { if (alive) { setError(e.response?.data?.error || 'Erreur'); setData({ points: [], catalog: [] }); } });
    return () => { alive = false; };
  }, [itemId]);
  return { data, error };
}

// Per supplier: last price paid (with date / order), catalogue price, and the cheapest one
function supplierRows(data, item, basis) {
  const by = new Map();
  const key = (id, name) => id || `name:${name}`;
  for (const p of data?.points || []) {
    const k = key(p.supplierId, p.supplier);
    const row = by.get(k) || { key: k, supplier: p.supplier || '—', last: null, catalog: null, count: 0 };
    row.count += 1;
    if (!row.last || new Date(p.date) >= new Date(row.last.date)) row.last = { ...p, value: inBasis(p.pricePerStock, basis) };
    by.set(k, row);
  }
  for (const c of data?.catalog || []) {
    const k = key(c.supplierId, c.supplier);
    const row = by.get(k) || { key: k, supplier: c.supplier || '—', last: null, catalog: null, count: 0 };
    row.catalog = { ...c, value: catalogInBasis(c, item, basis) };
    by.set(k, row);
  }
  const rows = [...by.values()].map(r => ({ ...r, ref: r.last ? r.last.value : r.catalog?.value ?? null }));
  const prices = rows.map(r => r.ref).filter(v => v != null);
  const min = prices.length ? Math.min(...prices) : null;
  return rows
    .map(r => ({ ...r, best: r.ref != null && r.ref === min && rows.length > 1, gap: r.ref != null && min ? ((r.ref - min) / min) * 100 : null }))
    .sort((a, b) => (a.ref ?? Infinity) - (b.ref ?? Infinity));
}

// « Dernier prix : 12,50 MAD HT / kg » — card and article form
// compact (card): a tile — label, big price, unit, date · supplier; a click opens the history (onOpen)
function PriceTile({ kind, label, value, per, meta, onOpen, title, t, lang }) {
  const Tag = onOpen ? 'button' : 'div';
  return (
    <Tag type={onOpen ? 'button' : undefined} className={`pt pt--${kind}`} onClick={onOpen || undefined}
      title={title || (onOpen ? t('ivPriceHistoryBtn') : undefined)}>
      <span className="pt__icon"><Banknote size={13} strokeWidth={2.2} /></span>
      <span className="pt__body">
        <span className="pt__label">{label}</span>
        <span className="pt__line">
          <strong className="pt__value">{fmtMoney(value, lang)}</strong>
          <span className="pt__per">{t('ivPriceHT')}{per}</span>
        </span>
        {meta && <span className="pt__meta">{meta}</span>}
      </span>
      {onOpen && <LineChart size={13} className="pt__go" />}
    </Tag>
  );
}

export function LastPrice({ item, compact = false, onOpen = null }) {
  const { t, currentLanguage: lang } = useLanguage();
  const lp = item?.lastPurchase;
  if (!lp || !(lp.unitPrice > 0)) {
    // never bought yet: the reference price typed on the article, if any
    const ref = item?.refPrice;
    if (ref?.price > 0) {
      const basis = priceBasis(item);
      const perStock = item?.purchaseUnit && item.purchaseFactor > 0 && ref.unit === item.purchaseUnit ? item.purchaseFactor : 1;
      const per = basis.unit ? ` / ${unitLabel(basis.unit, lang)}` : '';
      if (compact) {
        return <PriceTile kind="ref" label={t('ivRefPrice')} value={inBasis(ref.price / perStock, basis)} per={per}
          meta={t('ivRefPriceShort')} onOpen={onOpen} t={t} lang={lang} />;
      }
      return (
        <span className="lp">
          <span className="lp__label">{t('ivRefPrice')} :</span>
          <strong>{fmtMoney(inBasis(ref.price / perStock, basis), lang)}</strong><span className="lp__per">{t('ivPriceHT')}{per}</span>
        </span>
      );
    }
    return compact ? null : <span className="lp lp--none">{t('ivPriceNone')}</span>;
  }
  const basis = priceBasis(item);
  const value = inBasis(lp.unitPrice / (lp.factor > 0 ? lp.factor : 1), basis);
  const per = basis.unit ? ` / ${unitLabel(basis.unit, lang)}` : '';
  if (compact) {
    return <PriceTile kind="last" label={t('ivPriceLastLong')} value={value} per={per}
      meta={`${fmtDay(lp.at)}${lp.supplier ? ` · ${lp.supplier}` : ''}`} onOpen={onOpen}
      title={t('ivPriceLastTitle', { date: fmtDay(lp.at), supplier: lp.supplier || '—', order: lp.orderNumber || '—' })} t={t} lang={lang} />;
  }
  return (
    <span className="lp" title={t('ivPriceLastTitle', { date: fmtDay(lp.at), supplier: lp.supplier || '—', order: lp.orderNumber || '—' })}>
      <span className="lp__label">{t('ivPriceLast')}</span>
      <strong>{fmtMoney(value, lang)}</strong><span className="lp__per">{t('ivPriceHT')}{per}</span>
      {<span className="lp__meta">{fmtDay(lp.at)}{lp.supplier ? ` · ${lp.supplier}` : ''}</span>}
    </span>
  );
}

// « Prix par fournisseur » in the article form: last price paid + catalogue price, cheapest first
export function SupplierPrices({ item }) {
  const { t, currentLanguage: lang } = useLanguage();
  const { data } = usePriceHistory(item?.id || item?._id);
  const basis = useMemo(() => priceBasis(item), [item]);
  const rows = useMemo(() => supplierRows(data, item, basis), [data, item, basis]);
  if (!data) return <div className="sp sp--wait"><Loader2 size={14} className="td-spin" /></div>;
  if (!rows.length) return null;
  const per = basis.unit ? ` / ${unitLabel(basis.unit, lang)}` : '';
  return (
    <div className="sp">
      <div className="sp__title">{t('ivPricePerSupplier')} <span>({t('ivPriceHT')}{per})</span></div>
      <table className="sp__table">
        <thead><tr><th>{t('ivPriceSupplier')}</th><th className="num">{t('ivPriceLastPaid')}</th><th className="num">{t('ivCatalogPrice')}</th><th className="num">{t('ivPriceGap')}</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.key} className={r.best ? 'is-best' : ''}>
              <td>{r.best && <Trophy size={12} className="sp__best" aria-label={t('ivPriceBest')} />} {r.supplier}</td>
              <td className="num">
                {r.last ? <><strong>{fmtMoney(r.last.value, lang)}</strong><span className="sp__meta">{fmtDay(r.last.date)}{r.last.orderNumber ? ` · ${r.last.orderNumber}` : ''}</span></> : '—'}
              </td>
              <td className="num">{r.catalog ? fmtMoney(r.catalog.value, lang) : '—'}</td>
              <td className="num">{r.best ? <span className="sp__tag">{t('ivPriceBest')}</span> : r.gap != null ? `+${r.gap.toFixed(1)} %` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Inline SVG line chart: one line per supplier (fixed colour order), hover shows the nearest point
function PriceChart({ series, basis, lang, t }) {
  const W = 520, H = 200, P = { l: 64, r: 16, t: 14, b: 30 };
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);
  const all = series.flatMap(s => s.points.map(p => ({ ...p, slot: s.slot, supplier: s.name, x: new Date(p.date).getTime(), y: inBasis(p.pricePerStock, basis) })));
  if (all.length < 2) return null;
  const xs = all.map(d => d.x), ys = all.map(d => d.y);
  let [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  if (x0 === x1) { x0 -= 864e5; x1 += 864e5; }
  let [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const pad = (y1 - y0) * 0.15 || y1 * 0.1 || 1;
  y0 = Math.max(0, y0 - pad); y1 += pad;
  const sx = (x) => P.l + ((x - x0) / (x1 - x0)) * (W - P.l - P.r);
  const sy = (y) => P.t + (1 - (y - y0) / (y1 - y0)) * (H - P.t - P.b);
  const ticks = [0, 0.5, 1].map(f => y0 + f * (y1 - y0));
  const onMove = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width) * W, my = ((e.clientY - r.top) / r.height) * H;
    let best = null, bd = Infinity;
    all.forEach(d => { const dd = Math.hypot(sx(d.x) - mx, (sy(d.y) - my) * 0.6); if (dd < bd) { bd = dd; best = d; } });
    setHover(best);
  };
  const h = hover;
  return (
    <div className="ph-chart">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('ivPriceChartAria')}
        onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={P.l} x2={W - P.r} y1={sy(v)} y2={sy(v)} className="ph-grid" />
            <text x={P.l - 8} y={sy(v)} className="ph-axis" textAnchor="end" dominantBaseline="middle">{fmtMoney(v, lang)}</text>
          </g>
        ))}
        <text x={P.l} y={H - 8} className="ph-axis" textAnchor="start">{fmtDay(x0)}</text>
        <text x={W - P.r} y={H - 8} className="ph-axis" textAnchor="end">{fmtDay(x1)}</text>
        {series.map(s => {
          const pts = s.points.map(p => [sx(new Date(p.date).getTime()), sy(inBasis(p.pricePerStock, basis))]);
          return (
            <g key={s.key} className={`ph-s ph-s--${s.slot}`}>
              {pts.length > 1 && <path d={pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} className="ph-line" />}
              {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={4} className="ph-dot" />)}
            </g>
          );
        })}
        {h && <>
          <line x1={sx(h.x)} x2={sx(h.x)} y1={P.t} y2={H - P.b} className="ph-cross" />
          <circle cx={sx(h.x)} cy={sy(h.y)} r={6} className={`ph-dot ph-dot--on ph-s--${h.slot}`} />
        </>}
      </svg>
      {h && (
        // small tip, kept inside the chart: anchored left / centre / right depending on where the point is
        (() => {
          const pct = (sx(h.x) / W) * 100;
          const side = pct < 30 ? 'left' : pct > 70 ? 'right' : 'center';
          return (
            <div className={`ph-tip ph-tip--${side}${sy(h.y) < H / 2 ? ' ph-tip--low' : ''}`} style={{ left: `${pct}%` }}>
              <strong>{fmtMoney(h.y, lang)}</strong>
              <span>{fmtDay(h.date)}</span>
              <span className="ph-tip__sup">{h.supplier || '—'}{h.orderNumber ? ` · ${h.orderNumber}` : ''}</span>
            </div>
          );
        })()
      )}
    </div>
  );
}

// Window: supplier filter, chart (one line per supplier) + table of every purchase order line with a price
export function PriceHistoryModal({ item, onClose }) {
  const { t, currentLanguage: lang } = useLanguage();
  const { data, error } = usePriceHistory(item.id || item._id);
  const [only, setOnly] = useState('all'); // supplier key, or 'all'
  const basis = useMemo(() => priceBasis(item), [item]);
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const points = useMemo(() => data?.points || [], [data]);
  // suppliers in order of first purchase → fixed colour slot each
  const suppliers = useMemo(() => {
    const m = new Map();
    for (const p of points) {
      const k = p.supplierId || `name:${p.supplier}`;
      if (!m.has(k)) m.set(k, { key: k, name: p.supplier || '—', slot: (m.size % SERIES) + 1, points: [] });
      m.get(k).points.push(p);
    }
    return [...m.values()];
  }, [points]);
  const shown = only === 'all' ? suppliers : suppliers.filter(s => s.key === only);
  const shownPoints = shown.flatMap(s => s.points).sort((a, b) => new Date(a.date) - new Date(b.date));
  const per = basis.unit ? ` / ${unitLabel(basis.unit, lang)}` : '';
  const vals = shownPoints.map(p => inBasis(p.pricePerStock, basis));
  const name = item.designation?.[lang] || item.designation?.fr || '';
  const slotOf = (p) => suppliers.find(s => s.key === (p.supplierId || `name:${p.supplier}`))?.slot || 1;

  // rendered on <body>: it opens from inside the article form window
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal ph-modal" onClick={e => e.stopPropagation()} role="dialog" aria-label={t('ivPriceHistory')}>
        <div className="ph-head">
          <div>
            <h2><LineChart size={16} /> {t('ivPriceHistory')}</h2>
            <div className="ph-sub">{name} · {t('ivPriceIn', { unit: `${t('ivPriceHT')}${per}` })}</div>
          </div>
          <button type="button" className="ph-x" onClick={onClose} aria-label={t('close')}><X size={16} /></button>
        </div>

        {data === null ? (
          <div className="ph-empty"><Loader2 size={16} className="td-spin" /></div>
        ) : error ? (
          <div className="form-error">{error}</div>
        ) : !points.length ? (
          <div className="ph-empty">{t('ivPriceNoHistory')}</div>
        ) : (
          <>
            {suppliers.length > 1 && (
              <div className="ph-filter" role="group" aria-label={t('ivPriceSupplier')}>
                <button type="button" className={only === 'all' ? 'is-on' : ''} onClick={() => setOnly('all')}>{t('ivPriceAllSuppliers')}</button>
                {suppliers.map(s => (
                  <button key={s.key} type="button" className={only === s.key ? 'is-on' : ''} onClick={() => setOnly(s.key)}>
                    <i className={`ph-key ph-s--${s.slot}`} />{s.name}
                  </button>
                ))}
              </div>
            )}
            <div className="ph-stats">
              <div><span>{t('ivPriceLast')}</span><strong>{fmtMoney(vals[vals.length - 1], lang)}</strong></div>
              <div><span>{t('ivPriceMin')}</span><strong>{fmtMoney(Math.min(...vals), lang)}</strong></div>
              <div><span>{t('ivPriceMax')}</span><strong>{fmtMoney(Math.max(...vals), lang)}</strong></div>
              <div><span>{t('ivPriceAvg')}</span><strong>{fmtMoney(vals.reduce((a, b) => a + b, 0) / vals.length, lang)}</strong></div>
            </div>
            <PriceChart series={shown} basis={basis} lang={lang} t={t} />
            {/* legend: one entry per supplier on the chart (names, never colour alone) */}
            {shown.length > 1 && (
              <div className="ph-legend">
                {shown.map(s => <span key={s.key}><i className={`ph-key ph-s--${s.slot}`} />{s.name}</span>)}
              </div>
            )}
            <div className="ph-table-wrap">
              <table className="ph-table">
                <thead><tr>
                  <th>{t('date')}</th><th>{t('orBcNo')}</th><th>{t('ivPriceSupplier')}</th>
                  <th className="num">{t('ivPriceLine')}</th><th className="num">{t('ivPriceCompared', { per })}</th>
                </tr></thead>
                <tbody>
                  {[...shownPoints].reverse().map((p, i, arr) => {
                    const v = inBasis(p.pricePerStock, basis);
                    // change vs the previous purchase from the SAME supplier
                    const prevP = arr.slice(i + 1).find(q => (q.supplierId || q.supplier) === (p.supplierId || p.supplier));
                    const prev = prevP ? inBasis(prevP.pricePerStock, basis) : null;
                    const delta = prev ? ((v - prev) / prev) * 100 : null;
                    return (
                      <tr key={`${p.orderId}-${i}`}>
                        <td>{fmtDay(p.date)}</td>
                        <td>{p.orderNumber || '—'}</td>
                        <td>{suppliers.length > 1 && <i className={`ph-key ph-s--${slotOf(p)}`} />}{p.supplier || '—'}</td>
                        <td className="num">{fmtMoney(p.unitPrice, lang)}{p.unit ? ` / ${unitLabel(p.unit, lang)}` : ''}</td>
                        <td className="num">
                          <strong>{fmtMoney(v, lang)}</strong>
                          {delta != null && Math.abs(delta) >= 0.05 && (
                            <span className={`ph-delta ${delta > 0 ? 'is-up' : 'is-down'}`}>{delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)} %</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
