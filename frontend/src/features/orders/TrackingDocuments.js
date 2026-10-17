import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { FileText, FileImage, Upload, Eye, Download, Trash2, X, Paperclip, LoaderCircle, AlertTriangle, HardDrive, Printer } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { dialog, errorMessage } from '../../components/common/dialog';
import { showDocument, printDocument } from '../../components/common/docViewerBus';
import './TrackingDocuments.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
const MAX_BYTES = 15 * 1024 * 1024;
const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp';
const KINDS = ['facture', 'bl'];
// « BL 4581.pdf » → « BL 4581 »: the name of a delivery note filed without a typed number
export const fileBase = (name) => String(name || '').replace(/\.[^.]+$/, '').trim().slice(0, 80);

export const fmtSize = (b) => (b >= 1073741824 ? `${(b / 1073741824).toFixed(2)} Go` : b >= 1048576 ? `${(b / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(b / 1024))} Ko`);

// Photos (BL taken with a phone: 3–5 MB) are reduced in the browser before upload: longest side 2000 px,
// JPEG ~82 % — a document stays perfectly readable at 200–400 KB. PDFs are sent as they are.
const IMG_MAX_SIDE = 2000;
const IMG_QUALITY = 0.82;
export async function compressImage(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 300 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); // keeps the phone's rotation
    const scale = Math.min(1, IMG_MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); // transparent PNG → white page
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', IMG_QUALITY));
    if (!blob || blob.size >= file.size) return file; // already small: keep the original
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch { return file; }
}

/** Space used by the documents vs the free-tier cap (warning from 80 %, uploads blocked when full) */
export function StorageGauge({ storage, compact = false, labelKey = 'tdStorage' }) {
  const { t } = useLanguage();
  if (!storage) return null;
  const level = storage.full ? 'full' : storage.used >= storage.warnAt ? 'warn' : 'ok';
  const pct = Math.min(100, storage.pct);
  return (
    <div className={`td-gauge td-gauge--${level}${compact ? ' td-gauge--compact' : ''}`}
      title={t('tdStorageTip', { used: fmtSize(storage.used), limit: fmtSize(storage.limit), n: storage.count })}>
      <HardDrive size={13} />
      <span className="td-gauge__txt">{compact ? `${fmtSize(storage.used)} / ${fmtSize(storage.limit)}` : t(labelKey, { used: fmtSize(storage.used), limit: fmtSize(storage.limit) })}</span>
      <span className="td-gauge__bar"><i style={{ width: `${Math.max(pct, storage.used ? 1 : 0)}%` }} /></span>
      <strong>{pct.toFixed(pct < 10 ? 1 : 0)}%</strong>
    </div>
  );
}

