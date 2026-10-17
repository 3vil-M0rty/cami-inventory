// Reception of one delivery (one BL) for several lines at once, and the BLs filed in the Suivi
// that are still waiting to be received.
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Check, CheckCheck, Eye, FileText, FileImage, Package, PackageCheck, X, AlertTriangle, Truck, Trash2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { errorMessage } from '../../components/common/dialog';
import { openDocument, fileBase, deleteOrderDocument } from './TrackingDocuments';
import './ReceiveBatch.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
const lineKey = (l) => String(l._id || l.id);
// "BL-777" stays as is, "4581" becomes "BL 4581"
export const blLabel = (n) => (/^\s*b\.?\s*l\b/i.test(n) ? n : `BL ${n}`);

// BL numbers filed in the Suivi (delivery-note documents) with their files and reception state
export function filedBls(order, docs) {
  const received = new Set((order.receptions || []).filter(r => !r.cancelled).map(r => r.blNumber));
  const map = new Map();
  for (const d of docs || []) {
    if (d.kind !== 'bl' || !d.blNumber) continue;
    if (!map.has(d.blNumber)) map.set(d.blNumber, { blNumber: d.blNumber, docs: [], received: received.has(d.blNumber), at: d.uploadedAt });
    map.get(d.blNumber).docs.push(d);
  }
  return [...map.values()].sort((a, b) => new Date(a.at) - new Date(b.at));
}

// onDelete (ACHAT / accountant / admin): a small bin after each file
const DocButtons = ({ docs, onDelete }) => docs.map(d => {
  const Icon = d.contentType === 'application/pdf' ? FileText : FileImage;
  return (
    <React.Fragment key={d.id}>
      <button type="button" className="rb-doc" onClick={(e) => { e.stopPropagation(); openDocument(d); }} title={d.name}>
        <Icon size={13} /><Eye size={12} />
      </button>
      {onDelete && (
        <button type="button" className="rb-doc rb-doc--del" onClick={(e) => { e.stopPropagation(); onDelete(d); }} title={d.name} aria-label="Supprimer">
          <Trash2 size={12} />
        </button>
      )}
    </React.Fragment>
  );
});

