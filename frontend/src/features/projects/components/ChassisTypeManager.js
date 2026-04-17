/* eslint-disable no-unused-vars */
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  fetchChassisTypes, createChassisType, updateChassisType, deleteChassisType
} from './ChassisTypesConfig';
import './ChassisTypeManager.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const EMPTY_FORM = { fr: '', it: '', en: '', composite: false, vantaux: 2 };

// Unit options for the accessory unit dropdown
const UNIT_OPTIONS = ['UN', 'ML', 'M²', 'M³', 'KG', 'L', 'PAIRE', 'JEU', 'ROULEAU'];

// Empty state for the add-accessory form inside AccessoryEditor
const EMPTY_NEW_ACC = { label: '', unit: 'UN', quantity: 1, formula: '', itemId: '', mode: 'fixed' };
// mode: 'fixed' | 'formula'

// ─── Inventory Autocomplete Input ─────────────────────────────────────────────
function InventoryAutocompleteInput({ value, onChange, onSelect, placeholder, categories }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen]               = useState(false);
  const [loading, setLoading]         = useState(false);
  const debounceRef                   = useRef(null);
  const wrapRef                       = useRef(null);

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
    const unit  = item.unit || '';
    const id    = item.id || item._id;
    onSelect({ label, unit, itemId: id });
    setSuggestions([]);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative' }}>
        <span style={{
          position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)',
          fontSize: 15, color: '#9ca3af', pointerEvents: 'none', lineHeight: 1,
        }}>🔍</span>
        <input
          className="ct-acc-search-input"
          onFocus={e => {
            e.target.style.borderColor = '#1a1a1a';
            e.target.style.boxShadow = '0 0 0 3px rgba(26,26,26,0.08)';
            if (value.length >= 2 && suggestions.length > 0) setOpen(true);
          }}
          onBlur={e => {
            e.target.style.borderColor = '#d1d5db';
            e.target.style.boxShadow = 'none';
          }}
          value={value}
          onChange={handleChange}
          placeholder={placeholder || 'Rechercher ou saisir…'}
          autoComplete="off"
        />
        {loading ? (
          <span style={{
            position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)',
            fontSize: 12, color: '#555', fontWeight: 600,
          }}>⏳</span>
        ) : value && (
          <span
            style={{
              position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)',
              fontSize: 15, color: '#9ca3af', cursor: 'pointer', lineHeight: 1,
            }}
            onMouseDown={() => { onChange(''); setSuggestions([]); setOpen(false); }}
          >✕</span>
        )}
      </div>
      {open && suggestions.length > 0 && (
        <div className="ct-acc-dropdown">
          <div className="ct-acc-dropdown__header">
            {suggestions.length} résultat{suggestions.length > 1 ? 's' : ''} trouvé{suggestions.length > 1 ? 's' : ''}
          </div>
          {suggestions.map(item => {
            const id    = item.id || item._id;
            const label = item.designation?.fr || item.designation || id;
            const unit  = item.unit || '';
            return (
              <div
                key={id}
                onMouseDown={() => handleSelect(item)}
                className="ct-acc-dropdown__item"
                onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f5'; }}
                onMouseLeave={e => { e.currentTarget.style.background = ''; }}
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
  const [linked, setLinked]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [newAcc, setNewAcc]   = useState(EMPTY_NEW_ACC);

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
        setError('Erreur lors du chargement des accessoires');
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
    if (!newAcc.label.trim()) return setError('Le nom de l\'accessoire est requis');
    setError('');
    const acc = {
      itemId:   newAcc.itemId || `manual_${Date.now()}`,
      label:    newAcc.label.trim(),
      unit:     newAcc.unit || 'UN',
      quantity: newAcc.mode === 'fixed' ? (parseFloat(newAcc.quantity) || 1) : 0,
      formula:  newAcc.mode === 'formula' ? newAcc.formula.trim() : '',
      mode:     newAcc.mode,
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
      setError(e.response?.data?.error || 'Erreur lors de la sauvegarde');
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
          <h2>🔧 Accessoires — {chassisTypeName}</h2>
          <button className="chassis-form__close" onClick={onClose}>×</button>
        </div>

        {error && <div className="ct-manager__error">{error}</div>}

        {loading ? (
          <div className="ct-manager__loading">Chargement…</div>
        ) : (
          <>
            <p className="ct-acc-hint">
              Définissez les accessoires par défaut pour ce type de châssis. Ils seront
              proposés automatiquement lors de la configuration des lignes dans les projets.
              La quantité peut être <strong>fixe</strong> ou calculée via une <strong>formule</strong>{' '}
              utilisant <strong>L</strong> (largeur) et <strong>H</strong> (hauteur) en mm.
            </p>

            {/* ── Configured accessories table ── */}
            {linked.length > 0 ? (
              <div className="ct-acc-linked">
                <h3>✅ Accessoires configurés ({linked.length})</h3>
                <table className="proj-acc-table ct-acc-linked-table">
                  <thead>
                    <tr>
                      <th>Désignation</th>
                      <th style={{ width: 90 }}>Unité</th>
                      <th style={{ width: 80 }}>Mode</th>
                      <th style={{ width: 110 }}>Qté fixe</th>
                      <th style={{ width: 200 }}>Formule (L, H)</th>
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
                            placeholder="Nom accessoire"
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
                            <option value="fixed">Fixe</option>
                            <option value="formula">Formule</option>
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
                            placeholder="ex: 2*(L+H)/1000"
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
                Aucun accessoire configuré. Utilisez le formulaire ci-dessous pour en ajouter.
              </div>
            )}

            {/* ── Add new accessory form (same as ProjectDetail) ── */}
            <div className="proj-acc-add-form">
              <div className="proj-acc-add-form__title">
                ➕ Ajouter un accessoire
              </div>

              <div className="proj-acc-add-form__grid">

                {/* Search / name — full width */}
                <div className="form-group proj-acc-add-form__search" style={{ marginBottom: 0 }}>
                  <label>
                    Désignation *
                    <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: 6, fontSize: 11 }}>
                      (tapez pour chercher dans l'inventaire)
                    </span>
                  </label>
                  <InventoryAutocompleteInput
                    value={newAcc.label}
                    onChange={v => setN('label', v)}
                    onSelect={({ label, unit, itemId }) =>
                      setNewAcc(p => ({ ...p, label, unit: UNIT_OPTIONS.includes(unit) ? unit : (unit || 'UN'), itemId }))
                    }
                    placeholder="ex: Joint, Vis inox, Poignée…"
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
                      Quantité fixe
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
                      Formule (L, H)
                    </div>
                    <input
                      className="proj-acc-formula-input"
                      value={newAcc.formula}
                      disabled={newAcc.mode !== 'formula'}
                      onChange={e => setN('formula', e.target.value)}
                      onClick={e => { e.stopPropagation(); setN('mode', 'formula'); }}
                      placeholder="ex: 2*(L+H)/1000"
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
                      <p className="proj-acc-formula-hint" style={{ margin: 0 }}>
                        <strong>L</strong> = largeur &nbsp;·&nbsp; <strong>H</strong> = hauteur (mm)
                      </p>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="proj-acc-add-form__actions">
                  <button type="button" onClick={() => { setNewAcc(EMPTY_NEW_ACC); setError(''); }}>
                    Réinitialiser
                  </button>
                  <button type="button" className="primary" onClick={handleAddNew}>
                    + Ajouter
                  </button>
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button onClick={onClose}>Annuler</button>
              <button className="primary" onClick={handleSave} disabled={saving}>
                {saving ? '…' : '💾 Enregistrer'}
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
    if (!form.fr.trim()) return setError('Le nom français est requis');
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
    if (!window.confirm(`Supprimer "${ct.fr}" ?`)) return;
    await deleteChassisType(ct._id || ct.id);
    load();
  };

  const handleCancel = () => { setForm(EMPTY_FORM); setEditingId(null); setError(''); };

  return (
    <>
      <div className="modal-overlay modal-ctt" onClick={onClose}>
        <div className="modal ct-manager-modal" onClick={e => e.stopPropagation()}>
          <div className="ct-manager__header">
            <h2>🪟 Gestion des types de chassis</h2>
            <button className="chassis-form__close" onClick={onClose}>×</button>
          </div>

          {/* Form */}
          <form className="ct-manager__form" onSubmit={handleSave}>
            <h3>{editingId ? '✏️ Modifier le type' : '➕ Nouveau type'}</h3>
            {error && <div className="ct-manager__error">{error}</div>}
            <div className="ct-manager__fields">
              <div className="form-group">
                <label>Nom (Français) *</label>
                <input type="text" required value={form.fr} onChange={e => setF('fr', e.target.value)} placeholder="ex: Porte 2 vantaux" />
              </div>
              <div className="form-group">
                <label>Nom (Italien)</label>
                <input type="text" value={form.it} onChange={e => setF('it', e.target.value)} placeholder="ex: Porta 2 ante" />
              </div>
              <div className="form-group">
                <label>Nom (Anglais)</label>
                <input type="text" value={form.en} onChange={e => setF('en', e.target.value)} placeholder="ex: Door 2 leaves" />
              </div>
              <div className="form-group ct-manager__composite-toggle">
                <label>
                  <input type="checkbox" checked={form.composite} onChange={e => setF('composite', e.target.checked)} />
                  &nbsp; Chassis composé (dormant + vantaux)
                </label>
              </div>
              {form.composite && (
                <div className="form-group">
                  <label>Nombre de vantaux</label>
                  <input type="number" min="1" max="10" value={form.vantaux} onChange={e => setF('vantaux', e.target.value)} />
                </div>
              )}
              {!editingId && (
                <div className="ct-manager__preview">
                  <span className="ct-manager__preview-label">Identifiant généré :</span>
                  <code>{form.fr ? generateValue(form.fr) : '—'}</code>
                </div>
              )}
            </div>
            <div className="modal-actions">
              {editingId && <button type="button" onClick={handleCancel}>Annuler</button>}
              <button type="submit" className="primary" disabled={saving}>
                {saving ? '...' : (editingId ? 'Mettre à jour' : 'Créer le type')}
              </button>
            </div>
          </form>

          {/* List */}
          <div className="ct-manager__list">
            <h3>Types existants ({types.length})</h3>
            {loading ? <div className="ct-manager__loading">Chargement…</div> : (
              <table className="ct-manager__table">
                <thead>
                  <tr>
                    <th>Nom (FR)</th>
                    <th>Identifiant</th>
                    <th>Composé</th>
                    <th>Vantaux</th>
                    <th>Accessoires</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {types.map(ct => (
                    <tr key={ct._id || ct.id} className={editingId === (ct._id || ct.id) ? 'ct-manager__row--editing' : ''}>
                      <td><strong>{ct.fr}</strong></td>
                      <td><code className="ct-manager__code">{ct.value}</code></td>
                      <td>{ct.composite ? <span className="ct-badge ct-badge--composite">Oui</span> : <span className="ct-badge">Non</span>}</td>
                      <td>{ct.composite ? ct.vantaux : '—'}</td>
                      <td>
                        <button
                          className="ct-acc-btn"
                          onClick={() => setAccEditor({ id: ct._id || ct.id, name: ct.fr })}
                          title="Configurer les accessoires"
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