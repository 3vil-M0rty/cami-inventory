import { useEffect, useState } from 'react';
import axios from 'axios';
import { X, Inbox, Clock, CheckCheck, ChevronRight } from 'lucide-react';
import { PAGE_PATHS, setUrl } from '../../../routes';
import { useLanguage } from '../../../context/LanguageContext';
import './ItemOrdersModal.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const STATUS = {
  pending: { bg: 'rgba(251,191,36,.12)', text: 'var(--ink-amber)', bd: 'rgba(251,191,36,.3)', label: 'orPending', Icon: Clock },
  ordered: { bg: 'rgba(74,222,128,.1)', text: 'var(--ink-green)', bd: 'rgba(74,222,128,.28)', label: 'orOrdered', Icon: CheckCheck },
};

const LOCALES = { fr: 'fr-FR', it: 'it-IT', en: 'en-GB' };
const fmtDate = (d, lang) => (d ? new Date(d).toLocaleDateString(LOCALES[lang] || 'fr-FR') : '—');
const fmtQty = (n) => parseFloat(Number(n || 0).toFixed(2)).toString();

/** Admin purchase requests (demandes d'admin) made for one inventory article */
export default function ItemRequestsModal({ item, language = 'fr', onClose }) {
  const { t } = useLanguage();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const itemId = item?.id || item?._id;
  const name = item?.designation?.[language] || item?.designation?.fr || item?.codeInterne || t('ivArticle');

  useEffect(() => {
    if (!itemId) return;
    setLoading(true);
    setError('');
    // Server-side filter by article (indexed), most recent first
    axios.get(`${API_URL}/purchase-requests`, { params: { itemId, status: 'all', page: 1, limit: 50 } })
      .then(res => { setRows(res.data?.items || []); setTotal(res.data?.total || 0); })
      .catch(e => setError(e.response?.data?.error || t('ivRequestsLoadError')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Open the "Demandes admin" tab of the Commandes page
  const openRequests = () => {
    onClose();
    setUrl(PAGE_PATHS.orders, { query: { onglet: 'requests' } });
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const pendingQty = rows.filter(r => r.status === 'pending').reduce((s, r) => s + (r.quantity || 0), 0);
  const pendingCount = rows.filter(r => r.status === 'pending').length;

  return (
    <div className="iom-overlay" onClick={onClose}>
      <div className="iom" onClick={e => e.stopPropagation()} role="dialog" aria-label={`${t('ivAdminRequests')} — ${name}`}>
        <div className="iom__head">
          <div className="iom__title-wrap">
            {item?.image
              ? <img className="iom__img" src={item.image} alt="" loading="lazy" />
              : <div className="iom__img iom__img--empty"><Inbox size={16} /></div>}
            <div className="iom__title-text">
              <div className="iom__eyebrow">{t('ivAdminRequests')}</div>
              <div className="iom__title" title={name}>{name}</div>
            </div>
          </div>
          <button className="iom__close" onClick={onClose} aria-label={t('close')}><X size={16} /></button>
        </div>

        {!loading && !error && rows.length > 0 && (
          <div className="iom__summary">
            <span><strong>{total}</strong> {t('ivRequestsAbbr')}</span>
            <span>{t('ivPendingRequests', { n: pendingCount })} · {t('ivPendingQty')}<strong>{fmtQty(pendingQty)}</strong></span>
          </div>
        )}

        <div className="iom__body">
          {loading && <div className="iom__state"><div className="iom__spinner" />{t('loadingShort')}</div>}
          {error && !loading && <div className="iom__state iom__state--error">{error}</div>}
          {!loading && !error && rows.length === 0 && (
            <div className="iom__state">{t('ivNoRequestsForItem')}</div>
          )}

          {!loading && !error && rows.map(r => {
            const st = STATUS[r.status] || STATUS.pending;
            return (
              <button key={r.id} type="button" className="iom-row" onClick={openRequests}>
                <div className="iom-row__main">
                  <div className="iom-row__top">
                    <span className="iom-row__number">{fmtDate(r.createdAt || r.requestedAt, language)}</span>
                    <span className="iom-row__status" style={{ background: st.bg, color: st.text, borderColor: st.bd }}>
                      <st.Icon size={10} /> {t(st.label)}
                    </span>
                  </div>
                  <div className="iom-row__meta">
                    {r.requestedBy && <span>{t('ivRequestedBy', { name: r.requestedBy })}</span>}
                    {r.status === 'ordered' && r.orderedAt && (
                      <span>{t('ivOrderedBy', { name: r.orderedBy || '—', date: fmtDate(r.orderedAt, language) })}</span>
                    )}
                    {r.note && <span>{r.note}</span>}
                  </div>
                </div>
                <div className="iom-row__qty">
                  <div className="iom-row__qty-text"><strong>{fmtQty(r.quantity)}</strong></div>
                </div>
                <ChevronRight size={16} className="iom-row__chev" />
              </button>
            );
          })}
          {!loading && !error && total > rows.length && (
            <div className="iom__state">{t('ivMoreRequests', { n: total - rows.length })}</div>
          )}
        </div>
      </div>
    </div>
  );
}
