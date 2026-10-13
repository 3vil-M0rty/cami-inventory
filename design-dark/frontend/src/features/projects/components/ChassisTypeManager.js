/* eslint-disable no-unused-vars */
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  fetchChassisTypes, createChassisType, updateChassisType, deleteChassisType
} from './ChassisTypesConfig';
import './ChassisTypeManager.css';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { dialog, errorMessage } from '../../../components/common/dialog';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const EMPTY_FORM = { fr: '', it: '', en: '', composite: false, vantaux: 2 };

// Unit options for the accessory unit dropdown
const UNIT_OPTIONS = ['UN', 'ML', 'M²', 'M³', 'KG', 'L', 'PAIRE', 'JEU', 'ROULEAU'];

// Empty state for the add-accessory form inside AccessoryEditor
const EMPTY_NEW_ACC = { label: '', unit: 'UN', quantity: 1, formula: '', itemId: '', mode: 'fixed' };
// mode: 'fixed' | 'formula'

// ─── Inventory Autocomplete Input ─────────────────────────────────────────────
function InventoryAutocompleteInput({ value, onChange, onSelect, placeholder, categories }) {
  const { t } = useLanguage();
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const search = (q) => {
    clearTimeout(debounceRef.current);
    if (!q || q.length < 2) { setSuggestions([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q });
        if (categories && categories.length === 1) params.set('superCategory', categories[0]);
        const res = await axios.get(`${API_URL}/inventory/search?${params}`);
        const items = (res.data || []).filter(item => {
          if (!categories || categories.length === 0) return true;
          return categories.includes(item.superCategory);
        });
        setSuggestions(items.slice(0, 10));
        setOpen(items.length > 0);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 250);
  };

  const handleChange = (e) => {
    onChange(e.target.value);
    search(e.target.value);
  };

  const handleSelect = (item) => {
    const label = item.designation?.fr || item.designation || '';
    const unit = item.unit || '';
    const id = item.id || item._id;
    onSelect({ label, unit, itemId: id });
    setSuggestions([]);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative' }}>
        <span style={{
          position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)',
          fontSize: 15, color: 'var(--text-4)', pointerEvents: 'none', lineHeight: 1,
        }}>🔍</span>
        <input
          className="ct-acc-search-input"
          onFocus={() => {
            if (value.length >= 2 && suggestions.length > 0) setOpen(true);
          }}
          value={value}
          onChange={handleChange}
          placeholder={placeholder || t('ctSearchOrType')}
          autoComplete="off"
        />
        {loading ? (
          <span style={{
            position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)',
            fontSize: 12, color: 'var(--text-3)', fontWeight: 600,
          }}>⏳</span>
        ) : value && (
          <span
            style={{
              position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)',
              fontSize: 15, color: 'var(--text-3)', cursor: 'pointer', lineHeight: 1,
            }}
            onMouseDown={() => { onChange(''); setSuggestions([]); setOpen(false); }}
          >✕</span>
        )}
      </div>
      {open && suggestions.length > 0 && (
        <div className="ct-acc-dropdown">
          <div className="ct-acc-dropdown__header">
            {t('ctFound', { n: suggestions.length })}
          </div>
          {suggestions.map(item => {
            const id = item.id || item._id;
            const label = item.designation?.fr || item.designation || id;
            const unit = item.unit || '';
            return (
              <div
                key={id}
                onMouseDown={() => handleSelect(item)}
                className="ct-acc-dropdown__item"
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14 }}>📦</span>
                  <span>{label}</span>
                </span>
                {unit && <span className="ct-acc-dropdown__unit">{unit}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Accessory Editor ─────────────────────────────────────────────────────────
function AccessoryEditor({ chassisTypeId, chassisTypeName, onClose }) {
  const { t } = useLanguage();
  const [linked, setLinked] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [newAcc, setNewAcc] = useState(EMPTY_NEW_ACC);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const assocRes = await axios.get(
          `${API_URL}/chassis-type-accessories/${chassisTypeId}`
        ).catch(() => ({ data: [] }));
        const data = assocRes.data || [];
        setLinked(data.map(a => ({ ...a, mode: a.formula ? 'formula' : 'fixed' })));
      } catch {
        setError(t('ctLoadAccError'));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [chassisTypeId]);

  const updateLinked = (idx, key, val) =>
    setLinked(prev => prev.map((l, i) => i === idx ? { ...l, [key]: val } : l));

  const setMode = (idx, mode) =>
    setLinked(prev => prev.map((l, i) =>
      i === idx ? { ...l, mode, formula: mode === 'fixed' ? '' : l.formula } : l
    ));

  const removeLinked = (idx) =>
    setLinked(prev => prev.filter((_, i) => i !== idx));

  // Called when user submits the add form
  const handleAddNew = () => {
    if (!newAcc.label.trim()) return setError(t('ctAccNameReq'));
    setError('');
    const acc = {
      itemId: newAcc.itemId || `manual_${Date.now()}`,
      label: newAcc.label.trim(),
      unit: newAcc.unit || 'UN',
      quantity: newAcc.mode === 'fixed' ? (parseFloat(newAcc.quantity) || 1) : 0,
      formula: newAcc.mode === 'formula' ? newAcc.formula.trim() : '',
      mode: newAcc.mode,
    };
    setLinked(prev => [...prev, acc]);
    setNewAcc(EMPTY_NEW_ACC);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = linked.map(({ mode, ...rest }) => rest);
      await axios.put(`${API_URL}/chassis-type-accessories/${chassisTypeId}`, { accessories: payload });
      onClose();
    } catch (e) {
      setError(e.response?.data?.error || t('errSave'));
    } finally {
      setSaving(false);
    }
  };

  const setN = (key, val) => setNewAcc(prev => ({ ...prev, [key]: val }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal ct-acc-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="ct-manager__header">
          <h2>🔧 {t('ctAccTitle', { name: chassisTypeName })}</h2>
          <button className="chassis-form__close" onClick={onClose}>×</button>
        </div>

        {error && <div className="ct-manager__error">{error}</div>}

        {loading ? (
          <div className="ct-manager__loading">{t('loadingShort')}</div>
        ) : (
          <>
            <p className="ct-acc-hint">{t('ctAccHint')}</p>

            {/* ── Configured accessories table ── */}
            {linked.length > 0 ? (
              <div className="ct-acc-linked">
                <h3>✅ {t('ctConfigured', { n: linked.length })}</h3>
                <table className="proj-acc-table ct-acc-linked-table">
                  <thead>
                    <tr>
                      <th>{t('ctColDesignation')}</th>
                      <th style={{ width: 90 }}>{t('ctColUnit')}</th>
                      <th style={{ width: 80 }}>{t('ctColMode')}</th>
                      <th style={{ width: 110 }}>{t('ctColFixedQty')}</th>
                      <th style={{ width: 200 }}>{t('ctColFormula')}</th>
                      <th style={{ width: 40 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {linked.map((l, idx) => (
                      <tr key={idx}>
                        <td>
                          <input
                            className="ct-acc-qty-input"
                            style={{ width: '100%' }}
                            value={l.label}
                            onChange={e => updateLinked(idx, 'label', e.target.value)}
                            placeholder={t('ctAccNamePh')}
                          />
                        </td>
                        <td>
                          <select
                            className="ct-acc-unit-select"
                            value={l.unit || 'UN'}
                            onChange={e => updateLinked(idx, 'unit', e.target.value)}
                          >
                            {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </td>
                        <td>
                          <select
                            className="ct-acc-unit-select"
                            value={l.mode || 'fixed'}
                            onChange={e => setMode(idx, e.target.value)}
                          >
                            <option value="fixed">{t('ctFixed')}</option>
                            <option value="formula">{t('ctFormula')}</option>
                          </select>
                        </td>
                        <td>
                          <input
                            type="number"
                            className="ct-acc-qty-input"
                            min="0"
                            step="0.01"
                            value={l.quantity || 0}
                            disabled={l.mode === 'formula'}
                            onChange={e => updateLinked(idx, 'quantity', parseFloat(e.target.value) || 0)}
                          />
                        </td>
                        <td className="proj-acc-formula-cell">
                          <input
                            className="proj-acc-formula-input"
                            value={l.formula || ''}
                            disabled={l.mode === 'fixed'}
                            onChange={e => updateLinked(idx, 'formula', e.target.value)}
                            placeholder={t('ctFormulaPh')}
                          />
                        </td>
                        <td>
                          <button className="delete-btn" onClick={() => removeLinked(idx)}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="proj-acc-empty">
                {t('ctNoAcc')}
              </div>
            )}

            {/* ── Add new accessory form (same as ProjectDetail) ── */}
            <div className="proj-acc-add-form">
              <div className="proj-acc-add-form__title">
                ➕ {t('ctAddAcc')}
              </div>

              <div className="proj-acc-add-form__grid">

                {/* Search / name — full width */}
                <div className="form-group proj-acc-add-form__search" style={{ marginBottom: 0 }}>
                  <label>
                    {t('ctDesignationReq')}
                    <span style={{ fontWeight: 400, color: 'var(--text-4)', marginLeft: 6, fontSize: 11 }}>
                      {t('ctTypeToSearch')}
                    </span>
                  </label>
                  <InventoryAutocompleteInput
                    value={newAcc.label}
                    onChange={v => setN('label', v)}
                    onSelect={({ label, unit, itemId }) =>
                      setNewAcc(p => ({ ...p, label, unit: UNIT_OPTIONS.includes(unit) ? unit : (unit || 'UN'), itemId }))
                    }
                    placeholder={t('ctAccExamplesPh')}
                  />
                </div>

                {/* Mode cards */}
                <div className="proj-acc-mode-row">
                  {/* Fixed quantity */}
                  <div
                    className={`proj-acc-mode-card${newAcc.mode === 'fixed' ? ' proj-acc-mode-card--active' : ''}`}
                    onClick={() => setN('mode', 'fixed')}
                  >
                    <div className="proj-acc-mode-card__label">
                      <span className="proj-acc-mode-dot" />
                      {t('ctFixedQty')}
                    </div>
                    <div className="proj-acc-qty-unit-row">
                      <input
                        type="number"
                        className="ct-acc-qty-input"
                        min="0"
                        step="0.01"
                        value={newAcc.quantity}
                        disabled={newAcc.mode !== 'fixed'}
                        style={{ flex: 1 }}
                        onChange={e => setN('quantity', e.target.value)}
                        onClick={e => { e.stopPropagation(); setN('mode', 'fixed'); }}
                      />
                      <select
                        className="proj-acc-unit-select"
                        value={newAcc.unit}
                        onChange={e => setN('unit', e.target.value)}
                        onClick={e => e.stopPropagation()}
                      >
                        {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Formula */}
                  <div
                    className={`proj-acc-mode-card${newAcc.mode === 'formula' ? ' proj-acc-mode-card--active' : ''}`}
                    onClick={() => setN('mode', 'formula')}
                  >
                    <div className="proj-acc-mode-card__label">
                      <span className="proj-acc-mode-dot" />
                      {t('ctColFormula')}
                    </div>
                    <input
                      className="proj-acc-formula-input"
                      value={newAcc.formula}
                      disabled={newAcc.mode !== 'formula'}
                      onChange={e => setN('formula', e.target.value)}
                      onClick={e => { e.stopPropagation(); setN('mode', 'formula'); }}
                      placeholder={t('ctFormulaPh')}
                    />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                      <select
                        className="proj-acc-unit-select"
                        value={newAcc.unit}
                        onChange={e => setN('unit', e.target.value)}
                        onClick={e => e.stopPropagation()}
                      >
                        {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                      <p className="proj-acc-formula-hint" style={{ margin: 0 }}>{t('ctLHHint')}</p>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="proj-acc-add-form__actions">
                  <button type="button" onClick={() => { setNewAcc(EMPTY_NEW_ACC); setError(''); }}>
                    {t('ctReset')}
                  </button>
                  <button type="button" className="primary" onClick={handleAddNew}>
                    {t('add')}
                  </button>
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button onClick={onClose}>{t('cancel')}</button>
              <button className="primary" onClick={handleSave} disabled={saving}>
                {saving ? '…' : `💾 ${t('save')}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main ChassisTypeManager ──────────────────────────────────────────────────
function ChassisTypeManager({ onClose }) {
  const { t } = useLanguage();
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [accEditor, setAccEditor] = useState(null); // { id, name }

  const load = () => {
    setLoading(true);
    fetchChassisTypes().then(data => { setTypes(data); setLoading(false); }).catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const setF = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const generateValue = (fr) =>
    fr.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.fr.trim()) return setError(t('ctFrNameRequired'));
    setSaving(true);
    try {
      const payload = {
        ...form,
        value: editingId ? undefined : generateValue(form.fr),
        vantaux: form.composite ? (Number(form.vantaux) || 2) : 0,
        it: form.it || form.fr,
        en: form.en || form.fr,
      };
      if (editingId) {
        await updateChassisType(editingId, payload);
      } else {
        await createChassisType(payload);
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (ct) => {
    setEditingId(ct._id || ct.id);
    setForm({ fr: ct.fr, it: ct.it || '', en: ct.en || '', composite: ct.composite, vantaux: ct.vantaux || 2 });
    setError('');
  };

  const handleDelete = async (ct) => {
    if (!(await dialog.confirm({ title: t('deleteTitle'), message: t('ctDeleteConfirm', { name: ct.fr }), danger: true, confirmLabel: t('deleteAction') }))) return;
    try {
      await deleteChassisType(ct._id || ct.id);
    } catch (err) { dialog.alert(errorMessage(err, t('errDelete'))); return; }
    load();
  };

  const handleCancel = () => { setForm(EMPTY_FORM); setEditingId(null); setError(''); };
  const { user } = useAuth();
  const userRole = user?.role;
  const adminOnly = userRole === 'Admin';

  return (
    <>
      <div className="modal-overlay modal-ctt" onClick={onClose}>
        <div className="modal ct-manager-modal" onClick={e => e.stopPropagation()}>
          <div className="ct-manager__header">
            <h2>🪟 {t('ctTitle')}</h2>
            <button className="chassis-form__close" onClick={onClose}>×</button>
          </div>

          {/* Form */}
          <form className="ct-manager__form" onSubmit={handleSave}>
            <h3>{editingId ? `✏️ ${t('ctEditType')}` : `➕ ${t('ctNewType')}`}</h3>
            {error && <div className="ct-manager__error">{error}</div>}
            <div className="ct-manager__fields">
              <div className="form-group">
                <label>{t('ctNameFr')}</label>
                <input type="text" required value={form.fr} onChange={e => setF('fr', e.target.value)} placeholder={t('ctNameFrPh')} />
              </div>
              <div className="form-group">
                <label>{t('ctNameIt')}</label>
                <input type="text" value={form.it} onChange={e => setF('it', e.target.value)} placeholder={t('ctNameItPh')} />
              </div>
              <div className="form-group">
                <label>{t('ctNameEn')}</label>
                <input type="text" value={form.en} onChange={e => setF('en', e.target.value)} placeholder={t('ctNameEnPh')} />
              </div>
              {adminOnly && (
                <div className="form-group ct-manager__composite-toggle">
                  <label>
                    <input type="checkbox" checked={form.composite} onChange={e => setF('composite', e.target.checked)} />
                    &nbsp; {t('ctComposite')}
                  </label>
                </div>

              )}
              {form.composite && (
                <div className="form-group">
                  <label>{t('ctLeaves')}</label>
                  <input type="number" min="1" max="10" value={form.vantaux} onChange={e => setF('vantaux', e.target.value)} />
                </div>
              )}
              {!editingId && (
                <div className="ct-manager__preview">
                  <span className="ct-manager__preview-label">{t('ctGeneratedId')}</span>
                  <code>{form.fr ? generateValue(form.fr) : '—'}</code>
                </div>
              )}
            </div>
            <div className="modal-actions">
              {editingId && <button type="button" onClick={handleCancel}>{t('cancel')}</button>}
              <button type="submit" className="primary" disabled={saving}>
                {saving ? '...' : (editingId ? t('update') : t('ctCreateType'))}
              </button>
            </div>
          </form>

          {/* List */}
          {adminOnly && (
            <div className="ct-manager__list">
              <h3>{t('ctExisting', { n: types.length })}</h3>
              {loading ? <div className="ct-manager__loading">{t('loadingShort')}</div> : (
                <table className="ct-manager__table">
                  <thead>
                    <tr>
                      <th>{t('ctColNameFr')}</th>
                      <th>{t('ctColId')}</th>
                      <th>{t('ctColComposite')}</th>
                      <th>{t('ctColLeaves')}</th>
                      <th>{t('ctColAcc')}</th>
                      <th>{t('ctColActions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {types.map(ct => (
                      <tr key={ct._id || ct.id} className={editingId === (ct._id || ct.id) ? 'ct-manager__row--editing' : ''}>
                        <td><strong>{ct.fr}</strong></td>
                        <td><code className="ct-manager__code">{ct.value}</code></td>
                        <td>{ct.composite ? <span className="ct-badge ct-badge--composite">{t('yes')}</span> : <span className="ct-badge">{t('no')}</span>}</td>
                        <td>{ct.composite ? ct.vantaux : '—'}</td>
                        <td>
                          <button
                            className="ct-acc-btn"
                            onClick={() => setAccEditor({ id: ct._id || ct.id, name: ct.fr })}
                            title={t('ctConfigureAcc')}
                          >
                            🔧 {ct.accessoryCount > 0 ? `${ct.accessoryCount}` : ''}
                          </button>
                        </td>
                        <td>
                          <div className="ct-manager__actions">
                            <button className="edit-btn" onClick={() => handleEdit(ct)}>✏️</button>
                            <button className="delete-btn" onClick={() => handleDelete(ct)}>🗑</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Accessory editor — rendered outside main modal so it overlays cleanly */}
      {accEditor && (
        <AccessoryEditor
          chassisTypeId={accEditor.id}
          chassisTypeName={accEditor.name}
          onClose={() => { setAccEditor(null); load(); }}
        />
      )}
    </>
  );
}

export default ChassisTypeManager;