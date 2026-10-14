import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Flame, Snowflake } from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
const ROLE_LAQUAGE = 'Laquage';

/* ── FourStatus — thermolaquage furnace on/off indicator ── */
export default function FourStatus() {
    const { user } = useAuth();
    const { t } = useLanguage();
    const userRole =
        (typeof user?.role === 'string' ? user.role : user?.role?.name) ||
        user?.roleName || '';
    const isAdmin = userRole === 'Admin';
    const canToggle = userRole === ROLE_LAQUAGE;

    const [isOn, setIsOn] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [tooltip, setTooltip] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await axios.get(`${API_URL}/four-status`);
            setIsOn(!!res.data?.isOn);
        } catch { /* silently fail */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const toggle = async () => {
        if (!canToggle || saving) return;
        setSaving(true);
        try {
            const res = await axios.put(`${API_URL}/four-status`, { isOn: !isOn });
            setIsOn(!!res.data?.isOn);
        } catch { /* silently fail */ }
        finally { setSaving(false); }
    };

    return (
        <div
            className="four-status"
            style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
            onMouseEnter={() => setTooltip(true)}
            onMouseLeave={() => setTooltip(false)}
        >
            <button
                onClick={canToggle ? toggle : undefined}
                disabled={saving || loading}
                aria-label={isOn ? t('fsOnAria') : t('fsOffAria')}
                title={isOn ? t('fsOn') : t('fsOff')}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    background: isOn
                        ? 'linear-gradient(135deg, rgba(251,113,12,.25) 0%, rgba(239,68,68,.18) 100%)'
                        : 'var(--surface-2)',
                    border: isOn
                        ? '1px solid rgba(251,113,12,.55)'
                        : '1px solid var(--border-2)',
                    borderRadius: 999,
                    height: 36,
                    padding: '0 12px 0 10px',
                    cursor: canToggle && !saving ? 'pointer' : 'default',
                    transition: 'all .22s cubic-bezier(.4,0,.2,1)',
                    outline: 'none',
                    opacity: loading ? 0.4 : 1,
                    /* glow when on */
                    boxShadow: isOn
                        ? '0 0 12px rgba(251,113,12,.35), inset 0 1px 0 rgba(255,255,255,.08)'
                        : 'none',
                }}
            >
                {/* Flame icon */}
                <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                    <Flame
                        size={15}
                        strokeWidth={2}
                        style={{
                            color: isOn ? '#fb923c' : 'var(--text-3)',
                            transition: 'color .22s, filter .22s',
                            filter: isOn
                                ? 'drop-shadow(0 0 4px rgba(251,113,12,.7))'
                                : 'none',
                            animation: isOn ? 'fourFlicker 1.8s ease-in-out infinite' : 'none',
                        }}
                    />
                    {/* pulsing ring when on */}
                    {isOn && !loading && (
                        <span style={{
                            position: 'absolute',
                            inset: -3,
                            borderRadius: '50%',
                            border: '1.5px solid rgba(251,113,12,.4)',
                            animation: 'fourPulse 2s ease-out infinite',
                            pointerEvents: 'none',
                        }} />
                    )}
                </span>

                {/* Status dot + label */}
                <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                }}>
                    <span style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: isOn ? '#4ade80' : 'var(--400)',
                        boxShadow: isOn ? '0 0 6px #4ade80' : 'none',
                        transition: 'all .22s',
                        flexShrink: 0,
                    }} />
                    <span style={{
                        fontFamily: 'var(--mono, monospace)',
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '.06em',
                        textTransform: 'uppercase',
                        color: isOn ? 'var(--text)' : 'var(--text-3)',
                        transition: 'color .22s',
                        whiteSpace: 'nowrap',
                    }}>
                        {/* {saving ? '…' : isOn ? 'ON' : 'OFF'} */}
                    </span>
                </span>
            </button>

            {/* Tooltip */}
            {tooltip && (
                <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'var(--surface-3)',
                    color: 'var(--text)',
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '6px 10px',
                    borderRadius: 7,
                    whiteSpace: 'nowrap',
                    boxShadow: 'var(--sh-lg)',
                    border: '1px solid var(--border-2)',
                    pointerEvents: 'none',
                    zIndex: 999,
                }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{isOn ? <><Flame size={13} style={{ color: '#fb923c' }} /> {t('fsOn')}</> : <><Snowflake size={13} style={{ color: 'var(--ink-blue)' }} /> {t('fsOff')}</>}</span>
                    {!canToggle && (
                        <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 500, marginTop: 2 }}>
                            {t('fsOnlyLaquage')}
                        </div>
                    )}
                    {/* arrow */}
                    <div style={{
                        position: 'absolute',
                        bottom: '100%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: 0, height: 0,
                        borderLeft: '5px solid transparent',
                        borderRight: '5px solid transparent',
                        borderBottom: '5px solid var(--border-2)',
                    }} />
                </div>
            )}

            {/* Keyframe styles */}
            <style>{`
        @keyframes fourFlicker {
          0%,100% { opacity: 1;    transform: scaleY(1)    rotate(-1deg); }
          25%      { opacity: 0.85; transform: scaleY(0.96) rotate(1deg);  }
          50%      { opacity: 1;    transform: scaleY(1.04) rotate(-1deg); }
          75%      { opacity: 0.9;  transform: scaleY(0.98) rotate(0.5deg);}
        }
        @keyframes fourPulse {
          0%   { opacity: .8; transform: scale(1);   }
          70%  { opacity: 0;  transform: scale(2.2); }
          100% { opacity: 0;  transform: scale(2.2); }
        }
      `}</style>
        </div>
    );
}