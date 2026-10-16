// Banner (every page) and « À réceptionner » tab for the accounts that receive goods.
import React, { useState } from 'react';
import { BellRing, Eye, FileText, FileImage, PackageCheck, Truck, X, ChevronRight, Inbox } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { openDocument } from './TrackingDocuments';
import { blLabel } from './ReceiveBatch';
import { useBlsToReceive, canReceiveBls, goToBl } from './receptionQueue';
import './ReceiveBatch.css';

const ssGet = (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
const ssSet = (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { } };
const fmtDate = (d) => new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const DocBtns = ({ docs }) => docs.map(d => {
  const Icon = d.contentType === 'application/pdf' ? FileText : FileImage;
  return (
    <button key={d.id} type="button" className="rb-doc" onClick={(e) => { e.stopPropagation(); openDocument(d); }} title={d.name}>
      <Icon size={13} /><Eye size={12} />
    </button>
  );
});

function useNotifPermission() {
  const supported = typeof Notification !== 'undefined';
  const [perm, setPerm] = useState(supported ? Notification.permission : 'unsupported');
  const ask = async () => { try { setPerm(await Notification.requestPermission()); } catch (e) { } };
  return [perm, ask];
}

// Thin bar under the header: « 2 BL à réceptionner » — hidden for this session until a new BL comes
export function BlsToReceiveBanner({ onOpenList }) {
  const { t } = useLanguage();
  const { user, can } = useAuth();
  const { items, count } = useBlsToReceive(canReceiveBls(user, can), user?.id || user?.username || '');
  const [dismissed, setDismissed] = useState(() => ssGet('bls_banner_dismissed') || '');
  const [perm, ask] = useNotifPermission();
  const sig = items.map(i => i.key).sort().join('|');
  if (!count || dismissed === sig) return null;
  const close = () => { ssSet('bls_banner_dismissed', sig); setDismissed(sig); };
  const first = items[0];
  return (
    <div className="blq-banner" role="status">
      <span className="blq-banner__icon"><Truck size={16} /></span>
      <div className="blq-banner__txt">
        <strong>{t(count > 1 ? 'blqBannerMany' : 'blqBannerOne', { n: count })}</strong>
        <span>{blLabel(first.blNumber)} · {first.supplier || '—'} · {t('orBcNo')} {first.orderNumber || '—'}{count > 1 ? ` ${t('blqAndMore', { n: count - 1 })}` : ''}</span>
      </div>
      {perm === 'default' && (
        <button type="button" className="blq-banner__btn blq-banner__btn--ghost" onClick={ask} title={t('blqNotifHint')}>
          <BellRing size={14} /> {t('blqNotifEnable')}
        </button>
      )}
      <button type="button" className="blq-banner__btn" onClick={() => (count === 1 ? goToBl(first) : onOpenList())}>
        {count === 1 ? <><PackageCheck size={14} /> {t('rbReceiveThis')}</> : <>{t('blqSeeAll')} <ChevronRight size={14} /></>}
      </button>
      <button type="button" className="blq-banner__x" onClick={close} aria-label={t('close')} title={t('blqHide')}><X size={15} /></button>
    </div>
  );
}

// « À réceptionner » tab of the ACHATS page
export function BlsToReceivePanel({ onReceive }) {
  const { t } = useLanguage();
  const { user, can } = useAuth();
  const { items, loaded } = useBlsToReceive(canReceiveBls(user, can), user?.id || user?.username || '');
  const [perm, ask] = useNotifPermission();
  return (
    <div className="blq-panel">
      <div className="blq-panel__intro">
        <p>{t('blqIntro')}</p>
        {perm === 'default' && <button type="button" className="rb-link" onClick={ask}><BellRing size={13} /> {t('blqNotifEnable')}</button>}
        {perm === 'granted' && <span className="blq-panel__ok"><BellRing size={13} /> {t('blqNotifOn')}</span>}
        {perm === 'denied' && <span className="blq-panel__off">{t('blqNotifDenied')}</span>}
      </div>
      {!loaded ? null : items.length === 0 ? (
        <div className="blq-empty"><Inbox size={22} /><strong>{t('blqEmpty')}</strong><span>{t('blqEmptySub')}</span></div>
      ) : (
        <ul className="blq-list">
          {items.map(it => (
            <li key={it.key}>
              <span className="blq-list__icon"><Truck size={16} /></span>
              <span className="blq-list__main">
                <strong>{blLabel(it.blNumber)}</strong>
                <span>{it.supplier || '—'} · {t('orBcNo')} <b>{it.orderNumber || '—'}</b></span>
              </span>
              <span className="blq-list__meta">{t('blqFiled', { date: fmtDate(it.filedAt) })}{it.filedBy ? ` · ${it.filedBy}` : ''}</span>
              <span className="blq-list__docs"><DocBtns docs={it.docs} /></span>
              <button type="button" className="btn-receive blq-list__go" onClick={() => onReceive(it)}>
                <PackageCheck size={14} /> {t('rbReceiveThis')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
