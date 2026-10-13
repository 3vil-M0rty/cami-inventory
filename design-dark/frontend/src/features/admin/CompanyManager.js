/**
 * CompanyManager.jsx
 * Full CRUD management panel for companies (CAMI, GIMAV, etc.)
 * Used in the admin / settings section of the platform.
 *
 * Props: none — reads API_URL from process.env.REACT_APP_API_URL
 *
 * Usage:
 *   import CompanyManager from './CompanyManager';
 *   <CompanyManager />
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { dialog } from '../../components/common/dialog';
import './AdminPage.css';

const Ico = ({ d, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d.map((p, i) => <path key={i} d={p} />)}
  </svg>
);
const IC = {
  pin:   ['M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z', 'M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
  phone: ['M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z'],
  mail:  ['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M22 6l-10 7L2 6'],
  image: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z', 'M21 15l-5-5L5 21'],
  edit:  ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6'],
  x:     ['M18 6 6 18', 'M6 6l12 12'],
  build: ['M3 21h18', 'M5 21V7l7-4 7 4v14', 'M9 9h1', 'M14 9h1', 'M9 13h1', 'M14 13h1', 'M9 17h6'],
  info:  ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 16v-4', 'M12 8h.01'],
};

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

// ─── helpers ──────────────────────────────────────────────────────────────────

function resolveLogoUrl(logo) {
  if (!logo) return '';
  if (logo.startsWith('http')) return logo;
  const base = API_URL.replace('/api', '');
  return `${base}${logo}`;
}

function authHeaders() {
  // the app stores its session token as 'auth_token'
  const token =
    localStorage.getItem('auth_token') ||
    localStorage.getItem('token') ||
    sessionStorage.getItem('token') ||
    '';
  return token ? { 'x-auth-token': token, 'Content-Type': 'application/json' }
               : { 'Content-Type': 'application/json' };
}

// ─── empty form state ─────────────────────────────────────────────────────────

const EMPTY = {
  name:    '',
  address: '',
  phone:   '',
  email:   '',
  logo:    '',
  rc:      '',
  ice:     '',
  color:   '#1a1a1a',
};

// ─── CompanyCard ──────────────────────────────────────────────────────────────

function CompanyCard({ company, onEdit, onDelete }) {
  const { t } = useLanguage();
  const logoUrl = resolveLogoUrl(company.logo);
  return (
    <div className="cm-card">
      {/* colour stripe */}
      <div className="cm-card-stripe" style={{ background: company.color || '#1a1a1a' }} />

      <div className="cm-card-body">
        {/* logo / initials */}
        <div className="cm-logo-wrap">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={company.name}
              className="cm-logo"
              onError={e => { e.target.style.display = 'none'; }}
            />
          ) : (
            <div className="cm-logo-fallback" style={{ background: company.color || '#1a1a1a' }}>
              {(company.name || '?').charAt(0)}
            </div>
          )}
        </div>

        {/* details */}
        <div className="cm-card-info">
          <div className="cm-card-name">{company.name}</div>
          {company.address && <div className="cm-card-meta"><Ico d={IC.pin} size={13} /> {company.address}</div>}
          {company.phone   && <div className="cm-card-meta"><Ico d={IC.phone} size={13} /> {company.phone}</div>}
          {company.email   && <div className="cm-card-meta"><Ico d={IC.mail} size={13} /> {company.email}</div>}
          {company.rc      && <div className="cm-card-meta">RC : {company.rc}</div>}
          {company.ice     && <div className="cm-card-meta">ICE : {company.ice}</div>}
          {company.logo    && <div className="cm-card-meta cm-card-meta--logo"><Ico d={IC.image} size={12} /> {company.logo}</div>}
        </div>

        {/* actions */}
        <div className="cm-card-actions">
          <button className="cm-edit-btn" onClick={() => onEdit(company)}><Ico d={IC.edit} size={13} /> {t('coEdit')}</button>
          <button className="cm-delete-btn" onClick={() => onDelete(company)}><Ico d={IC.trash} size={13} /> {t('coDelete')}</button>
        </div>
      </div>
    </div>
  );
}

// ─── CompanyForm (modal) ──────────────────────────────────────────────────────

