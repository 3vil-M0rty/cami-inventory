import { useEffect, useState } from 'react';
import axios from 'axios';
import { X, ShoppingCart, ChevronRight, Lock } from 'lucide-react';
import { PAGE_PATHS, setUrl } from '../../../routes';
import { useLanguage } from '../../../context/LanguageContext';
import './ItemOrdersModal.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const STATUS = {
  brouillon: { bg: 'rgba(161,161,170,.12)', text: 'var(--ink-grey)', bd: 'rgba(161,161,170,.3)', label: 'ivStDraft' },
  envoye: { bg: 'rgba(96,165,250,.12)', text: 'var(--ink-blue)', bd: 'rgba(96,165,250,.3)', label: 'ivStSent' },
  partielle: { bg: 'rgba(251,191,36,.12)', text: 'var(--ink-amber)', bd: 'rgba(251,191,36,.3)', label: 'ivStPartial' },
  recue: { bg: 'rgba(74,222,128,.1)', text: 'var(--ink-green)', bd: 'rgba(74,222,128,.28)', label: 'ivStReceived' },
  annulee: { bg: 'rgba(248,113,113,.12)', text: 'var(--ink-red)', bd: 'rgba(248,113,113,.3)', label: 'ivStCancelled' },
};

const LOCALES = { fr: 'fr-FR', it: 'it-IT', en: 'en-GB' };
const fmtDate = (d, lang) => (d ? new Date(d).toLocaleDateString(LOCALES[lang] || 'fr-FR') : '—');
const fmtQty = (n) => parseFloat(Number(n || 0).toFixed(2)).toString();

/** Purchase orders (bons de commande) that contain one inventory article */
export default function ItemOrdersModal({ item, language = 'fr', onClose }) {
  const { t } = useLanguage();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCancelled, setShowCancelled] = useState(false);

  const itemId = item?.id || item?._id;
  const name = item?.designation?.[language] || item?.designation?.fr || item?.codeInterne || t('ivArticle');

  useEffect(() => {
    if (!itemId) return;
    setLoading(true);
    setError('');
    axios.get(`${API_URL}/inventory/${itemId}/orders`)
      .then(res => setRows(res.data || []))
      .catch(e => setError(e.response?.status === 403
        ? t('ivNoOrdersAccess')
        : (e.response?.data?.error || t('ivOrdersLoadError'))))
      .finally(() => setLoading(false));
  }, [itemId]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Open the order in the Commandes page (/commandes/<id>)
  const openOrder = (orderId) => {
    onClose();
    setUrl(`${PAGE_PATHS.orders}/${orderId}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const visible = showCancelled ? rows : rows.filter(r => r.status !== 'annulee');
  const cancelledCount = rows.length - rows.filter(r => r.status !== 'annulee').length;
  const pending = rows
    .filter(r => r.status === 'envoye' || r.status === 'partielle')
    .filter(r => !r.closed)
    .reduce((s, r) => s + Math.max(0, r.quantityOrdered - r.quantityReceived), 0);

  return (
    <div className="iom-overlay" onClick={onClose}>
      <div className="iom" onClick={e => e.stopPropagation()} role="dialog" aria-label={`${t('ivPurchaseOrders')} — ${name}`}>
        <div className="iom__head">
          <div className="iom__title-wrap">
            {item?.image
              ? <img className="iom__img" src={item.image} alt="" loading="lazy" />
              : <div className="iom__img iom__img--empty"><ShoppingCart size={16} /></div>}
            <div className="iom__title-text">
              <div className="iom__eyebrow">{t('ivPurchaseOrders')}</div>
              <div className="iom__title" title={name}>{name}</div>
            </div>
          </div>
          <button className="iom__close" onClick={onClose} aria-label={t('close')}><X size={16} /></button>
        </div>

        {!loading && !error && rows.length > 0 && (
          <div className="iom__summary">
            <span><strong>{rows.length - cancelledCount}</strong> {t('ivPoAbbr')}</span>
            <span>{t('ivRemainingToDeliver')}<strong>{fmtQty(pending)}</strong></span>
            {cancelledCount > 0 && (
              <label className="iom__toggle">
                <input type="checkbox" checked={showCancelled} onChange={e => setShowCancelled(e.target.checked)} />
                {t('ivShowCancelled', { n: cancelledCount })}
              </label>
            )}
          </div>
        )}

        <div className="iom__body">
          {loading && <div className="iom__state"><div className="iom__spinner" />{t('loadingShort')}</div>}
          {error && !loading && <div className="iom__state iom__state--error">{error}</div>}
          {!loading && !error && visible.length === 0 && (
            <div className="iom__state">{t('ivNoOrdersForItem')}</div>
          )}

          {!loading && !error && visible.map((r, i) => {
            const st = STATUS[r.status] || STATUS.brouillon;
            const pct = r.quantityOrdered > 0 ? Math.min(100, Math.round((r.quantityReceived / r.quantityOrdered) * 100)) : 0;
            const done = r.closed || r.quantityReceived >= r.quantityOrdered;
            return (
              <button key={`${r.orderId}-${i}`} type="button" className="iom-row" onClick={() => openOrder(r.orderId)}>
                <div className="iom-row__main">
                  <div className="iom-row__top">
                    <span className="iom-row__number">{r.number || <em>{t('ivStDraft')}</em>}</span>
                    <span className="iom-row__status" style={{ background: st.bg, color: st.text, borderColor: st.bd }}>{t(st.label)}</span>
                    {r.closed && <span className="iom-row__closed"><Lock size={10} /> {t('ivClosed')}</span>}
                  </div>
                  <div className="iom-row__meta">
                    {r.companyName && <span className="iom-row__company" style={{ '--co': r.companyColor || 'var(--500)' }}>{r.companyName}</span>}
                    {r.supplierName && <span>{r.supplierName}</span>}
                    <span>{t('ivOrderedOn', { date: fmtDate(r.orderDate, language) })}</span>
                    {r.lastBlNumber && <span>{t('ivLastDeliveryNote', { n: r.lastBlNumber, date: fmtDate(r.lastReceptionAt, language) })}</span>}
                    {r.reference && <span>{t('ivRef', { ref: r.reference })}</span>}
                  </div>
                </div>
                <div className="iom-row__qty">
                  <div className="iom-row__qty-text">
                    <strong>{fmtQty(r.quantityReceived)}</strong> / {fmtQty(r.quantityOrdered)}
                  </div>
                  <div className="iom-row__bar">
                    <div style={{ width: `${pct}%`, background: done ? 'var(--success)' : 'var(--info)' }} />
                  </div>
                </div>
                <ChevronRight size={16} className="iom-row__chev" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
