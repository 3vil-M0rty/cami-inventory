import { useEffect, useState } from 'react';
import axios from 'axios';
import { X, ShoppingCart, ChevronRight, Lock } from 'lucide-react';
import { PAGE_PATHS, setUrl } from '../../../routes';
import './ItemOrdersModal.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const STATUS = {
  brouillon: { bg: '#f3f4f6', text: '#374151', label: 'Brouillon' },
  envoye: { bg: '#e0e7ff', text: '#3730a3', label: 'Envoyé' },
  partielle: { bg: '#dbeafe', text: '#1e40af', label: 'Partielle' },
  recue: { bg: '#dcfce7', text: '#166534', label: 'Reçue' },
  annulee: { bg: '#fee2e2', text: '#991b1b', label: 'Annulée' },
};

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');
const fmtQty = (n) => parseFloat(Number(n || 0).toFixed(2)).toString();

/** Purchase orders (bons de commande) that contain one inventory article */
export default function ItemOrdersModal({ item, language = 'fr', onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCancelled, setShowCancelled] = useState(false);

  const itemId = item?.id || item?._id;
  const name = item?.designation?.[language] || item?.designation?.fr || item?.codeInterne || 'Article';

  useEffect(() => {
    if (!itemId) return;
    setLoading(true);
    setError('');
    axios.get(`${API_URL}/inventory/${itemId}/orders`)
      .then(res => setRows(res.data || []))
      .catch(e => setError(e.response?.status === 403
        ? 'Vous n\'avez pas accès aux bons de commande.'
        : (e.response?.data?.error || 'Impossible de charger les bons de commande.')))
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
      <div className="iom" onClick={e => e.stopPropagation()} role="dialog" aria-label={`Bons de commande — ${name}`}>
        <div className="iom__head">
          <div className="iom__title-wrap">
            {item?.image
              ? <img className="iom__img" src={item.image} alt="" loading="lazy" />
              : <div className="iom__img iom__img--empty"><ShoppingCart size={16} /></div>}
            <div className="iom__title-text">
              <div className="iom__eyebrow">Bons de commande</div>
              <div className="iom__title" title={name}>{name}</div>
            </div>
          </div>
          <button className="iom__close" onClick={onClose} aria-label="Fermer"><X size={16} /></button>
        </div>

        {!loading && !error && rows.length > 0 && (
          <div className="iom__summary">
            <span><strong>{rows.length - cancelledCount}</strong> BC</span>
            <span>Reste à livrer : <strong>{fmtQty(pending)}</strong></span>
            {cancelledCount > 0 && (
              <label className="iom__toggle">
                <input type="checkbox" checked={showCancelled} onChange={e => setShowCancelled(e.target.checked)} />
                Afficher les annulés ({cancelledCount})
              </label>
            )}
          </div>
        )}

        <div className="iom__body">
          {loading && <div className="iom__state"><div className="iom__spinner" />Chargement…</div>}
          {error && !loading && <div className="iom__state iom__state--error">{error}</div>}
          {!loading && !error && visible.length === 0 && (
            <div className="iom__state">Cet article n'apparaît dans aucun bon de commande.</div>
          )}

          {!loading && !error && visible.map((r, i) => {
            const st = STATUS[r.status] || STATUS.brouillon;
            const pct = r.quantityOrdered > 0 ? Math.min(100, Math.round((r.quantityReceived / r.quantityOrdered) * 100)) : 0;
            const done = r.closed || r.quantityReceived >= r.quantityOrdered;
            return (
              <button key={`${r.orderId}-${i}`} type="button" className="iom-row" onClick={() => openOrder(r.orderId)}>
                <div className="iom-row__main">
                  <div className="iom-row__top">
                    <span className="iom-row__number">{r.number || <em>Brouillon</em>}</span>
                    <span className="iom-row__status" style={{ background: st.bg, color: st.text }}>{st.label}</span>
                    {r.closed && <span className="iom-row__closed"><Lock size={10} /> Clôturée</span>}
                  </div>
                  <div className="iom-row__meta">
                    {r.companyName && <span className="iom-row__company" style={{ background: r.companyColor || '#1a1a1a' }}>{r.companyName}</span>}
                    {r.supplierName && <span>{r.supplierName}</span>}
                    <span>Commandé le {fmtDate(r.orderDate)}</span>
                    {r.lastBlNumber && <span>Dernier BL {r.lastBlNumber} ({fmtDate(r.lastReceptionAt)})</span>}
                    {r.reference && <span>Réf. {r.reference}</span>}
                  </div>
                </div>
                <div className="iom-row__qty">
                  <div className="iom-row__qty-text">
                    <strong>{fmtQty(r.quantityReceived)}</strong> / {fmtQty(r.quantityOrdered)}
                  </div>
                  <div className="iom-row__bar">
                    <div style={{ width: `${pct}%`, background: done ? 'var(--success, #16a34a)' : '#2563eb' }} />
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
