// Banner under the header for ACHATS (orders.edit): the propane gas of the thermolaquage oven is at or
// below GAZ_ALERT_PERCENT → order gas. Same look as the « BL à réceptionner » banner.
// Hidden for this session once closed, until the level is updated again (and still low).
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Fuel, X, ShoppingCart } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { GAZ_ALERT_PERCENT, GAZ_EVENT } from './GazStatus';
import '../orders/ReceiveBatch.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
const POLL_MS = 2 * 60 * 1000;
const ssGet = (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
const ssSet = (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { } };

export default function GazLowBanner({ onOpenOrders }) {
  const { t } = useLanguage();
  const [gaz, setGaz] = useState(null);
  const [dismissed, setDismissed] = useState(() => ssGet('gaz_banner_dismissed') || '');

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

  if (!gaz || gaz.percent == null || gaz.percent > GAZ_ALERT_PERCENT) return null;
  const sig = `${gaz.percent}|${gaz.changedAt || ''}`;
  if (dismissed === sig) return null;
  const close = () => { ssSet('gaz_banner_dismissed', sig); setDismissed(sig); };
  const when = gaz.changedAt ? new Date(gaz.changedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '';

  return (
    <div className="blq-banner blq-banner--danger" role="alert">
      <span className="blq-banner__icon blq-banner__icon--danger"><Fuel size={16} /></span>
      <div className="blq-banner__txt">
        <strong>{t('gzBannerTitle', { n: gaz.percent })}</strong>
        <span>{t('gzBannerText', { n: GAZ_ALERT_PERCENT })}{gaz.changedBy ? ` · ${t('gzUpdated', { by: gaz.changedBy, at: when })}` : ''}</span>
      </div>
      {onOpenOrders && (
        <button type="button" className="blq-banner__btn" onClick={onOpenOrders}>
          <ShoppingCart size={14} /> {t('gzBannerOrder')}
        </button>
      )}
      <button type="button" className="blq-banner__x" onClick={close} aria-label={t('close')} title={t('gzBannerHide')}><X size={15} /></button>
    </div>
  );
}
