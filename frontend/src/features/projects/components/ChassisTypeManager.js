import { useState, useEffect } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import {
  fetchChassisTypes, createChassisType, updateChassisType, deleteChassisType
} from './ChassisTypesConfig';
import './ChassisTypeManager.css';

const EMPTY_FORM = { fr: '', it: '', en: '', composite: false, vantaux: 2 };

function ChassisTypeManager({ onClose }) {
  const { t } = useLanguage();
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    fetchChassisTypes().then(data => { setTypes(data); setLoading(false); }).catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const setF = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  // Auto-generate value from fr name
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
    <div className="modal-overlay" onClick={onClose}>
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
  );
}

export default ChassisTypeManager;
