import { useState, useEffect } from 'react';
import axios from 'axios';
import { useLanguage } from '../../../context/LanguageContext';
import { dialog, errorMessage } from '../../../components/common/dialog';

import { X, Check } from 'lucide-react';
const API = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

/**
 * CompanySettings
 * Drop-in component for the admin/settings page.
 * Lets users edit both companies (CAMI & GIMAV) including logo URL,
 * address, phone, email, RC, ICE, and brand color.
 */
export default function CompanySettings() {
  const { t } = useLanguage();

  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null); // company id being saved
  const [forms, setForms] = useState({});   // { [id]: { ...fields } }
  const [saved, setSaved] = useState({});   // { [id]: true } flash

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/companies`);
        setCompanies(res.data);
        const initial = {};
        res.data.forEach(c => {
          initial[c.id] = {
            name: c.name || '',
            address: c.address || '',
            phone: c.phone || '',
            email: c.email || '',
            logo: c.logo || '',
            rc: c.rc || '',
            ice: c.ice || '',
            color: c.color || '#ce0000',
          };
        });
        setForms(initial);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  const getLogoUrl = (logo) => {
    if (!logo) return '';
    // If the logo is already an absolute URL, return it as is
    if (logo.startsWith('http')) return logo;
    // Otherwise, prepend the backend base URL
    return `${API.replace('/api', '')}${logo}`;
  };
  const set = (id, field, value) =>
    setForms(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

  const handleSave = async (id) => {
    setSaving(id);
    try {
      await axios.put(`${API}/companies/${id}`, forms[id]);
      setSaved(prev => ({ ...prev, [id]: true }));
      setTimeout(() => setSaved(prev => ({ ...prev, [id]: false })), 2000);
    } catch (e) {
      await dialog.alert(t('lqCsSaveError', { msg: errorMessage(e, '') }));
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <div style={{ padding: 32, color: 'var(--text-3)' }}>{t('loadingShort')}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {companies.map(c => {
        const f = forms[c.id] || {};
        const isSaving = saving === c.id;
        const isSaved = saved[c.id];

        return (
          <div key={c.id} style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            overflow: 'hidden',
          }}>
            {/* Card header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '14px 20px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--surface-2)',
            }}>
              {/* Logo preview */}
              <div style={{
                width: 44, height: 44, borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden', flexShrink: 0,
              }}>
                {f.logo
                  ? <img src={getLogoUrl(f.logo)} alt={t('lqCsLogoAlt')} style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; }} />
                  : <span style={{ fontSize: 20, color: f.color || 'var(--text)', fontWeight: 700 }}>{(f.name || '?')[0]}</span>
                }
              </div>
              <div>
                <div style={{ fontWeight: 500, fontSize: 15, color: 'var(--text)' }}>{f.name || c.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>{t('lqCsSettings')}</div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                {isSaved && (
                  <span style={{ fontSize: 13, color: 'var(--success)', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Check size={14} /> {t('lqCsSaved')}</span>
                )}
                <button
                  onClick={() => handleSave(c.id)}
                  disabled={isSaving}
                  style={{
                    padding: '6px 16px', borderRadius: 7, border: 'none',
                    background: f.color || '#1a1a1a', color: '#fff',
                    fontWeight: 500, fontSize: 13, cursor: isSaving ? 'not-allowed' : 'pointer',
                    opacity: isSaving ? 0.7 : 1,
                  }}
                >
                  {isSaving ? t('lqCsSaving') : t('save')}
                </button>
              </div>
            </div>

            {/* Fields */}
            <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px' }}>

              {/* Logo URL — full width */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>{t('lqCsLogo')}</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    style={inputStyle}
                    type="url"
                    placeholder={t('lqCsLogoPh')}
                    value={getLogoUrl(f.logo) || ''}
                    onChange={e => set(c.id, 'logo', e.target.value)}
                  />
                  {f.logo && (
                    <button
                      onClick={() => set(c.id, 'logo', '')}
                      style={{ padding: '0 10px', height: 36, border: '1px solid var(--border-2)', borderRadius: 7, background: 'transparent', cursor: 'pointer', color: 'var(--text-3)', fontSize: 13 }}
                    ><X size={14} /></button>
                  )}
                </div>
                {f.logo && (
                  <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <img src={getLogoUrl(f.logo)} alt={t('lqCsPreview')} style={{ height: 32, maxWidth: 120, objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; }} />
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('lqCsPreview')}</span>
                  </div>
                )}
              </div>

              <div>
                <label style={labelStyle}>{t('lqCsName')}</label>
                <input style={inputStyle} value={f.name} onChange={e => set(c.id, 'name', e.target.value)} />
              </div>

              <div>
                <label style={labelStyle}>{t('lqCsColor')}</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="color" value={f.color} onChange={e => set(c.id, 'color', e.target.value)}
                    style={{ width: 36, height: 36, padding: 2, border: '1px solid var(--border-2)', borderRadius: 7, cursor: 'pointer' }} />
                  <input style={{ ...inputStyle, flex: 1 }} value={f.color} onChange={e => set(c.id, 'color', e.target.value)} placeholder="#1a1a1a" />
                </div>
              </div>

              <div>
                <label style={labelStyle}>{t('lqCsAddress')}</label>
                <input style={inputStyle} value={f.address} onChange={e => set(c.id, 'address', e.target.value)} placeholder={t('lqCsAddressPh')} />
              </div>

              <div>
                <label style={labelStyle}>{t('lqCsPhone')}</label>
                <input style={inputStyle} value={f.phone} onChange={e => set(c.id, 'phone', e.target.value)} placeholder="+212 5xx xxx xxx" />
              </div>

              <div>
                <label style={labelStyle}>{t('lqCsEmail')}</label>
                <input style={inputStyle} type="email" value={f.email} onChange={e => set(c.id, 'email', e.target.value)} placeholder={t('lqCsEmailPh')} />
              </div>

              <div>
                <label style={labelStyle}>{t('lqCsRc')}</label>
                <input style={inputStyle} value={f.rc} onChange={e => set(c.id, 'rc', e.target.value)} placeholder="RC 12345" />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>ICE</label>
                <input style={inputStyle} value={f.ice} onChange={e => set(c.id, 'ice', e.target.value)} placeholder="000 000 000 00000" />
              </div>

            </div>
          </div>
        );
      })}
    </div>
  );
}

const labelStyle = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--text-3)',
  marginBottom: 5,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const inputStyle = {
  width: '100%',
  height: 36,
  padding: '0 10px',
  border: '1px solid var(--border-2)',
  borderRadius: 7,
  fontSize: 13,
  background: 'var(--surface-2)',
  color: 'var(--text)',
  boxSizing: 'border-box',
};