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

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

// ─── helpers ──────────────────────────────────────────────────────────────────

function resolveLogoUrl(logo) {
  if (!logo) return '';
  if (logo.startsWith('http')) return logo;
  const base = API_URL.replace('/api', '');
  return `${base}${logo}`;
}

function authHeaders() {
  const token =
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
  const logoUrl = resolveLogoUrl(company.logo);
  return (
    <div style={styles.card}>
      {/* colour stripe */}
      <div style={{ ...styles.cardStripe, background: company.color || '#1a1a1a' }} />

      <div style={styles.cardBody}>
        {/* logo / initials */}
        <div style={styles.logoWrap}>
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={company.name}
              style={styles.logo}
              onError={e => { e.target.style.display = 'none'; }}
            />
          ) : (
            <div style={{ ...styles.logoFallback, background: company.color || '#1a1a1a' }}>
              {(company.name || '?').charAt(0)}
            </div>
          )}
        </div>

        {/* details */}
        <div style={styles.cardInfo}>
          <div style={styles.cardName}>{company.name}</div>
          {company.address && <div style={styles.cardMeta}>📍 {company.address}</div>}
          {company.phone   && <div style={styles.cardMeta}>📞 {company.phone}</div>}
          {company.email   && <div style={styles.cardMeta}>✉️ {company.email}</div>}
          {company.rc      && <div style={styles.cardMeta}>RC : {company.rc}</div>}
          {company.ice     && <div style={styles.cardMeta}>ICE : {company.ice}</div>}
          {company.logo    && <div style={{ ...styles.cardMeta, color: '#9ca3af', fontSize: 11 }}>🖼 {company.logo}</div>}
        </div>

        {/* actions */}
        <div style={styles.cardActions}>
          <button style={styles.editBtn} onClick={() => onEdit(company)}>✏️ Modifier</button>
          <button style={styles.deleteBtn} onClick={() => onDelete(company)}>🗑 Supprimer</button>
        </div>
      </div>
    </div>
  );
}

// ─── CompanyForm (modal) ──────────────────────────────────────────────────────