// Opens a document: the window is opened right away (no popup blocker), then pointed to the
// short-lived R2 link the server signs.
// « Voir »: the in-app viewer (works on tablets, Imprimer = A4); « Télécharger »: the private R2 link
export const printOrderDocument = (doc) => printDocument(doc, 'order-tracking/documents');
export async function openDocument(doc, { download = false } = {}) {
  if (!download) { showDocument(doc, 'order-tracking/documents'); return; }
  try {
    const r = await axios.get(`${API_URL}/order-tracking/documents/${doc.id}/url`, { params: { download: 1 } });
    window.location.href = r.data.url;
  } catch (e) { dialog.alert(errorMessage(e, 'Erreur')); }
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
// onNewBl(doc): a delivery note filed under a NEW BL number from a row without BL (before reception);
// it belongs to its own row, so the caller reloads instead of adding it to `row`.
export function DocumentsModal({ row, onClose, onChange, storage, onStorage = () => {}, onNewBl = () => {} }) {
  const { t } = useLanguage();
  const [docs, setDocs] = useState(row.documents || []);
  const [uploading, setUploading] = useState(null); // { kind, name, pct }
  const [error, setError] = useState('');
  const [dragKind, setDragKind] = useState(null);
  const [blNo, setBlNo] = useState('');      // BL number typed when filing a BL before reception
  const [filed, setFiled] = useState([]);    // BLs filed under a new number in this window
  const needsBlNo = !row.blNumber;
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
    for (const original of Array.from(files || [])) {
      // no number typed: each file becomes its own BL, named after the file
      const blNumber = kind === 'bl' && needsBlNo ? (blNo.trim() || fileBase(original.name)) : (row.blNumber || '');
      if (!/^(application\/pdf|image\/(jpeg|png|webp))$/.test(original.type) && !/\.(pdf|jpe?g|png|webp)$/i.test(original.name)) {
        setError(t('tdBadType', { name: original.name })); continue;
      }
      setUploading({ kind, name: original.name, pct: 0, step: 'compress' });
      const file = await compressImage(original);
      if (file.size > MAX_BYTES) { setError(t('tdTooBig', { name: original.name })); continue; }
      setUploading({ kind, name: file.name, pct: 0, step: 'send', saved: original.size - file.size });
      try {
        const r = await axios.post(`${API_URL}/order-tracking/documents`, file, {
          params: { orderId: row.orderId, blNumber, kind, name: file.name },
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          onUploadProgress: (p) => setUploading(u => (u ? { ...u, pct: p.total ? Math.round((p.loaded / p.total) * 100) : 0 } : u)),
        });
        const { factureStatus, storage: st, ...doc } = r.data;
        if (st) onStorage(st);
        if ((doc.blNumber || '') !== (row.blNumber || '')) { setFiled(f => [...f, doc]); onNewBl(doc); continue; }
        current = [...current, doc];
        commit(current, factureStatus ? { factureStatus } : {});
      } catch (e) {
        if (e.response?.data?.storage) onStorage(e.response.data.storage);
        setError(errorMessage(e, t('tdUploadError')));
        if (e.response?.status === 507) break; // full: no point sending the next files
      }
    }
    setUploading(null);
  };

  const remove = async (doc) => {
    if (!(await dialog.confirm({ title: t('deleteTitle'), message: t('tdDeleteConfirm', { name: doc.name }), danger: true, confirmLabel: t('deleteAction') }))) return;
    try {
      const r = await axios.delete(`${API_URL}/order-tracking/documents/${doc.id}`);
      if (r.data?.storage) onStorage(r.data.storage);
      if (filed.some(d => d.id === doc.id)) { setFiled(filed.filter(d => d.id !== doc.id)); onNewBl(null); }
      else commit(docs.filter(d => d.id !== doc.id));
    } catch (e) { dialog.alert(errorMessage(e, t('dlgError'))); }
  };

  const onDrop = (kind) => (e) => { e.preventDefault(); setDragKind(null); if (!uploading && !storage?.full) upload(kind, e.dataTransfer.files); };

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

        <StorageGauge storage={storage} />
        {storage?.full
          ? <div className="td-error"><AlertTriangle size={14} />{t('tdStorageFull')}</div>
          : storage && storage.used >= storage.warnAt && <div className="td-warn"><AlertTriangle size={14} />{t('tdStorageWarn')}</div>}
        {error && <div className="td-error"><AlertTriangle size={14} />{error}</div>}

        {KINDS.map(kind => {
          const list = [...docs.filter(d => d.kind === kind), ...(kind === 'bl' ? filed : [])];
          const busy = uploading?.kind === kind;
          return (
            <section key={kind} className={`td-section${dragKind === kind ? ' is-drag' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragKind(kind); }} onDragLeave={() => setDragKind(null)} onDrop={onDrop(kind)}>
              <div className="td-section__head">
                <h3>{t(kind === 'facture' ? 'tdInvoices' : 'tdBls')}<span>{list.length}</span></h3>
                <input ref={inputs[kind]} type="file" accept={ACCEPT} multiple hidden onChange={e => { upload(kind, e.target.files); e.target.value = ''; }} />
                {kind === 'bl' && needsBlNo && (
                  <input className="td-blno" type="text" value={blNo} maxLength={80} placeholder={t('tdBlNumberPh')}
                    aria-label={t('tdBlNumberPh')} onChange={e => setBlNo(e.target.value)} />
                )}
                <button type="button" className="td-btn" disabled={!!uploading || !!storage?.full} onClick={() => inputs[kind].current?.click()}>
                  <Upload size={14} />{t('tdAdd')}
                </button>
              </div>
              {busy && (
                <div className="td-progress">
                  <LoaderCircle size={14} className="td-spin" /><span>{uploading.step === 'compress' ? t('tdCompressing', { name: uploading.name }) : uploading.name}</span>
                  <div className="td-progress__bar"><i style={{ width: `${uploading.pct}%` }} /></div><strong>{uploading.pct}%</strong>
                </div>
              )}
              {list.length === 0 && !busy ? (
                <div className="td-drop">{t(kind === 'facture' ? 'tdDropInvoice' : needsBlNo ? 'tdDropBlNumbered' : 'tdDropBl')}</div>
              ) : (
                <ul className="td-list">
                  {list.map(d => {
                    const Icon = d.contentType === 'application/pdf' ? FileText : FileImage;
                    return (
                      <li key={d.id}>
                        <button type="button" className="td-file" onClick={() => openDocument(d)} title={t('tdView')}>
                          <Icon size={18} />
                          <span className="td-file__txt">
                            <strong>{kind === 'bl' && d.blNumber && d.blNumber !== row.blNumber && <em className="td-bltag">{/^\s*b\.?\s*l\b/i.test(d.blNumber) ? d.blNumber : `BL ${d.blNumber}`}</em>}{d.name}</strong>
                            <span>{fmtSize(d.size)} · {new Date(d.uploadedAt).toLocaleDateString('fr-FR')}{d.uploadedBy ? ` · ${d.uploadedBy}` : ''}</span>
                          </span>
                        </button>
                        <button type="button" className="td-icon" onClick={() => openDocument(d)} title={t('tdView')} aria-label={t('tdView')}><Eye size={15} /></button>
                        <button type="button" className="td-icon" onClick={() => openDocument(d, { download: true })} title={t('tdDownload')} aria-label={t('tdDownload')}><Download size={15} /></button>
                        <button type="button" className="td-icon" onClick={() => printOrderDocument(d)} title={t('pdocPrint')} aria-label={t('pdocPrint')}><Printer size={15} /></button>
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

/* ── Purchase order page ─────────────────────────────────────────────────── */

/** Buttons on a BL card of the order: open each attached delivery note (+ manage, for ACHAT / accountant) */
// Deletes a BL / invoice (file removed from R2) after confirmation → true when done
export async function deleteOrderDocument(doc, t) {
  const label = doc.kind === 'facture' ? t('tdInvoiceShort') : t('tdBlShort');
  if (!(await dialog.confirm({ title: t('deleteTitle'), message: t('tdDeleteConfirm', { name: `${label} « ${doc.name} »` }), danger: true, confirmLabel: t('deleteAction') }))) return false;
  try { await axios.delete(`${API_URL}/order-tracking/documents/${doc.id}`); return true; }
  catch (e) { dialog.alert(errorMessage(e, t('dlgError'))); return false; }
}

// onDeleted: shown to ACHAT / accountant / admin (canManage) — a small bin next to each BL file
export function BlDocButtons({ docs, canManage, onManage, onDeleted }) {
  const { t } = useLanguage();
  return (
    <div className="td-bl-docs">
      {docs.map((d, i) => {
        const Icon = d.contentType === 'application/pdf' ? FileText : FileImage;
        return (
          <span key={d.id} className="td-bl-item">
            <button type="button" className="td-bl-view" onClick={() => openDocument(d)} title={d.name}>
              <Icon size={13} />{docs.length > 1 ? t('tdViewBlN', { n: i + 1 }) : t('tdViewBl')}
            </button>
            {canManage && onDeleted && (
              <button type="button" className="td-bl-del" title={`${t('deleteAction')} — ${d.name}`} aria-label={t('deleteAction')}
                onClick={async () => { if (await deleteOrderDocument(d, t)) onDeleted(d); }}>
                <Trash2 size={12} />
              </button>
            )}
          </span>
        );
      })}
      {canManage && (
        <button type="button" className="td-bl-manage" onClick={onManage} title={t('tdManage')}>
          <Paperclip size={13} />{docs.length ? t('tdManageShort') : t('tdAttachBl')}
        </button>
      )}
    </div>
  );
}

/** Invoices (and documents not tied to a BL) of the order — only returned to ACHAT / accountant / admin */
export function OrderDocumentsBlock({ docs, onManage, onDeleted }) {
  const { t } = useLanguage();
  const invoices = docs.filter(d => d.kind === 'facture');
  const loose = docs.filter(d => d.kind === 'bl' && !d.blNumber);
  return (
    <div className="td-order-docs">
      <div className="td-order-docs__head">
        <h3>{t('tdInvoices')}<span>{invoices.length}</span></h3>
        <button type="button" className="td-btn" onClick={onManage}><Upload size={14} />{t('tdManageShort')}</button>
      </div>
      {invoices.length === 0 && loose.length === 0 ? (
        <div className="td-drop">{t('tdNoInvoiceYet')}</div>
      ) : (
        <ul className="td-list">
          {[...invoices, ...loose].map(d => {
            const Icon = d.contentType === 'application/pdf' ? FileText : FileImage;
            return (
              <li key={d.id}>
                <button type="button" className="td-file" onClick={() => openDocument(d)} title={t('tdView')}>
                  <Icon size={18} />
                  <span className="td-file__txt">
                    <strong>{d.name}</strong>
                    <span>{d.kind === 'facture' ? t('tdInvoiceShort') : t('tdBlShort')}{d.blNumber ? ` · BL ${d.blNumber}` : ''} · {fmtSize(d.size)} · {new Date(d.uploadedAt).toLocaleDateString('fr-FR')}{d.uploadedBy ? ` · ${d.uploadedBy}` : ''}</span>
                  </span>
                </button>
                <button type="button" className="td-icon" onClick={() => openDocument(d)} title={t('tdView')} aria-label={t('tdView')}><Eye size={15} /></button>
                <button type="button" className="td-icon" onClick={() => openDocument(d, { download: true })} title={t('tdDownload')} aria-label={t('tdDownload')}><Download size={15} /></button>
                        <button type="button" className="td-icon" onClick={() => printOrderDocument(d)} title={t('pdocPrint')} aria-label={t('pdocPrint')}><Printer size={15} /></button>
                {onDeleted && (
                  <button type="button" className="td-icon td-icon--danger" title={t('deleteAction')} aria-label={t('deleteAction')}
                    onClick={async () => { if (await deleteOrderDocument(d, t)) onDeleted(d); }}><Trash2 size={15} /></button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
