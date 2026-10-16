// components/RalPicker.jsx — searchable RAL drop-down: the whole RAL Classic chart (colour given directly),
// the powders in stock first, and a free entry (special finish, anodised…) with its own colour.
import { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import { Check, ChevronDown, Search, X, PenLine, Package } from 'lucide-react';
import { RAL_COLORS, searchRal, findRal, inkOn } from '../utils/ralColors';
import '../RalPicker.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
const norm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function RalPicker({ language, value, colorValue, onChange, t }) {
  const tr = (k, fb) => (t && t(k) && t(k) !== k ? t(k) : fb);
  const [poudres, setPoudres] = useState([]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [manual, setManual] = useState(false);
  const boxRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    axios.get(`${API_URL}/inventory/poudres`).then(r => setPoudres(r.data || [])).catch(() => {});
  }, []);

  // close when clicking outside
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  useEffect(() => { if (open) { setActive(0); setTimeout(() => searchRef.current?.focus(), 0); } }, [open]);

  const pName = (p) => p.designation?.[language] || p.designation?.fr || '';
  // stock of powder per RAL number (a powder named « Poudre RAL 9010 mat » counts for 9010)
  const stockByRal = useMemo(() => {
    const m = new Map();
    for (const p of poudres) { const r = findRal(pName(p)); if (r) m.set(r.num, (m.get(r.num) || 0) + (p.quantity || 0)); }
    return m;
  }, [poudres]); // eslint-disable-line react-hooks/exhaustive-deps

  const options = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    const stock = poudres
      .filter(p => words.every(w => norm(pName(p)).includes(w)))
      .map(p => {
        const r = findRal(pName(p));
        return { key: `p-${p.id}`, kind: 'stock', label: pName(p), sub: r ? r.name : '', hex: r?.hex || p.categoryId?.color || '#9ca3af', qty: p.quantity, value: pName(p) };
      });
    const chart = searchRal(q).map(r => ({ key: r.code, kind: 'ral', label: r.code, sub: r.name, hex: r.hex, qty: stockByRal.get(r.num), value: r.code }));
    const free = q.trim() && !chart.length && !stock.length
      ? [{ key: 'free', kind: 'free', label: q.trim(), sub: tr('ralUseTyped', 'Utiliser ce texte'), hex: colorValue || '#9ca3af', value: q.trim() }] : [];
    return [...stock, ...chart, ...free];
  }, [q, poudres, stockByRal, colorValue]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (o) => {
    onChange({ ralCode: o.value, ralColor: o.hex });
    setOpen(false); setQ('');
  };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (options[active]) choose(options[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  };
  useEffect(() => { listRef.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' }); }, [active]);

  const ral = findRal(value);
  const shown = value ? (colorValue || ral?.hex || '#ffffff') : null;
  // « RAL 9010 » → shows « Blanc pur » under it; a powder name → shows its RAL code
  const selectedSub = !ral ? '' : value === ral.code ? ral.name : `${ral.code} · ${ral.name}`;

  if (manual) {
    return (
      <div className="ralp ralp--manual">
        <input type="text" required className="ralp__manual-code" placeholder="RAL 9010 / Anodisé bronze…"
          value={value} onChange={e => {
            const r = findRal(e.target.value);
            onChange({ ralCode: e.target.value, ralColor: r ? r.hex : colorValue });
          }} />
        <input type="color" className="ralp__manual-color" value={colorValue || '#ffffff'} aria-label={tr('ralColor', 'Couleur')}
          onChange={e => onChange({ ralCode: value, ralColor: e.target.value })} />
        <button type="button" className="ralp__link" onClick={() => setManual(false)}>{tr('ralBackToList', 'Choisir dans le nuancier')}</button>
      </div>
    );
  }

  let lastKind = null;
  return (
    <div className="ralp" ref={boxRef}>
      {/* keeps the form's « required » check */}
      <input className="ralp__required" tabIndex={-1} required value={value || ''} onChange={() => {}} aria-hidden="true" />
      <button type="button" className={`ralp__trigger${open ? ' is-open' : ''}`} onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open}>
        {value ? (
          <>
            <span className="ralp__chip" style={{ background: shown, color: inkOn(shown) }}>{ral ? ral.num : ''}</span>
            <span className="ralp__trigger-txt">
              <strong>{value}</strong>
              {selectedSub && <span>{selectedSub}</span>}
            </span>
            <span role="button" tabIndex={0} className="ralp__clear" aria-label={tr('ralClear', 'Effacer')}
              onClick={e => { e.stopPropagation(); onChange({ ralCode: '', ralColor: '#ffffff' }); }}><X size={14} /></span>
          </>
        ) : (
          <span className="ralp__placeholder">{tr('ralPickPh', '— Choisir un RAL ou une poudre —')}</span>
        )}
        <ChevronDown size={16} className="ralp__chev" />
      </button>

      {open && (
        <div className="ralp__panel" role="listbox">
          <div className="ralp__search">
            <Search size={14} />
            <input ref={searchRef} value={q} onChange={e => { setQ(e.target.value); setActive(0); }} onKeyDown={onKey}
              placeholder={tr('ralSearchPh', 'Rechercher : 9010, blanc, anthracite…')} />
          </div>
          <div className="ralp__list" ref={listRef}>
            {options.length === 0 && <div className="ralp__empty">{tr('noItems', 'Aucun résultat')}</div>}
            {options.map((o, i) => {
              const head = o.kind !== lastKind ? (lastKind = o.kind) : null;
              return (
                <div key={o.key}>
                  {head && head !== 'free' && (
                    <div className="ralp__group">{head === 'stock'
                      ? <><Package size={12} /> {tr('ralInStock', 'Poudres en stock')}</>
                      : `${tr('ralChart', 'Nuancier RAL')} (${RAL_COLORS.length})`}</div>
                  )}
                  <button type="button" role="option" aria-selected={value === o.value}
                    className={`ralp__opt${i === active ? ' is-active' : ''}${value === o.value ? ' is-on' : ''}`}
                    onMouseEnter={() => setActive(i)} onClick={() => choose(o)}>
                    <span className="ralp__sw" style={{ background: o.hex }} />
                    <span className="ralp__opt-txt">
                      <strong>{o.label}</strong>
                      {o.sub && <span>{o.sub}</span>}
                    </span>
                    {o.qty != null && <span className={`ralp__qty${o.qty > 0 ? '' : ' is-zero'}`}>{tr('inStock', 'En stock')} : {o.qty}</span>}
                    {value === o.value && <Check size={14} className="ralp__check" />}
                  </button>
                </div>
              );
            })}
          </div>
          <button type="button" className="ralp__foot" onClick={() => { setManual(true); setOpen(false); }}>
            <PenLine size={13} /> {tr('ralManualLong', 'Saisir manuellement (finition spéciale, anodisé…)')}
          </button>
        </div>
      )}
    </div>
  );
}