function CompanyForm({ initial, onSave, onCancel, saving }) {
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
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>
            {initial?.id ? '✏️ Modifier la société' : '🏢 Nouvelle société'}
          </h2>
          <button style={styles.closeBtn} onClick={onCancel}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>

          {/* Name + Color */}
          <div style={styles.row}>
            <div style={{ ...styles.group, flex: 1 }}>
              <label style={styles.label}>Nom <span style={styles.req}>*</span></label>
              <input
                style={styles.input}
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="ex: CAMI"
                required
              />
            </div>
            <div style={styles.group}>
              <label style={styles.label}>Couleur</label>
              <div style={styles.colorRow}>
                <input
                  type="color"
                  style={styles.colorInput}
                  value={form.color || '#1a1a1a'}
                  onChange={e => set('color', e.target.value)}
                />
                <span style={styles.colorHex}>{form.color || '#1a1a1a'}</span>
              </div>
            </div>
          </div>

          {/* Logo URL */}
          <div style={styles.group}>
            <label style={styles.label}>Logo (chemin ou URL)</label>
            <input
              style={styles.input}
              value={form.logo}
              onChange={e => { set('logo', e.target.value); setPreviewError(false); }}
              placeholder="ex: /cami.png  ou  https://..."
            />
            {/* live preview */}
            {form.logo && !previewError && (
              <div style={styles.logoPreviewWrap}>
                <img
                  src={logoPreview}
                  alt="preview"
                  style={styles.logoPreview}
                  onError={() => setPreviewError(true)}
                />
                <span style={styles.logoPreviewLabel}>Aperçu</span>
              </div>
            )}
            {previewError && (
              <div style={styles.logoError}>⚠️ Image introuvable à cette URL</div>
            )}
            <div style={styles.hint}>
              Pour les logos servis localement, placez le fichier dans <code>backend/public/</code> et entrez <code>/nom-fichier.png</code>
            </div>
          </div>

          {/* Address */}
          <div style={styles.group}>
            <label style={styles.label}>Adresse</label>
            <input
              style={styles.input}
              value={form.address}
              onChange={e => set('address', e.target.value)}
              placeholder="ex: Zone Industrielle, Marrakech, Maroc"
            />
          </div>

          {/* Phone + Email */}
          <div style={styles.row}>
            <div style={{ ...styles.group, flex: 1 }}>
              <label style={styles.label}>Téléphone</label>
              <input
                style={styles.input}
                value={form.phone}
                onChange={e => set('phone', e.target.value)}
                placeholder="+212 5XX-XXXXXX"
              />
            </div>
            <div style={{ ...styles.group, flex: 1 }}>
              <label style={styles.label}>Email</label>
              <input
                style={styles.input}
                type="email"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder="contact@societe.ma"
              />
            </div>
          </div>

          {/* RC + ICE */}
          <div style={styles.row}>
            <div style={{ ...styles.group, flex: 1 }}>
              <label style={styles.label}>RC (Registre de commerce)</label>
              <input
                style={styles.input}
                value={form.rc}
                onChange={e => set('rc', e.target.value)}
                placeholder="ex: 123456"
              />
            </div>
            <div style={{ ...styles.group, flex: 1 }}>
              <label style={styles.label}>ICE</label>
              <input
                style={styles.input}
                value={form.ice}
                onChange={e => set('ice', e.target.value)}
                placeholder="ex: 000123456789012"
              />
            </div>
          </div>

          {/* BL preview strip */}
          <div style={styles.blPreview}>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Aperçu entête Bon de Livraison
            </div>
            <div style={{ ...styles.blStrip, borderColor: form.color || '#1a1a1a' }}>
              <div style={styles.blLeft}>
                {form.logo && !previewError ? (
                  <img src={logoPreview} alt="" style={{ height: 36, objectFit: 'contain' }} />
                ) : (
                  <div style={{ ...styles.logoFallback, width: 36, height: 36, fontSize: 18, background: form.color || '#1a1a1a' }}>
                    {(form.name || '?').charAt(0)}
                  </div>
                )}
                <div>
                  <div style={{ fontWeight: 800, color: form.color || '#1a1a1a', fontSize: 15 }}>{form.name || 'Nom société'}</div>
                  {form.address && <div style={{ fontSize: 10, color: '#555' }}>{form.address}</div>}
                  {form.phone   && <div style={{ fontSize: 10, color: '#555' }}>Tél : {form.phone}</div>}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 9, color: '#999', textTransform: 'uppercase' }}>Bon de Livraison</div>
                <div style={{ fontSize: 18, fontWeight: 900 }}>BL-XXXXXX</div>
              </div>
            </div>
          </div>

          {/* actions */}
          <div style={styles.formActions}>
            <button type="button" style={styles.cancelBtn} onClick={onCancel} disabled={saving}>
              Annuler
            </button>
            <button type="submit" style={styles.saveBtn} disabled={saving || !form.name.trim()}>
              {saving ? '⏳ Enregistrement…' : (initial?.id ? '💾 Mettre à jour' : '➕ Créer la société')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── DeleteConfirm (modal) ────────────────────────────────────────────────────

function DeleteConfirm({ company, onConfirm, onCancel, deleting }) {
  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={{ ...styles.modal, maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <h2 style={{ ...styles.modalTitle, color: '#dc2626', marginBottom: 12 }}>🗑 Supprimer la société</h2>
        <p style={{ color: '#374151', marginBottom: 20 }}>
          Êtes-vous sûr de vouloir supprimer <strong>{company.name}</strong> ?<br />
          <span style={{ color: '#6b7280', fontSize: 13 }}>
            Cette action est irréversible. Les projets, devis et commandes liés à cette société ne seront pas supprimés mais perdront la référence société.
          </span>
        </p>
        <div style={styles.formActions}>
          <button style={styles.cancelBtn} onClick={onCancel} disabled={deleting}>Annuler</button>
          <button style={{ ...styles.saveBtn, background: '#dc2626' }} onClick={onConfirm} disabled={deleting}>
            {deleting ? '⏳ Suppression…' : '🗑 Confirmer la suppression'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main CompanyManager ──────────────────────────────────────────────────────

export default function CompanyManager() {
  const [companies, setCompanies] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [showForm,  setShowForm]  = useState(false);
  const [editing,   setEditing]   = useState(null);   // company object being edited
  const [deleting,  setDeleting]  = useState(null);   // company object to delete
  const [saving,    setSaving]    = useState(false);
  const [doingDel,  setDoingDel]  = useState(false);
  const [toast,     setToast]     = useState('');

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

  // ── toast helper ──
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

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
      if (!r.ok) throw new Error((await r.json()).error || 'Erreur');
      setShowForm(false);
      setEditing(null);
      await load();
      showToast(editing?.id ? '✅ Société mise à jour' : '✅ Société créée');
    } catch (e) {
      alert(`Erreur : ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ── delete ──
  const handleDelete = async () => {
    if (!deleting) return;
    setDoingDel(true);
    try {
      const r = await fetch(`${API_URL}/companies/${deleting.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!r.ok) throw new Error((await r.json()).error || 'Erreur');
      setDeleting(null);
      await load();
      showToast('✅ Société supprimée');
    } catch (e) {
      alert(`Erreur : ${e.message}`);
    } finally {
      setDoingDel(false);
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
    <div style={styles.container}>
      {/* header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>🏢 Gestion des sociétés</h1>
          <p style={styles.subtitle}>
            Gérez les informations des sociétés utilisées dans les Bons de Livraison, devis et projets.
          </p>
        </div>
        <button style={styles.addBtn} onClick={() => { setEditing(null); setShowForm(true); }}>
          + Nouvelle société
        </button>
      </div>

      {/* toast */}
      {toast && (
        <div style={styles.toast}>{toast}</div>
      )}

      {/* loading / error */}
      {loading && <div style={styles.centered}>Chargement…</div>}
      {error   && <div style={styles.errBanner}>❌ {error} <button onClick={load}>Réessayer</button></div>}

      {/* list */}
      {!loading && !error && (
        <>
          {companies.length === 0 ? (
            <div style={styles.empty}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🏢</div>
              <p>Aucune société enregistrée.</p>
              <button style={styles.addBtn} onClick={() => setShowForm(true)}>+ Ajouter la première société</button>
            </div>
          ) : (
            <div style={styles.list}>
              {companies.map(c => (
                <CompanyCard
                  key={c.id}
                  company={c}
                  onEdit={openEdit}
                  onDelete={setDeleting}
                />
              ))}
            </div>
          )}

          {/* info box about logo files */}
          <div style={styles.infoBox}>
            <strong>📁 Logos locaux :</strong> Placez vos fichiers image (PNG, SVG) dans le dossier{' '}
            <code style={styles.code}>backend/public/</code> de votre serveur, puis entrez le chemin{' '}
            <code style={styles.code}>/nom-fichier.png</code> dans le champ Logo.
            Les fichiers <code style={styles.code}>/cami.png</code> et{' '}
            <code style={styles.code}>/gimav.png</code> sont déjà pré-configurés.
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
      {deleting && (
        <DeleteConfirm
          company={deleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
          deleting={doingDel}
        />
      )}
    </div>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = {
  container: {
    maxWidth: 900,
    margin: '0 auto',
    padding: '32px 24px',
    fontFamily: "'Segoe UI', Arial, sans-serif",
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 28,
    gap: 16,
    flexWrap: 'wrap',
  },
  title: {
    fontSize: 24,
    fontWeight: 800,
    margin: 0,
    color: '#111827',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    margin: '4px 0 0',
  },
  addBtn: {
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 20px',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  card: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    overflow: 'hidden',
    display: 'flex',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  cardStripe: {
    width: 6,
    flexShrink: 0,
  },
  cardBody: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    padding: '16px 20px',
    gap: 20,
    flexWrap: 'wrap',
  },
  logoWrap: {
    flexShrink: 0,
    width: 64,
    height: 64,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f9fafb',
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    overflow: 'hidden',
  },
  logo: {
    maxWidth: 56,
    maxHeight: 56,
    objectFit: 'contain',
  },
  logoFallback: {
    width: 48,
    height: 48,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 24,
    fontWeight: 900,
    color: '#fff',
  },
  cardInfo: {
    flex: 1,
    minWidth: 0,
  },
  cardName: {
    fontSize: 18,
    fontWeight: 800,
    color: '#111827',
    marginBottom: 4,
  },
  cardMeta: {
    fontSize: 13,
    color: '#4b5563',
    marginTop: 2,
  },
  cardActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    flexShrink: 0,
  },
  editBtn: {
    background: '#f3f4f6',
    color: '#374151',
    border: '1px solid #e5e7eb',
    borderRadius: 7,
    padding: '7px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  deleteBtn: {
    background: '#fef2f2',
    color: '#dc2626',
    border: '1px solid #fecaca',
    borderRadius: 7,
    padding: '7px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  // Modal
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 16,
  },
  modal: {
    background: '#fff',
    borderRadius: 16,
    padding: 32,
    width: '100%',
    maxWidth: 640,
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 800,
    margin: 0,
    color: '#111827',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: 20,
    cursor: 'pointer',
    color: '#6b7280',
    padding: 4,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  row: {
    display: 'flex',
    gap: 14,
    flexWrap: 'wrap',
  },
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
  },
  req: {
    color: '#dc2626',
  },
  input: {
    border: '1.5px solid #d1d5db',
    borderRadius: 8,
    padding: '9px 12px',
    fontSize: 14,
    color: '#111827',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  colorRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  colorInput: {
    width: 48,
    height: 38,
    border: '1.5px solid #d1d5db',
    borderRadius: 8,
    cursor: 'pointer',
    padding: 2,
  },
  colorHex: {
    fontSize: 13,
    color: '#6b7280',
    fontFamily: 'monospace',
  },
  hint: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
  },
  logoPreviewWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: '8px 12px',
  },
  logoPreview: {
    maxHeight: 48,
    maxWidth: 120,
    objectFit: 'contain',
  },
  logoPreviewLabel: {
    fontSize: 11,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  logoError: {
    fontSize: 12,
    color: '#dc2626',
    marginTop: 4,
  },
  // BL preview
  blPreview: {
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    padding: '14px 16px',
  },
  blStrip: {
    background: '#fff',
    border: '1px solid',
    borderRadius: 8,
    padding: '12px 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTop: '3px solid',
  },
  blLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  // form actions
  formActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    background: '#f3f4f6',
    color: '#374151',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: '10px 20px',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
  },
  saveBtn: {
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 22px',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
  },
  // misc
  centered: {
    textAlign: 'center',
    padding: 40,
    color: '#6b7280',
  },
  errBanner: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 8,
    padding: '12px 16px',
    color: '#dc2626',
    marginBottom: 16,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  empty: {
    textAlign: 'center',
    padding: '48px 24px',
    color: '#6b7280',
  },
  toast: {
    position: 'fixed',
    bottom: 24,
    right: 24,
    background: '#111827',
    color: '#fff',
    borderRadius: 10,
    padding: '12px 20px',
    fontSize: 14,
    fontWeight: 600,
    zIndex: 2000,
    boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
  },
  infoBox: {
    marginTop: 24,
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: 10,
    padding: '14px 18px',
    fontSize: 13,
    color: '#1e40af',
    lineHeight: 1.7,
  },
  code: {
    background: '#dbeafe',
    borderRadius: 4,
    padding: '1px 5px',
    fontFamily: 'monospace',
    fontSize: 12,
  },
};