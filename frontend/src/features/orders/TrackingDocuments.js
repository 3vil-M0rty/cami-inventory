import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { FileText, FileImage, Upload, Eye, Download, Trash2, X, Paperclip, LoaderCircle, AlertTriangle } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { dialog, errorMessage } from '../../components/common/dialog';
import './TrackingDocuments.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
const MAX_BYTES = 15 * 1024 * 1024;
const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp';
const KINDS = ['facture', 'bl'];

const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(b / 1024))} Ko`);

// Opens a document: the window is opened right away (no popup blocker), then pointed to the
// short-lived R2 link the server signs.
export async function openDocument(doc, { download = false } = {}) {
  const w = download ? null : window.open('', '_blank');
  try {
    const r = await axios.get(`${API_URL}/order-tracking/documents/${doc.id}/url`, { params: download ? { download: 1 } : {} });
    if (w) w.location.href = r.data.url;
    else window.location.href = r.data.url;
  } catch (e) {
    if (w) w.close();
    dialog.alert(errorMessage(e, 'Erreur'));
  }
}

/** Compact cell of the Suivi table: invoice / BL counters, click opens the documents window */
export function DocumentsCell({ row, onOpen }) {
  const { t } = useLanguage();
  const docs = row.documents || [];
  const n = (k) => docs.filter(d => d.kind === k).length;
  return (
    <button type="button" className="td-cell" onClick={() => onOpen(row)} title={t('tdManage')}>
      {KINDS.map(k => (
        <span key={k} className={`td-chip${n(k) ? ' is-on' : ''}`}>
          {n(k) ? <FileText size={12} /> : <Paperclip size={12} />}
          {t(k === 'facture' ? 'tdInvoiceShort' : 'tdBlShort')}{n(k) > 1 ? ` ×${n(k)}` : ''}
        </span>
      ))}
    </button>
  );
}

/** Documents of one (order, BL) row: invoices and delivery notes */
export function DocumentsModal({ row, onClose, onChange }) {
  const { t } = useLanguage();
  const [docs, setDocs] = useState(row.documents || []);
  const [uploading, setUploading] = useState(null); // { kind, name, pct }
  const [error, setError] = useState('');
  const [dragKind, setDragKind] = useState(null);
  const inputs = { facture: useRef(null), bl: useRef(null) };

  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape' && !uploading) onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose, uploading]);

  const commit = (next, extra = {}) => { setDocs(next); onChange({ documents: next, ...extra }); };

  const upload = async (kind, files) => {
    setError('');
    let current = docs;
    for (const file of Array.from(files || [])) {
      if (file.size > MAX_BYTES) { setError(t('tdTooBig', { name: file.name })); continue; }
      if (!/^(application\/pdf|image\/(jpeg|png|webp))$/.test(file.type) && !/\.(pdf|jpe?g|png|webp)$/i.test(file.name)) {
        setError(t('tdBadType', { name: file.name })); continue;
      }
      setUploading({ kind, name: file.name, pct: 0 });
      try {
        const r = await axios.post(`${API_URL}/order-tracking/documents`, file, {
          params: { orderId: row.orderId, blNumber: row.blNumber || '', kind, name: file.name },
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          onUploadProgress: (p) => setUploading(u => (u ? { ...u, pct: p.total ? Math.round((p.loaded / p.total) * 100) : 0 } : u)),
        });
        const { factureStatus, ...doc } = r.data;
        current = [...current, doc];
        commit(current, factureStatus ? { factureStatus } : {});
      } catch (e) {
        setError(errorMessage(e, t('tdUploadError')));
      }
    }
    setUploading(null);
  };

  const remove = async (doc) => {
    if (!(await dialog.confirm({ title: t('deleteTitle'), message: t('tdDeleteConfirm', { name: doc.name }), danger: true, confirmLabel: t('deleteAction') }))) return;
    try {
      await axios.delete(`${API_URL}/order-tracking/documents/${doc.id}`);
      commit(docs.filter(d => d.id !== doc.id));
    } catch (e) { dialog.alert(errorMessage(e, t('dlgError'))); }
  };

  const onDrop = (kind) => (e) => { e.preventDefault(); setDragKind(null); if (!uploading) upload(kind, e.dataTransfer.files); };

  return (
    <div className="modal-overlay" onClick={() => !uploading && onClose()}>
      <div className="modal td-modal" onClick={e => e.stopPropagation()} role="dialog" aria-label={t('tdTitle')}>
        <div className="td-head">
          <div>
            <h2>{t('tdTitle')}</h2>
            <div className="td-sub">
              {row.supplierName || '—'} · {t('orBcNo')} <strong>{row.orderNumber || '—'}</strong>
              {row.blNumber ? <> · BL <strong>{row.blNumber}</strong></> : <> · {t('tdNoBlYet')}</>}
            </div>
          </div>
          <button type="button" className="td-x" onClick={onClose} disabled={!!uploading} aria-label={t('close')}><X size={16} /></button>
        </div>

        {error && <div className="td-error"><AlertTriangle size={14} />{error}</div>}

        {KINDS.map(kind => {
          const list = docs.filter(d => d.kind === kind);
          const busy = uploading?.kind === kind;
          return (
            <section key={kind} className={`td-section${dragKind === kind ? ' is-drag' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragKind(kind); }} onDragLeave={() => setDragKind(null)} onDrop={onDrop(kind)}>
              <div className="td-section__head">
                <h3>{t(kind === 'facture' ? 'tdInvoices' : 'tdBls')}<span>{list.length}</span></h3>
                <input ref={inputs[kind]} type="file" accept={ACCEPT} multiple hidden onChange={e => { upload(kind, e.target.files); e.target.value = ''; }} />
                <button type="button" className="td-btn" disabled={!!uploading} onClick={() => inputs[kind].current?.click()}>
                  <Upload size={14} />{t('tdAdd')}
                </button>
              </div>
              {busy && (
                <div className="td-progress">
                  <LoaderCircle size={14} className="td-spin" /><span>{uploading.name}</span>
                  <div className="td-progress__bar"><i style={{ width: `${uploading.pct}%` }} /></div><strong>{uploading.pct}%</strong>
                </div>
              )}
              {list.length === 0 && !busy ? (
                <div className="td-drop">{t(kind === 'facture' ? 'tdDropInvoice' : 'tdDropBl')}</div>
              ) : (
                <ul className="td-list">
                  {list.map(d => {
                    const Icon = d.contentType === 'application/pdf' ? FileText : FileImage;
                    return (
                      <li key={d.id}>
                        <button type="button" className="td-file" onClick={() => openDocument(d)} title={t('tdView')}>
                          <Icon size={18} />
                          <span className="td-file__txt">
                            <strong>{d.name}</strong>
                            <span>{fmtSize(d.size)} · {new Date(d.uploadedAt).toLocaleDateString('fr-FR')}{d.uploadedBy ? ` · ${d.uploadedBy}` : ''}</span>
                          </span>
                        </button>
                        <button type="button" className="td-icon" onClick={() => openDocument(d)} title={t('tdView')} aria-label={t('tdView')}><Eye size={15} /></button>
                        <button type="button" className="td-icon" onClick={() => openDocument(d, { download: true })} title={t('tdDownload')} aria-label={t('tdDownload')}><Download size={15} /></button>
                        <button type="button" className="td-icon td-icon--danger" onClick={() => remove(d)} title={t('deleteAction')} aria-label={t('deleteAction')}><Trash2 size={15} /></button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
        <p className="td-note">{t('tdNote')}</p>
      </div>
    </div>
  );
}
