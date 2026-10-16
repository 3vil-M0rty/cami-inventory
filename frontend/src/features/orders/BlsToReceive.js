// Banner (every page) and « À réceptionner » tab for the accounts that receive goods.
import React, { useMemo, useState } from 'react';
import { BellRing, Eye, FileText, FileImage, PackageCheck, Truck, X, ChevronRight, Inbox, ExternalLink, AlertTriangle, ShoppingCart } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { openDocument, fileBase } from './TrackingDocuments';
import { blLabel } from './ReceiveBatch';
import { useBlsToReceive, canReceiveBls, goToBl, isActionable } from './receptionQueue';
import './ReceiveBatch.css';

// Families of a purchase order (order categories + article families)
export const FAMILIES = {
  aluminium: { color: '#60a5fa', label: { fr: 'Aluminium', it: 'Alluminio', en: 'Aluminium' } },
  verre: { color: '#22d3ee', label: { fr: 'Verre', it: 'Vetro', en: 'Glass' } },
  accessoires: { color: '#f59e0b', label: { fr: 'Accessoires', it: 'Accessori', en: 'Accessories' } },
  poudre: { color: '#e879f9', label: { fr: 'Poudre', it: 'Polvere', en: 'Powder' } },
  fer: { color: '#a1a1aa', label: { fr: 'Fer', it: 'Ferro', en: 'Iron' } },
  toles: { color: '#f87171', label: { fr: 'Tôles', it: 'Lamiere', en: 'Sheets' } },
};
const famLabel = (k, lang) => FAMILIES[k]?.label?.[lang] || FAMILIES[k]?.label?.fr || k;
const famColor = (k) => FAMILIES[k]?.color || '#94a3b8';

export function FamilyTags({ categories, lang, mine }) {
  const { t } = useLanguage();
  const list = categories || [];
  if (!list.length) return null;
  return (
    <span className="blq-fams">
      {list.length > 1 && <span className="blq-fam blq-fam--mixed">{t('blqMixed')}</span>}
      {list.map(c => (
        <span key={c} className={`blq-fam${mine && !mine.includes(c) ? ' is-other' : ''}`} style={{ '--fam': famColor(c) }}>
          <i />{famLabel(c, lang)}
        </span>
      ))}
    </span>
  );
}

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

const useQueue = () => {
  const { user, can } = useAuth();
  return useBlsToReceive(canReceiveBls(user, can), user?.id || user?.username || '');
};

// Thin bar under the header: « 2 BL à réceptionner » — hidden for this session until a new BL comes
export function BlsToReceiveBanner({ onOpenList }) {
  const { t, currentLanguage: lang } = useLanguage();
  const { items } = useQueue();
  const todo = items.filter(isActionable);
  const count = todo.length;
  const [dismissed, setDismissed] = useState(() => ssGet('bls_banner_dismissed') || '');
  const [perm, ask] = useNotifPermission();
  const sig = todo.map(i => i.key).sort().join('|');
  if (!count || dismissed === sig) return null;
  const close = () => { ssSet('bls_banner_dismissed', sig); setDismissed(sig); };
  const first = todo[0];
  const direct = count === 1 && !first.unnumbered;
  return (
    <div className="blq-banner" role="status">
      <span className="blq-banner__icon"><Truck size={16} /></span>
      <div className="blq-banner__txt">
        <strong>{t(count > 1 ? 'blqBannerMany' : 'blqBannerOne', { n: count })}</strong>
        <span>
          {blLabel(first.unnumbered ? fileBase(first.docs[0]?.name) : first.blNumber)} · {first.supplier || '—'} · {t('orBcNo')} {first.orderNumber || '—'}
          {' '}<FamilyTags categories={first.categories} lang={lang} />
          {count > 1 ? ` ${t('blqAndMore', { n: count - 1 })}` : ''}
        </span>
      </div>
      {perm === 'default' && (
        <button type="button" className="blq-banner__btn blq-banner__btn--ghost" onClick={ask} title={t('blqNotifHint')}>
          <BellRing size={14} /> {t('blqNotifEnable')}
        </button>
      )}
      <button type="button" className="blq-banner__btn" onClick={() => (direct ? goToBl(first) : onOpenList())}>
        {direct ? <><PackageCheck size={14} /> {t('rbReceiveThis')}</> : <>{t('blqSeeAll')} <ChevronRight size={14} /></>}
      </button>
      <button type="button" className="blq-banner__x" onClick={close} aria-label={t('close')} title={t('blqHide')}><X size={15} /></button>
    </div>
  );
}

