// « Documents » tab of a project: plans, devis signés, photos… stored on the projects' Cloudflare R2 account.
// Only names and sizes are loaded; a file is downloaded from R2 when « Voir » / « Télécharger » is clicked.
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { FileText, FileImage, Upload, Eye, Download, Trash2, LoaderCircle, AlertTriangle, FolderOpen, Printer, X, ExternalLink } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import { dialog, errorMessage } from '../../../components/common/dialog';
import { StorageGauge, compressImage, fmtSize } from '../../orders/TrackingDocuments';
import '../../orders/TrackingDocuments.css';
import './ProjectDocuments.css';
import { nativePdfViewer, renderPdf, printImages, pdfToImages } from './pdfRender';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
const MAX_BYTES = 15 * 1024 * 1024;
const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp';

// the window opens right away (no popup blocker), then goes to the short-lived link signed by the server
export async function openProjectDoc(doc, { download = false } = {}) {
  const w = download ? null : window.open('', '_blank');
  try {
    const r = await axios.get(`${API_URL}/project-documents/${doc.id}/url`, { params: download ? { download: 1 } : {} });
    if (w) w.location.href = r.data.url; else window.location.href = r.data.url;
  } catch (e) {
    if (w) w.close();
    dialog.alert(errorMessage(e, 'Erreur'));
  }
}

// The file itself, fetched through the server (same origin as the app → it can be shown in the app and printed)
async function fetchDocUrl(doc) {
  try {
    const r = await axios.get(`${API_URL}/project-documents/${doc.id}/file`, { responseType: 'blob' });
    return URL.createObjectURL(new Blob([r.data], { type: doc.contentType || r.data.type }));
  } catch (e) {
    let msg = e;
    let body = null;
    try { if (e.response?.data instanceof Blob) { body = JSON.parse(await e.response.data.text()); msg = { response: { data: body } }; } } catch { /* keep e */ }
    // the generic « Not Found » of the server (no such route): its server.js is older than this screen
    if (e.response?.status === 404 && body?.path) throw new Error('Serveur pas à jour : installez le dernier backend/server.js puis redémarrez le backend.');
    throw new Error(errorMessage(msg, 'Erreur'));
  }
}

// Every print (computer and tablet) goes through page images on A4: the browser's own PDF print would
// use the printer's default paper (often Letter) and can't be set to A4 from the page.
async function printA4(url, contentType) {
  const srcs = contentType === 'application/pdf' ? await pdfToImages(url) : [url];
  printImages(srcs);
}

export async function printProjectDoc(doc) {
  try {
    const url = await fetchDocUrl(doc);
    await printA4(url, doc.contentType);
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  } catch (e) { dialog.alert(e.message); }
}