function CompanyForm({ initial, onSave, onCancel, saving }) {
  const { t } = useLanguage();
  const [form, setForm] = useState(initial || EMPTY);
  const [previewError, setPreviewError] = useState(false);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const logoPreview = resolveLogoUrl(form.logo);

  const handleSubmit = e => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave(form);
  };

  return (
    <div className="cm-overlay" onClick={onCancel}>
      <div className="cm-modal" onClick={e => e.stopPropagation()}>
        <div className="cm-modal-header">
          <h2 className="cm-modal-title">
            {initial?.id ? t('coEditTitle') : t('coNewTitle')}
          </h2>
          <button className="cm-close-btn" onClick={onCancel}><Ico d={IC.x} size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="cm-form">

          {/* Name + Color */}
          <div className="cm-row">
            <div className="cm-group" style={{ flex: 1 }}>
              <label className="cm-label">{t('coName')} <span className="cm-req">*</span></label>
              <input
                className="cm-input"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder={t('coNamePh')}
                required
              />
            </div>
            <div className="cm-group">
              <label className="cm-label">{t('coColor')}</label>
              <div className="cm-color-row">
                <input
                  type="color"
                  className="cm-color-input"
                  value={form.color || '#1a1a1a'}
                  onChange={e => set('color', e.target.value)}
                />
                <span className="cm-color-hex">{form.color || '#1a1a1a'}</span>
              </div>
            </div>
          </div>

          {/* Logo URL */}
          <div className="cm-group">
            <label className="cm-label">{t('coLogo')}</label>
            <input
              className="cm-input"
              value={form.logo}
              onChange={e => { set('logo', e.target.value); setPreviewError(false); }}
              placeholder={t('coLogoPh')}
            />
            {/* live preview */}
            {form.logo && !previewError && (
              <div className="cm-logo-preview-wrap">
                <img
                  src={logoPreview}
                  alt="preview"
                  className="cm-logo-preview"
                  onError={() => setPreviewError(true)}
                />
                <span className="cm-logo-preview-label">{t('coPreview')}</span>
              </div>
            )}
            {previewError && (
              <div className="cm-logo-error">{t('coLogoNotFound')}</div>
            )}
            <div className="cm-hint">
              {t('coLogoHint')}
            </div>
          </div>

          {/* Address */}
          <div className="cm-group">
            <label className="cm-label">{t('coAddress')}</label>
            <input
              className="cm-input"
              value={form.address}
              onChange={e => set('address', e.target.value)}
              placeholder={t('coAddressPh')}
            />
          </div>

          {/* Phone + Email */}
          <div className="cm-row">
            <div className="cm-group" style={{ flex: 1 }}>
              <label className="cm-label">{t('coPhone')}</label>
              <input
                className="cm-input"
                value={form.phone}
                onChange={e => set('phone', e.target.value)}
                placeholder="+212 5XX-XXXXXX"
              />
            </div>
            <div className="cm-group" style={{ flex: 1 }}>
              <label className="cm-label">{t('coEmail')}</label>
              <input
                className="cm-input"
                type="email"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder="contact@societe.ma"
              />
            </div>
          </div>

          {/* RC + ICE */}
          <div className="cm-row">
            <div className="cm-group" style={{ flex: 1 }}>
              <label className="cm-label">{t('coRc')}</label>
              <input
                className="cm-input"
                value={form.rc}
                onChange={e => set('rc', e.target.value)}
                placeholder={t('coExample', { v: '123456' })}
              />
            </div>
            <div className="cm-group" style={{ flex: 1 }}>
              <label className="cm-label">{t('coIce')}</label>
              <input
                className="cm-input"
                value={form.ice}
                onChange={e => set('ice', e.target.value)}
                placeholder={t('coExample', { v: '000123456789012' })}
              />
            </div>
          </div>

          {/* BL preview strip */}
          <div className="cm-bl-preview">
            <div className="cm-bl-caption">
              {t('coBlPreview')}
            </div>
            <div className="cm-bl-strip" style={{ borderColor: form.color || '#1a1a1a' }}>
              <div className="cm-bl-left">
                {form.logo && !previewError ? (
                  <img src={logoPreview} alt="" className="cm-bl-logo" />
                ) : (
                  <div className="cm-logo-fallback" style={{ width: 36, height: 36, fontSize: 18, background: form.color || '#1a1a1a' }}>
                    {(form.name || '?').charAt(0)}
                  </div>
                )}
                <div>
                  <div className="cm-bl-name" style={{ color: form.color || '#1a1a1a' }}>{form.name || t('coNamePlaceholder')}</div>
                  {form.address && <div className="cm-bl-meta">{form.address}</div>}
                  {form.phone   && <div className="cm-bl-meta">{t('coTel', { v: form.phone })}</div>}
                </div>
              </div>
              <div className="cm-bl-right">
                <div className="cm-bl-doc">{t('coBl')}</div>
                <div className="cm-bl-num">BL-XXXXXX</div>
              </div>
            </div>
          </div>

          {/* actions */}
          <div className="cm-form-actions">
            <button type="button" className="cm-cancel-btn" onClick={onCancel} disabled={saving}>
              {t('cancel')}
            </button>
            <button type="submit" className="cm-save-btn" disabled={saving || !form.name.trim()}>
              {saving ? t('coSaving') : (initial?.id ? t('coUpdate') : t('coCreate'))}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main CompanyManager ──────────────────────────────────────────────────────

export default function CompanyManager() {
  const { t } = useLanguage();
  const [companies, setCompanies] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [showForm,  setShowForm]  = useState(false);
  const [editing,   setEditing]   = useState(null);   // company object being edited
  const [saving,    setSaving]    = useState(false);

  // ── load ──
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`${API_URL}/companies`, { headers: authHeaders() });
      if (!r.ok) throw new Error(await r.text());
      setCompanies(await r.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── save (create or update) ──
  const handleSave = async (form) => {
    setSaving(true);
    try {
      let r;
      if (editing?.id) {
        r = await fetch(`${API_URL}/companies/${editing.id}`, {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify(form),
        });
      } else {
        r = await fetch(`${API_URL}/companies`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify(form),
        });
      }
      if (!r.ok) throw new Error((await r.json()).error || t('errSave'));
      setShowForm(false);
      setEditing(null);
      await load();
      dialog.toast(editing?.id ? t('coUpdated') : t('coCreated'));
    } catch (e) {
      dialog.alert(e.message || t('errSave'));
    } finally {
      setSaving(false);
    }
  };

  // ── delete ──
  const handleDelete = async (company) => {
    const ok = await dialog.confirm({
      title: t('coDeleteTitle'), message: t('coDeleteConfirm', { name: company.name }),
      details: t('coDeleteDetails'), danger: true, confirmLabel: t('deleteAction'),
    });
    if (!ok) return;
    try {
      const r = await fetch(`${API_URL}/companies/${company.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!r.ok) throw new Error((await r.json()).error || t('errDelete'));
      await load();
      dialog.toast(t('coDeleted'));
    } catch (e) {
      dialog.alert(e.message || t('errDelete'));
    }
  };

  // ── open edit form ──
  const openEdit = (company) => {
    setEditing(company);
    setShowForm(true);
  };

  // ── close form ──
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };

  // ── render ──
  return (
    <div className="cm-container">
      {/* header */}
      <div className="cm-header">
        <div>
          <h2 className="cm-title"><span className="cm-title-icon"><Ico d={IC.build} size={18} /></span>{t('coTitle')}</h2>
          <p className="cm-subtitle">
            {t('coSubtitle')}
          </p>
        </div>
        <button className="cm-add-btn" onClick={() => { setEditing(null); setShowForm(true); }}>
          {t('coNew')}
        </button>
      </div>

      {/* loading / error */}
      {loading && <div className="cm-centered">{t('loadingShort')}</div>}
      {error   && <div className="cm-err-banner">{error} <button className="cm-retry" onClick={load}>{t('coRetry')}</button></div>}

      {/* list */}
      {!loading && !error && (
        <>
          {companies.length === 0 ? (
            <div className="cm-empty">
              <div className="cm-empty-icon"><Ico d={IC.build} size={20} /></div>
              <p>{t('coNone')}</p>
              <button className="cm-add-btn" onClick={() => setShowForm(true)}>{t('coAddFirst')}</button>
            </div>
          ) : (
            <div className="cm-list">
              {companies.map(c => (
                <CompanyCard
                  key={c.id}
                  company={c}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}

          {/* info box about logo files */}
          <div className="cm-info-box">
            <Ico d={IC.info} size={15} /><span><strong>{t('coLocalLogos')}</strong> {t('coLocalLogosText')}</span>
          </div>
        </>
      )}

      {/* modals */}
      {showForm && (
        <CompanyForm
          initial={editing ? { ...editing } : null}
          onSave={handleSave}
          onCancel={closeForm}
          saving={saving}
        />
      )}
    </div>
  );
}
