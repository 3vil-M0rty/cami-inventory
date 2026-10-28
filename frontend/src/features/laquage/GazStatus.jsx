import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Fuel } from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

// at or below this level, ACHATS get the « commander du gaz » banner (GazLowBanner)
export const GAZ_ALERT_PERCENT = 40;
// tells the banner (same tab) that the level just changed
export const GAZ_EVENT = 'gaz-status-changed';

// level colour: green ≥ 50 %, amber ≥ 20 %, red below
const levelColor = (p) => (p >= 50 ? '#4ade80' : p >= 20 ? '#fbbf24' : '#f87171');

/* ── GazStatus — propane tank level (%) of the thermolaquage oven, next to the oven in the top bar ── */
export default function GazStatus() {
    const { can } = useAuth();
    const { t } = useLanguage();
    // « Gaz — modifier le niveau » in the role (Administration › Rôles); the admin always can
    const canEdit = can('gaz.edit') || can('admin.view');

    const [data, setData] = useState(null);       // { percent, changedBy, changedAt }
    const [hover, setHover] = useState(false);
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(100);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const boxRef = useRef(null);

    const load = useCallback(async () => {
        try { setData((await axios.get(`${API_URL}/gaz-status`)).data); }
        catch { /* silently fail, like the oven */ }
    }, []);
    useEffect(() => { load(); }, [load]);

    // close the editor when clicking outside
    useEffect(() => {
        if (!open) return undefined;
        const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    const percent = data?.percent ?? null;
    const color = percent == null ? 'var(--text-3)' : levelColor(percent);

    const openEditor = () => {
        if (!canEdit) return;
        setDraft(percent ?? 100); setError(''); setOpen(o => !o); setHover(false);
    };
    const save = async () => {
        const p = Math.round(Number(draft));
        if (!Number.isFinite(p) || p < 0 || p > 100) return setError(t('gzRange'));
        setSaving(true); setError('');
        try {
            const res = await axios.put(`${API_URL}/gaz-status`, { percent: p });
            setData(res.data); setOpen(false);
            window.dispatchEvent(new CustomEvent(GAZ_EVENT, { detail: res.data }));
        }
        catch (e) { setError(e.response?.data?.error || t('errSave')); }
        finally { setSaving(false); }
    };

    const when = data?.changedAt ? new Date(data.changedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '';

    return (
        <div ref={boxRef} className="gaz-status" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
            onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
            <button
                onClick={openEditor}
                disabled={percent == null}
                aria-label={percent == null ? t('gzTitle') : `${t('gzTitle')} — ${percent} %`}
                style={{
                    display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 11px 0 9px',
                    borderRadius: 999, background: 'var(--surface-2)', outline: 'none',
                    border: `1px solid ${percent != null && percent < 20 ? 'rgba(248,113,113,.55)' : 'var(--border-2)'}`,
                    cursor: canEdit ? 'pointer' : 'default', opacity: percent == null ? 0.4 : 1,
                    transition: 'all .22s cubic-bezier(.4,0,.2,1)',
                }}>
                <Fuel size={15} strokeWidth={2} style={{ color }} />
                {/* small gauge */}
                <span style={{ width: 26, height: 6, borderRadius: 3, background: 'var(--surface-3)', overflow: 'hidden', flexShrink: 0 }}>
                    <span style={{ display: 'block', height: '100%', width: `${percent ?? 0}%`, background: color, transition: 'width .3s' }} />
                </span>
                <span style={{ fontFamily: 'var(--mono, monospace)', fontSize: 11, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', minWidth: 30, textAlign: 'right' }}>
                    {percent == null ? '—' : `${percent}%`}
                </span>
            </button>

            {/* Tooltip */}
            {hover && !open && percent != null && (
                <div style={tipStyle}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Fuel size={13} style={{ color }} /> {t('gzTitle')} — {percent} %
                    </span>
                    {percent < 20 && <div style={{ fontSize: 10, color: '#f87171', marginTop: 2 }}>{t('gzLow')}</div>}
                    {data?.changedBy && <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 500, marginTop: 2 }}>{t('gzUpdated', { by: data.changedBy, at: when })}</div>}
                    {!canEdit && <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 500, marginTop: 2 }}>{t('gzReadOnly')}</div>}
                </div>
            )}

            {/* Editor (roles with « gaz.edit ») */}
            {open && (
                <div style={{ ...tipStyle, pointerEvents: 'auto', whiteSpace: 'normal', width: 230, padding: 12 }} onClick={e => e.stopPropagation()}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{t('gzTitle')}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="range" min="0" max="100" step="1" value={draft}
                            onChange={e => setDraft(e.target.value)} style={{ flex: 1, accentColor: levelColor(Number(draft)) }} />
                        <input type="number" min="0" max="100" value={draft} onChange={e => setDraft(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setOpen(false); }}
                            style={{ width: 56, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border-2)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 12, textAlign: 'right' }} />
                        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>%</span>
                    </div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                        {[100, 75, 50, 25, 0].map(v => (
                            <button key={v} type="button" onClick={() => setDraft(v)}
                                style={{ flex: 1, padding: '3px 0', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border-2)', background: Number(draft) === v ? 'var(--surface-2)' : 'transparent', color: 'var(--text-2)' }}>
                                {v}
                            </button>
                        ))}
                    </div>
                    {error && <div style={{ fontSize: 11, color: '#f87171', marginTop: 6 }}>{error}</div>}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 10 }}>
                        <button type="button" onClick={() => setOpen(false)}
                            style={{ padding: '5px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', border: '1px solid var(--border-2)', background: 'transparent', color: 'var(--text-2)' }}>
                            {t('cancel')}
                        </button>
                        <button type="button" onClick={save} disabled={saving}
                            style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none', background: 'var(--text)', color: 'var(--text-inv)', opacity: saving ? 0.6 : 1 }}>
                            {t('gzSave')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

const tipStyle = {
    position: 'absolute', top: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)',
    background: 'var(--surface-3)', color: 'var(--text)', fontSize: 11, fontWeight: 600,
    padding: '6px 10px', borderRadius: 7, whiteSpace: 'nowrap', boxShadow: 'var(--sh-lg)',
    border: '1px solid var(--border-2)', pointerEvents: 'none', zIndex: 999,
};