// In-app viewer: the document opens inside the app (not as a web page in another tab), with Imprimer /
// Télécharger / Nouvel onglet. Rendered on <body> so no card or panel can clip it.
export function DocViewer({ doc, onClose }) {
  const { t } = useLanguage();
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState('');
  const frameRef = useRef(null);
  const pagesRef = useRef(null);
  const isPdf = doc.contentType === 'application/pdf';
  const native = nativePdfViewer(); // computer: browser's PDF viewer; tablet: pages drawn by the app
  const [progress, setProgress] = useState(null); // tablet: { i, n } while drawing the pages
  const [printing, setPrinting] = useState(false);

  // tablet: draw the PDF pages once the file is here
  useEffect(() => {
    if (!url || !isPdf || native || !pagesRef.current) return undefined;
    const box = pagesRef.current;
    box.innerHTML = '';
    let job = null; let alive = true;
    const width = Math.min(box.clientWidth - 24, 1000);
    renderPdf(url, box, { width, onPage: (i, n) => alive && setProgress({ i, n }) })
      .then(j => { job = j; if (!alive) j.cancel(); else setProgress(null); })
      .catch(e => alive && setErr(e.message || 'PDF illisible'));
    return () => { alive = false; job?.cancel(); };
  }, [url, isPdf, native]);

  useEffect(() => {
    let alive = true; let made = null;
    fetchDocUrl(doc).then(u => { made = u; if (alive) setUrl(u); else URL.revokeObjectURL(u); }).catch(e => alive && setErr(e.message));
    return () => { alive = false; if (made) setTimeout(() => URL.revokeObjectURL(made), 60000); };
  }, [doc]);
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  // always A4: pages rendered at print quality, then the page's own print
  const print = async () => {
    if (!url) return;
    setPrinting(true);
    try { await printA4(url, doc.contentType); }
    catch (e) { setErr(e.message || 'Impression impossible'); }
    finally { setPrinting(false); }
  };
  const download = () => {
    if (!url) return;
    const a = document.createElement('a'); a.href = url; a.download = doc.name; document.body.appendChild(a); a.click(); a.remove();
  };

  return createPortal(
    <div className="pdv-overlay" onClick={onClose}>
      <div className="pdv" onClick={e => e.stopPropagation()} role="dialog" aria-label={doc.name}>
        <div className="pdv__bar">
          {isPdf ? <FileText size={16} /> : <FileImage size={16} />}
          <strong title={doc.name}>{doc.name}</strong>
          <button type="button" className="pdv__btn pdv__btn--primary" onClick={print} disabled={!url || printing}>{printing ? <LoaderCircle size={15} className="td-spin" /> : <Printer size={15} />}{t('pdocPrint')}</button>
          <button type="button" className="pdv__btn" onClick={download} disabled={!url}><Download size={15} />{t('tdDownload')}</button>
          <button type="button" className="pdv__btn" onClick={() => url && window.open(url, '_blank')} disabled={!url} title={t('pdocNewTab')}><ExternalLink size={15} /></button>
          <button type="button" className="pdv__btn pdv__x" onClick={onClose} aria-label={t('close')}><X size={17} /></button>
        </div>
        <div className="pdv__body">
          {err ? <div className="td-error"><AlertTriangle size={14} />{err}</div>
            : !url ? <LoaderCircle size={22} className="td-spin" />
              : isPdf && native ? <iframe ref={frameRef} src={url} title={doc.name} className="pdv__frame" />
              : isPdf ? (
                <div className="pdv__pages-wrap">
                  {progress && progress.i < progress.n && <div className="pdv__progress"><LoaderCircle size={14} className="td-spin" /> {t('pdocPages', { i: progress.i, n: progress.n })}</div>}
                  <div className="pdv__pages" ref={pagesRef} />
                </div>
              )
                : <img src={url} alt={doc.name} className="pdv__img" />}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function ProjectDocuments({ project }) {
  const { t } = useLanguage();
  const [docs, setDocs] = useState(null); // null = loading
  const [canManage, setCanManage] = useState(false);
  const [storage, setStorage] = useState(null); // admin only
  const [uploading, setUploading] = useState(null);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const [viewing, setViewing] = useState(null); // document open in the in-app viewer
  const input = useRef(null);
  const projectId = project?.id || project?._id;

  const load = useCallback(() => {
    if (!projectId) return;
    axios.get(`${API_URL}/projects/${projectId}/documents`)
      .then(r => { setDocs(r.data.documents || []); setCanManage(!!r.data.canManage); setStorage(r.data.storage || null); })
      .catch(e => { setDocs([]); setError(errorMessage(e, t('dlgError'))); });
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const upload = async (files) => {
    setError('');
    for (const original of Array.from(files || [])) {
      if (!/^(application\/pdf|image\/(jpeg|png|webp))$/.test(original.type) && !/\.(pdf|jpe?g|png|webp)$/i.test(original.name)) {
        setError(t('tdBadType', { name: original.name })); continue;
      }
      setUploading({ name: original.name, pct: 0, step: 'compress' });
      const file = await compressImage(original);
      if (file.size > MAX_BYTES) { setError(t('tdTooBig', { name: original.name })); continue; }
      setUploading({ name: file.name, pct: 0, step: 'send' });
      try {
        const r = await axios.post(`${API_URL}/projects/${projectId}/documents`, file, {
          params: { name: file.name },
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          onUploadProgress: (p) => setUploading(u => (u ? { ...u, pct: p.total ? Math.round((p.loaded / p.total) * 100) : 0 } : u)),
        });
        const { storage: st, ...doc } = r.data;
        if (st && storage) setStorage(st);
        setDocs(d => [doc, ...(d || [])]);
      } catch (e) {
        if (e.response?.data?.storage && storage) setStorage(e.response.data.storage);
        setError(errorMessage(e, t('tdUploadError')));
        if (e.response?.status === 507) break;
      }
    }
    setUploading(null);
  };

  const remove = async (doc) => {
    if (!(await dialog.confirm({ title: t('deleteTitle'), message: t('tdDeleteConfirm', { name: doc.name }), danger: true, confirmLabel: t('deleteAction') }))) return;
    try {
      const r = await axios.delete(`${API_URL}/project-documents/${doc.id}`);
      if (r.data?.storage && storage) setStorage(r.data.storage);
      setDocs(d => d.filter(x => x.id !== doc.id));
    } catch (e) { dialog.alert(errorMessage(e, t('dlgError'))); }
  };

  const full = !!storage?.full;
  return (
    <div className={`pdoc${drag ? ' is-drag' : ''}`}
      onDragOver={e => { if (canManage) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); if (canManage && !uploading && !full) upload(e.dataTransfer.files); }}>
      <div className="pdoc__head">
        <div>
          <h3>{t('pdocTitle')}<span>{docs ? docs.length : '…'}</span></h3>
          <p>{t('pdocHint')}</p>
        </div>
        {canManage && (
          <>
            <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={e => { upload(e.target.files); e.target.value = ''; }} />
            <button type="button" className="td-btn" disabled={!!uploading || full} onClick={() => input.current?.click()}>
              <Upload size={14} />{t('pdocAdd')}
            </button>
          </>
        )}
      </div>

      {/* admin: space left on the projects' Cloudflare account */}
      {storage && <StorageGauge storage={storage} labelKey="pdocStorage" />}
      {storage?.full
        ? <div className="td-error"><AlertTriangle size={14} />{t('tdStorageFull')}</div>
        : storage && storage.used >= storage.warnAt && <div className="td-warn"><AlertTriangle size={14} />{t('tdStorageWarn')}</div>}
      {error && <div className="td-error"><AlertTriangle size={14} />{error}</div>}

      {uploading && (
        <div className="td-progress">
          <LoaderCircle size={14} className="td-spin" /><span>{uploading.step === 'compress' ? t('tdCompressing', { name: uploading.name }) : uploading.name}</span>
          <div className="td-progress__bar"><i style={{ width: `${uploading.pct}%` }} /></div><strong>{uploading.pct}%</strong>
        </div>
      )}

      {docs === null ? (
        <div className="pdoc__empty"><LoaderCircle size={18} className="td-spin" /></div>
      ) : docs.length === 0 ? (
        <div className="pdoc__empty"><FolderOpen size={22} /><strong>{t('pdocEmpty')}</strong>{canManage && <span>{t('pdocEmptySub')}</span>}</div>
      ) : (
        <ul className="td-list pdoc__list">
          {docs.map(d => {
            const Icon = d.contentType === 'application/pdf' ? FileText : FileImage;
            return (
              <li key={d.id}>
                <span className="pdoc__icon"><Icon size={18} /></span>
                <span className="td-file__txt pdoc__txt">
                  <strong title={d.name}>{d.name}</strong>
                  <span>{fmtSize(d.size)} · {new Date(d.uploadedAt).toLocaleDateString('fr-FR')}{d.uploadedBy ? ` · ${d.uploadedBy}` : ''}</span>
                </span>
                <button type="button" className="pdoc__view" onClick={() => setViewing(d)}><Eye size={14} />{t('tdView')}</button>
                <PrintBtn doc={d} t={t} />
                <button type="button" className="td-icon" onClick={() => openProjectDoc(d, { download: true })} title={t('tdDownload')} aria-label={t('tdDownload')}><Download size={15} /></button>
                {canManage && <button type="button" className="td-icon td-icon--danger" onClick={() => remove(d)} title={t('deleteAction')} aria-label={t('deleteAction')}><Trash2 size={15} /></button>}
              </li>
            );
          })}
        </ul>
      )}
      {viewing && <DocViewer doc={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function PrintBtn({ doc, t, className = 'td-icon', size = 15 }) {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className={className} disabled={busy} title={t('pdocPrint')} aria-label={t('pdocPrint')}
      onClick={async (e) => { e.stopPropagation(); setBusy(true); try { await printProjectDoc(doc); } finally { setBusy(false); } }}>
      {busy ? <LoaderCircle size={size} className="td-spin" /> : <Printer size={size} />}
    </button>
  );
}
export { PrintBtn };
