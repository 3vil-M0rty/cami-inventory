// « Documents » tab of a project: plans, devis signés, photos… stored on the projects' Cloudflare R2 account.
// Only names and sizes are loaded; a file is downloaded from R2 when « Voir » / « Télécharger » is clicked.
import React, { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { FileText, FileImage, Upload, Eye, Download, Trash2, LoaderCircle, AlertTriangle, FolderOpen } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import { dialog, errorMessage } from '../../../components/common/dialog';
import { StorageGauge, compressImage, fmtSize } from '../../orders/TrackingDocuments';
import '../../orders/TrackingDocuments.css';
import './ProjectDocuments.css';

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

export default function ProjectDocuments({ project }) {
  const { t } = useLanguage();
  const [docs, setDocs] = useState(null); // null = loading
  const [canManage, setCanManage] = useState(false);
  const [storage, setStorage] = useState(null); // admin only
  const [uploading, setUploading] = useState(null);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
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
                <button type="button" className="pdoc__view" onClick={() => openProjectDoc(d)}><Eye size={14} />{t('tdView')}</button>
                <button type="button" className="td-icon" onClick={() => openProjectDoc(d, { download: true })} title={t('tdDownload')} aria-label={t('tdDownload')}><Download size={15} /></button>
                {canManage && <button type="button" className="td-icon td-icon--danger" onClick={() => remove(d)} title={t('deleteAction')} aria-label={t('deleteAction')}><Trash2 size={15} /></button>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