// « À réceptionner » tab of the ACHATS page
// onReceive(item) opens the reception of that BL; onOpen(item) only opens its purchase order
export function BlsToReceivePanel({ onReceive, onOpen, extra = null }) {
  const { t, currentLanguage: lang } = useLanguage();
  const { items, loaded } = useQueue();
  const [perm, ask] = useNotifPermission();
  const [fam, setFam] = useState('all');

  // families present, with their counts (a mixed order counts in each of its families)
  const families = useMemo(() => {
    const m = new Map();
    items.forEach(it => (it.categories || []).forEach(c => m.set(c, (m.get(c) || 0) + 1)));
    const order = Object.keys(FAMILIES);
    return [...m.entries()].sort((a, b) => (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(b[0]) + 1 || 99));
  }, [items]);
  const mixedCount = items.filter(it => (it.categories || []).length > 1).length;
  const shown = items.filter(it => fam === 'all' || (fam === '_mixed' ? (it.categories || []).length > 1 : (it.categories || []).includes(fam)));
  const todo = shown.filter(isActionable);
  const other = shown.filter(it => !isActionable(it));

  const row = (it) => {
    const actionable = isActionable(it);
    return (
      <li key={it.key} className={actionable ? '' : 'is-muted'}>
        <span className="blq-list__icon"><Truck size={16} /></span>
        <span className="blq-list__main">
          <strong>
            {it.unnumbered ? <>{blLabel(fileBase(it.docs[0]?.name))} <em className="blq-list__file">{t('blqNoNumberTag')}</em></> : blLabel(it.blNumber)}
          </strong>
          <span>{it.supplier || '—'} · {t('orBcNo')} <b>{it.orderNumber || '—'}</b></span>
          {/* families still to receive by this account under this BL; the others are greyed */}
          <FamilyTags categories={it.categories} lang={lang} mine={actionable ? it.pendingFamilies : null} />
          {!actionable && (
            <span className="blq-list__warn"><AlertTriangle size={12} />
              {it.orderStatus === 'brouillon' ? t('blqDraft') : t('blqComplete')}
            </span>
          )}
          {actionable && it.unnumbered && <span className="blq-list__hint">{t('blqNoNumberHint')}</span>}
        </span>
        <span className="blq-list__meta">{t('blqFiled', { date: fmtDate(it.filedAt) })}{it.filedBy ? ` · ${it.filedBy}` : ''}</span>
        <span className="blq-list__docs"><DocBtns docs={it.docs} /></span>
        {actionable ? (
          <button type="button" className="btn-receive blq-list__go" onClick={() => onReceive(it)}>
            <PackageCheck size={14} /> {t('rbReceiveThis')}
          </button>
        ) : (
          <button type="button" className="btn-receive btn-receive--ghost blq-list__go" onClick={() => onOpen(it)}>
            <ExternalLink size={14} /> {t('blqOpenBc')}
          </button>
        )}
      </li>
    );
  };

  return (
    <div className="blq-panel">
      <div className="blq-panel__intro">
        <p>{t('blqIntro')}</p>
        {perm === 'default' && <button type="button" className="rb-link" onClick={ask}><BellRing size={13} /> {t('blqNotifEnable')}</button>}
        {perm === 'granted' && <span className="blq-panel__ok"><BellRing size={13} /> {t('blqNotifOn')}</span>}
        {perm === 'denied' && <span className="blq-panel__off">{t('blqNotifDenied')}</span>}
      </div>

      {items.length > 0 && (
        <div className="blq-filters" role="tablist">
          <button type="button" className={`blq-filter${fam === 'all' ? ' is-on' : ''}`} onClick={() => setFam('all')}>
            {t('blqAll')} <span>{items.length}</span>
          </button>
          {families.map(([k, n]) => (
            <button key={k} type="button" className={`blq-filter${fam === k ? ' is-on' : ''}`} style={{ '--fam': famColor(k) }} onClick={() => setFam(k)}>
              <i />{famLabel(k, lang)} <span>{n}</span>
            </button>
          ))}
          {mixedCount > 0 && (
            <button type="button" className={`blq-filter${fam === '_mixed' ? ' is-on' : ''}`} onClick={() => setFam('_mixed')}>
              {t('blqMixed')} <span>{mixedCount}</span>
            </button>
          )}
        </div>
      )}

      {!loaded ? null : shown.length === 0 ? (
        <>
          <div className="blq-empty"><Inbox size={22} /><strong>{t('blqEmpty')}</strong><span>{t('blqEmptySub')}</span></div>
          {extra}
        </>
      ) : (
        <>
          {todo.length > 0 && <ul className="blq-list">{todo.map(row)}</ul>}
          {extra}
          {other.length > 0 && (
            <>
              <h3 className="blq-sub">{t('blqToCheck')} <span>{other.length}</span></h3>
              <p className="blq-sub__hint">{t('blqToCheckHint')}</p>
              <ul className="blq-list">{other.map(row)}</ul>
            </>
          )}
        </>
      )}
    </div>
  );
}

// « orders.own » accounts (e.g. Coordinateur-vitrage): the purchasing department's orders of their family,
// sent and not fully received — they don't see them in their list, only here, to receive them
export function OrdersToReceiveList({ orders, lang, onOpen }) {
  const { t } = useLanguage();
  if (!orders.length) return null;
  return (
    <>
      <h3 className="blq-sub">{t('blqAchatOrders')} <span>{orders.length}</span></h3>
      <p className="blq-sub__hint">{t('blqAchatOrdersHint')}</p>
      <ul className="blq-list">
        {orders.map(o => {
          const ordered = (o.lines || []).reduce((n, l) => n + (l.quantityOrdered || 0), 0);
          const received = (o.lines || []).reduce((n, l) => n + Math.min(l.quantityReceived || 0, l.quantityOrdered || 0), 0);
          return (
            <li key={o.id}>
              <span className="blq-list__icon"><ShoppingCart size={16} /></span>
              <span className="blq-list__main">
                <strong>{t('orBcNo')} {o.number || o.reference || '—'}</strong>
                <span>{o.supplierId?.name || o.supplier || '—'} · {t('blqReceivedOf', { r: received, o: ordered })}</span>
                <FamilyTags categories={o.categories} lang={lang} />
              </span>
              <span className="blq-list__meta">{o.sentAt ? t('blqSentOn', { date: fmtDate(o.sentAt) }) : ''}</span>
              <span />
              <button type="button" className="btn-receive blq-list__go" onClick={() => onOpen(o)}>
                <PackageCheck size={14} /> {t('blqOpenToReceive')}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