// Block on the order page: BLs filed but not received in stock yet
export function PendingBlsBlock({ order, docs, canReceive, canReceiveLine = () => true, onReceive, canManage = false, onDeleted }) {
  const { t } = useLanguage();
  const del = canManage && onDeleted ? async (d) => { if (await deleteOrderDocument(d, t)) onDeleted(d); } : null;
  // a BL stays pending while one of MY open lines has a family not yet received under it
  // (mixed BL: the warehouse receives the accessoires, the admin the aluminium…)
  const famOf = (l) => l.itemId?.superCategory || 'aluminium';
  const lineFam = new Map((order.lines || []).map(l => [String(l._id || l.id), famOf(l)]));
  const myOpen = (order.lines || []).filter(l => !l.closed && (l.quantityReceived || 0) < l.quantityOrdered && canReceiveLine(l));
  const pending = filedBls(order, docs).filter(b => {
    const done = new Set((order.receptions || []).filter(r => !r.cancelled && r.blNumber === b.blNumber).map(r => lineFam.get(String(r.lineId))));
    return b.received ? myOpen.some(l => !done.has(famOf(l))) : true;
  });
  // scans filed without a number (before numbering existed), while something is left to receive
  const hasOpen = (order.lines || []).some(l => !l.closed && (l.quantityReceived || 0) < l.quantityOrdered);
  const loose = hasOpen ? (docs || []).filter(d => d.kind === 'bl' && !d.blNumber) : [];
  if (!pending.length && !loose.length) return null;
  return (
    <div className="rb-pending">
      <div className="rb-pending__head">
        <Truck size={15} />
        <h3>{t('rbPendingTitle')}<span>{pending.length + loose.length}</span></h3>
      </div>
      <ul>
        {pending.map(b => (
          <li key={b.blNumber}>
            <span className="rb-pending__no"><strong>{blLabel(b.blNumber)}</strong></span>
            <span className="rb-pending__meta">{t('rbFiledOn', { date: new Date(b.at).toLocaleDateString('fr-FR') })}</span>
            <DocButtons docs={b.docs} onDelete={del} />
            {canReceive && (
              <button type="button" className="btn-receive rb-pending__go" onClick={() => onReceive(b.blNumber)}>
                <PackageCheck size={14} /> {t('rbReceiveThis')}
              </button>
            )}
          </li>
        ))}
        {loose.map(d => (
          <li key={d.id}>
            <span className="rb-pending__no" title={d.name}><strong>{blLabel(fileBase(d.name))}</strong> <em className="blq-list__file">{t('blqNoNumberTag')}</em></span>
            <span className="rb-pending__meta">{t('rbFiledOn', { date: new Date(d.uploadedAt).toLocaleDateString('fr-FR') })}</span>
            <DocButtons docs={[d]} onDelete={del} />
            {canReceive && (
              <button type="button" className="btn-receive rb-pending__go" onClick={() => onReceive('', [d.id])}>
                <PackageCheck size={14} /> {t('rbReceiveThis')}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ReceiveBatchModal({ order, docs, lang, canReceiveLine, initialBl = '', initialAttach = [], onClose, onDone }) {
  const { t } = useLanguage();
  const bls = useMemo(() => filedBls(order, docs), [order, docs]);
  // BL scans filed without a number: picking one files it under the number typed here
  const loose = useMemo(() => (docs || []).filter(d => d.kind === 'bl' && !d.blNumber), [docs]);
  const [attach, setAttach] = useState(initialAttach || []);
  const [bl, setBl] = useState(initialBl || (initialAttach?.length ? fileBase(loose.find(d => d.id === initialAttach[0])?.name)
    : bls.filter(b => !b.received).length === 1 ? bls.find(b => !b.received).blNumber : ''));
  // documents of the order may arrive after the window opened: name the picked scan then
  useEffect(() => {
    if (attach.length && !bl) { const d = loose.find(x => x.id === attach[0]); if (d) setBl(fileBase(d.name)); }
  }, [loose]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickNumbered = (n) => { setAttach([]); setBl(n); };
  // a scan without number is named after its file (the number can still be corrected)
  const pickLoose = (id) => { setAttach([id]); setBl(fileBase(loose.find(d => d.id === id)?.name)); };
  const [qty, setQty] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const open = (order.lines || []).filter(l => !l.closed && (l.quantityReceived || 0) < l.quantityOrdered);
  const mine = open.filter(canReceiveLine);
  const others = open.length - mine.length;
  const remaining = (l) => Math.max(0, l.quantityOrdered - (l.quantityReceived || 0));
  const val = (l) => Number(qty[lineKey(l)] || 0);
  const chosen = mine.filter(l => val(l) > 0);
  const total = chosen.reduce((s, l) => s + val(l), 0);
  const invalid = mine.some(l => qty[lineKey(l)] !== undefined && qty[lineKey(l)] !== '' && !(Number(qty[lineKey(l)]) >= 0));
  const blFiled = bls.find(b => b.blNumber === bl.trim());

  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose, saving]);

  const fillAll = () => setQty(Object.fromEntries(mine.map(l => [lineKey(l), String(remaining(l))])));
  const clearAll = () => setQty({});

  const submit = async () => {
    setError('');
    if (!bl.trim()) { setError(t('orBlRequired')); return; }
    if (!chosen.length) { setError(t('rbNothing')); return; }
    setSaving(true);
    try {
      const r = await axios.post(`${API_URL}/orders/${order.id}/receive-batch`, {
        blNumber: bl.trim(),
        lines: chosen.map(l => ({ lineId: lineKey(l), quantity: val(l) })),
        attachDocIds: attach,
      });
      onDone(r.data);
    } catch (e) { setError(errorMessage(e, t('dlgError'))); setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={() => !saving && onClose()}>
      <div className="modal rb-modal" onClick={e => e.stopPropagation()} role="dialog" aria-label={t('rbTitle')}>
        <div className="rb-head">
          <div>
            <h2>{t('rbTitle')}</h2>
            <div className="rb-sub">{order.supplierId?.name || order.supplier || '—'} · {t('orBcNo')} <strong>{order.number || order.reference || '—'}</strong></div>
          </div>
          <button type="button" className="rb-x" onClick={onClose} disabled={saving} aria-label={t('close')}><X size={16} /></button>
        </div>

        {/* 1. The delivery note */}
        <section className="rb-step">
          <h3><span>1</span>{t('rbStepBl')}</h3>
          {(bls.length > 0 || loose.length > 0) && (
            <div className="rb-bls">
              {loose.map(d => {
                const on = attach.includes(d.id);
                return (
                  <div key={d.id} role="button" tabIndex={0} className={`rb-bl${on ? ' is-on' : ''}`}
                    onClick={() => pickLoose(d.id)} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && pickLoose(d.id)}>
                    <span className="rb-bl__radio">{on && <Check size={11} />}</span>
                    <span className="rb-bl__txt">
                      <strong title={d.name}>{blLabel(fileBase(d.name))}</strong>
                      <span>{t('blqNoNumberTag')}</span>
                    </span>
                    <DocButtons docs={[d]} />
                  </div>
                );
              })}
              {bls.map(b => (
                <div key={b.blNumber} role="button" tabIndex={0}
                  className={`rb-bl${!attach.length && bl.trim() === b.blNumber ? ' is-on' : ''}`}
                  onClick={() => pickNumbered(b.blNumber)} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && pickNumbered(b.blNumber)}>
                  <span className="rb-bl__radio">{!attach.length && bl.trim() === b.blNumber && <Check size={11} />}</span>
                  <span className="rb-bl__txt">
                    <strong>{blLabel(b.blNumber)}</strong>
                    <span>{b.received ? t('rbAlreadyPartly') : t('rbFiledOn', { date: new Date(b.at).toLocaleDateString('fr-FR') })}</span>
                  </span>
                  <DocButtons docs={b.docs} />
                </div>
              ))}
            </div>
          )}
          <label className="rb-other">
            <span>{attach.length ? t('rbTypeNumber') : bls.length ? t('rbOtherBl') : t('orBlNumberLabel')}</span>
            <input type="text" value={bl} maxLength={80} placeholder={t('orBlPlaceholder')} onChange={e => setBl(e.target.value)} autoFocus={!bls.length || attach.length > 0} />
          </label>
          {attach.length > 0 && <p className="rb-hint">{t('rbAttachHint')}</p>}
          {!attach.length && bl.trim() && !blFiled && <p className="rb-hint">{bls.length ? t('rbNotFiled') : t('rbNoneFiled')}</p>}
        </section>

        {/* 2. What arrived */}
        <section className="rb-step">
          <div className="rb-step__head">
            <h3><span>2</span>{t('rbStepQty')}</h3>
            {mine.length > 0 && (
              <div className="rb-step__tools">
                <button type="button" className="rb-link" onClick={fillAll}><CheckCheck size={13} /> {t('rbAllReceived')}</button>
                {Object.keys(qty).length > 0 && <button type="button" className="rb-link" onClick={clearAll}>{t('rbClear')}</button>}
              </div>
            )}
          </div>
          {mine.length === 0 ? (
            <div className="rb-empty">{t('rbNoLine')}</div>
          ) : (
            <ul className="rb-lines">
              {mine.map(l => {
                const it = l.itemId || {};
                const name = it.designation?.[lang] || it.designation?.fr || it.codeInterne || t('orArticle');
                const rest = remaining(l);
                const v = val(l);
                const over = v > rest;
                return (
                  <li key={lineKey(l)} className={v > 0 ? 'is-set' : ''}>
                    <span className="rb-lines__img">{it.image ? <img src={it.image} alt="" loading="lazy" /> : <Package size={14} />}</span>
                    <span className="rb-lines__name">
                      <strong title={name}>{name}</strong>
                      <span>{it.codeInterne ? `${it.codeInterne} · ` : ''}{t('rbReceivedOf', { r: l.quantityReceived || 0, o: l.quantityOrdered })}</span>
                    </span>
                    <span className="rb-lines__qty">
                      <input type="number" min="0" inputMode="numeric" value={qty[lineKey(l)] ?? ''} placeholder="0"
                        className={over ? 'is-over' : ''} aria-label={t('rbQtyNow')}
                        onChange={e => setQty(q => ({ ...q, [lineKey(l)]: e.target.value }))} />
                      <button type="button" className="rb-rest" onClick={() => setQty(q => ({ ...q, [lineKey(l)]: String(rest) }))} title={t('rbFillRest')}>
                        / {rest}
                      </button>
                    </span>
                    {over && <span className="rb-over"><AlertTriangle size={12} /> {t('rbOver', { n: v - rest })}</span>}
                  </li>
                );
              })}
            </ul>
          )}
          {others > 0 && <p className="rb-hint">{t('rbOthers', { n: others })}</p>}
        </section>

        {error && <div className="rb-error"><AlertTriangle size={14} />{error}</div>}

        <div className="modal-actions">
          <button onClick={onClose} disabled={saving}>{t('cancel')}</button>
          <button className="primary" onClick={submit} disabled={saving || invalid || !bl.trim() || !chosen.length}>
            <Check size={15} /> {chosen.length
              ? t('rbConfirm', { n: chosen.length, q: total, bl: blLabel(bl.trim()) })
              : t('orConfirmReception')}
          </button>
        </div>
      </div>
    </div>
  );
}
