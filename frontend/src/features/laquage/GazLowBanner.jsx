// Banners under the header for the propane gas of the thermolaquage oven (same look as « BL à réceptionner »):
//  - ACHATS (orders.edit): level at or below GAZ_ALERT_PERCENT and not ordered yet → « Commandé » button
//  - Admin (admin.view): gas marked as ordered → « mettre à jour le % » (opens the level editor of the top bar)
// Hidden for this session once closed, until the state changes.
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Fuel, X, Check, PencilLine } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { GAZ_ALERT_PERCENT, GAZ_EVENT, GAZ_OPEN_EDITOR } from './GazStatus';
import '../orders/ReceiveBatch.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
const POLL_MS = 2 * 60 * 1000;
const ssGet = (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
const ssSet = (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { } };
const fmt = (d) => (d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '');

export default function GazLowBanner() {
  const { t } = useLanguage();
  const { can } = useAuth();
  const isAchats = can('orders.edit');
  const isAdmin = can('admin.view');
  const [gaz, setGaz] = useState(null);
  const [dismissed, setDismissed] = useState(() => ssGet('gaz_banner_dismissed') || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setGaz((await axios.get(`${API_URL}/gaz-status`)).data); } catch (e) { /* no access / offline: no banner */ }
  }, []);
  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    const onChange = (e) => (e.detail ? setGaz(e.detail) : load());
    window.addEventListener(GAZ_EVENT, onChange);
    window.addEventListener('focus', load);
    return () => { clearInterval(id); window.removeEventListener(GAZ_EVENT, onChange); window.removeEventListener('focus', load); };
  }, [load]);

  if (!gaz || gaz.percent == null) return null;
  const ordered = !!gaz.orderedAt;
  // which banner: the admin's once ordered, the ACHATS' while low and not ordered
  const mode = ordered ? (isAdmin ? 'admin' : null) : (isAchats && gaz.percent <= GAZ_ALERT_PERCENT ? 'achats' : null);
  if (!mode) return null;
  const sig = `${mode}|${gaz.percent}|${gaz.changedAt || ''}|${gaz.orderedAt || ''}`;
  if (dismissed === sig) return null;
  const close = () => { ssSet('gaz_banner_dismissed', sig); setDismissed(sig); };

  const markOrdered = async () => {
    setSaving(true); setError('');
    try {
      const res = await axios.post(`${API_URL}/gaz-status/ordered`);
      setGaz(res.data);
      window.dispatchEvent(new CustomEvent(GAZ_EVENT, { detail: res.data }));
    } catch (e) { setError(e.response?.data?.error || t('errSave')); }
    finally { setSaving(false); }
  };
  const openEditor = () => { window.scrollTo({ top: 0, behavior: 'smooth' }); window.dispatchEvent(new Event(GAZ_OPEN_EDITOR)); };

  return (
    <div className={`blq-banner ${mode === 'achats' ? 'blq-banner--danger' : ''}`} role={mode === 'achats' ? 'alert' : 'status'}>
      <span className={`blq-banner__icon ${mode === 'achats' ? 'blq-banner__icon--danger' : ''}`}><Fuel size={16} /></span>
      <div className="blq-banner__txt">
        {mode === 'achats' ? (
          <>
            <strong>{t('gzBannerTitle', { n: gaz.percent })}</strong>
            <span>{t('gzBannerText', { n: GAZ_ALERT_PERCENT })}{gaz.changedBy ? ` · ${t('gzUpdated', { by: gaz.changedBy, at: fmt(gaz.changedAt) })}` : ''}</span>
          </>
        ) : (
          <>
            <strong>{t('gzOrderedTitle', { by: gaz.orderedBy || '—', at: fmt(gaz.orderedAt) })}</strong>
            <span>{t('gzOrderedText', { n: gaz.percent })}</span>
          </>
        )}
        {error && <span style={{ color: 'var(--danger)' }}>{error}</span>}
      </div>
      {mode === 'achats' ? (
        <button type="button" className="blq-banner__btn" onClick={markOrdered} disabled={saving}>
          <Check size={14} /> {t('gzBannerOrdered')}
        </button>
      ) : (
        <button type="button" className="blq-banner__btn" onClick={openEditor}>
          <PencilLine size={14} /> {t('gzOrderedUpdate')}
        </button>
      )}
      <button type="button" className="blq-banner__x" onClick={close} aria-label={t('close')} title={t('gzBannerHide')}><X size={15} /></button>
    </div>
  );
}
