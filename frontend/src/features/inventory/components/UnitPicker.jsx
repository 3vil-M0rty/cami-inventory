import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import { unitOptions, unitLabel, unitFromText, unitGroupLabel, UNIT_GROUPS } from '../units';
import './UnitPicker.css';

const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Unit field: a list of every known unit, by family, opened on click and filtered as you type
// (any language, singular or plural). A unit that is not in the list can be typed and kept as is.
// `value` / `onChange` work with the stored unit (code of a known unit, or the typed text).
export default function UnitPicker({ value, onChange, lang = 'fr', placeholder, required = false, clearable = true }) {
  const { t } = useLanguage();
  const [text, setText] = useState(unitLabel(value, lang));
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false); // filter only once the user types (on open: the whole list)
  const [active, setActive] = useState(0);
  const listRef = useRef(null);
  const boxRef = useRef(null);
  const listId = useId();
  useEffect(() => { if (!open) setText(unitLabel(value, lang)); }, [value, lang, open]);

  const all = useMemo(() => unitOptions(lang), [lang]);
  const q = typing ? norm(text) : '';
  const shown = useMemo(() => (q ? all.filter(u => u.search.includes(q)) : all), [all, q]);
  const exact = q && all.some(u => u.search.split(' ').includes(q) || norm(u.label) === q);
  // rows: the units by family, then the free text (when it is not a known unit)
  const rows = useMemo(() => {
    const out = [];
    for (const [g] of UNIT_GROUPS) {
      const us = shown.filter(u => u.group === g);
      if (us.length) out.push({ kind: 'group', key: g }, ...us.map(u => ({ kind: 'unit', ...u })));
    }
    if (q && !exact) out.push({ kind: 'custom', text: text.trim() });
    return out;
  }, [shown, q, exact, text]);
  const pickable = rows.map((r, i) => (r.kind === 'group' ? -1 : i)).filter(i => i >= 0);
  // highlighted row: the one chosen with the mouse / arrows, else the first unit found
  const current = pickable.includes(active) ? active : (pickable[0] ?? -1);

  const choose = (r) => {
    const v = r.kind === 'custom' ? unitFromText(r.text) : r.code;
    onChange(v);
    setText(unitLabel(v, lang));
    setOpen(false); setTyping(false);
  };
  // on open: the whole list, positioned on the current unit
  const openList = () => {
    setOpen(true); setTyping(false);
    const all0 = []; for (const [g] of UNIT_GROUPS) { all0.push(null); all.filter(u => u.group === g).forEach(u => all0.push(u.code)); }
    setActive(all0.indexOf(value));
  };

  // keep the highlighted row visible
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector(`[data-i="${current}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [current, open]);
  // close on a click outside
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (!boxRef.current?.contains(e.target)) commitAndClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const commitAndClose = () => {
    if (typing) { const v = unitFromText(text); if (v !== value) onChange(v); }
    setOpen(false); setTyping(false);
  };

  const onKey = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { e.preventDefault(); openList(); return; }
    if (!open) return;
    const pos = pickable.indexOf(current);
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(pickable[Math.min(pickable.length - 1, pos + 1)] ?? current); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(pickable[Math.max(0, pos - 1)] ?? current); }
    else if (e.key === 'Enter') { e.preventDefault(); const r = rows[current]; if (r && r.kind !== 'group') choose(r); else commitAndClose(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setText(unitLabel(value, lang)); setOpen(false); setTyping(false); }
    else if (e.key === 'Tab') commitAndClose();
  };

  return (
    <div className={`unitp${open ? ' is-open' : ''}`} ref={boxRef}>
      <div className="unitp__field">
        <input
          type="text" value={text} required={required} placeholder={placeholder} autoComplete="off"
          role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
          onFocus={openList} onClick={() => !open && openList()}
          onChange={(e) => { setText(e.target.value); setTyping(true); setOpen(true); setActive(-1); }}
          onKeyDown={onKey}
        />
        {clearable && value && (
          <button type="button" className="unitp__clear" title={t('upClear')} aria-label={t('upClear')}
            onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(''); setText(''); }}>
            <X size={13} />
          </button>
        )}
        <ChevronDown size={14} className="unitp__chev" aria-hidden="true" />
      </div>
      {open && (
        <div className="unitp__list" id={listId} ref={listRef} role="listbox" onMouseDown={(e) => e.preventDefault()}>
          {rows.length === 0 && <div className="unitp__empty">{t('upNone')}</div>}
          {rows.map((r, i) => (r.kind === 'group' ? (
            <div key={`g-${r.key}`} className="unitp__group">{unitGroupLabel(r.key, lang)}</div>
          ) : (
            <div key={r.kind === 'custom' ? 'custom' : r.code} data-i={i} role="option" aria-selected={i === current}
              className={`unitp__opt${i === current ? ' is-active' : ''}${r.code && r.code === value ? ' is-current' : ''}${r.kind === 'custom' ? ' unitp__opt--custom' : ''}`}
              onMouseEnter={() => setActive(i)} onClick={() => choose(r)}>
              {r.kind === 'custom' ? t('upUseCustom', { text: r.text }) : r.label}
            </div>
          )))}
        </div>
      )}
    </div>
  );
}
