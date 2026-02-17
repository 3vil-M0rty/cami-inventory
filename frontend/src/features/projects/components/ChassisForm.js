import { useState } from 'react';
import { useProjects } from '../../../context/ProjectContext';
import { useLanguage } from '../../../context/LanguageContext';
import { CHASSIS_TYPES, ETAT_OPTIONS } from './ChassisTypesConfig';
import './ChassisForm.css';

function buildComponents(type, existing = []) {
  const found = CHASSIS_TYPES.find(ct => ct.value === type);
  if (!found?.composite) return [];
  const count = found.vantaux;
  const components = [];
  const dormantEx = existing.find(c => c.role === 'dormant') || {};
  components.push({
    role: 'dormant', repere: dormantEx.repere || 'D',
    largeur: dormantEx.largeur || '', hauteur: dormantEx.hauteur || '',
    etat: dormantEx.etat || 'non_entame'
  });
  for (let i = 0; i < count; i++) {
    const vEx = existing.filter(c => c.role === 'vantail')[i] || {};
    components.push({
      role: 'vantail', repere: vEx.repere || `V${i + 1}`,
      largeur: vEx.largeur || '', hauteur: vEx.hauteur || '',
      etat: vEx.etat || 'non_entame'
    });
  }
  return components;
}

function ChassisForm({ chassis, projectId, onClose, onSave }) {
  const { addChassis, updateChassis } = useProjects();
  const { t, currentLanguage } = useLanguage();
  const lang = currentLanguage;

  const isEdit = !!chassis;
  const initialType = chassis?.type || 'fenetre_1_ouvrant';

  const [formData, setFormData] = useState({
    type: initialType,
    repere: chassis?.repere || '',
    quantity: chassis?.quantity ?? 1,
    largeur: chassis?.largeur ?? '',
    hauteur: chassis?.hauteur ?? '',
    etat: chassis?.etat || 'non_entame',
    components: buildComponents(initialType, chassis?.components || [])
  });
  const [saving, setSaving] = useState(false);

  const set = (key, val) => setFormData(prev => ({ ...prev, [key]: val }));

  const handleTypeChange = (newType) => {
    setFormData(prev => ({
      ...prev,
      type: newType,
      components: buildComponents(newType, prev.components)
    }));
  };

  const setComponent = (idx, key, val) => {
    setFormData(prev => {
      const comps = [...prev.components];
      comps[idx] = { ...comps[idx], [key]: val };
      return { ...prev, components: comps };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...formData,
      quantity: parseInt(formData.quantity, 10) || 1,
      largeur: parseInt(formData.largeur, 10) || 0,
      hauteur: parseInt(formData.hauteur, 10) || 0,
      dimension: `${formData.largeur}×${formData.hauteur}`,
      components: formData.components.map(c => ({
        ...c,
        largeur: parseInt(c.largeur, 10) || 0,
        hauteur: parseInt(c.hauteur, 10) || 0,
      }))
    };
    try {
      if (isEdit) {
        await updateChassis(projectId, chassis._id || chassis.id, payload);
      } else {
        await addChassis(projectId, payload);
      }
      onSave();
    } finally {
      setSaving(false);
    }
  };

  const isComposite = CHASSIS_TYPES.find(ct => ct.value === formData.type)?.composite;

  // Get label for type in current language
  const getTypeLabel = (ct) => ct[lang] || ct.fr;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal chassis-form-modal" onClick={e => e.stopPropagation()}>
        <div className="chassis-form__header">
          <h2>{isEdit ? t('chassisTitleEdit') : t('chassisTitleAdd')}</h2>
          <button className="chassis-form__close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="chassis-form">

          {/* Type selector — visual cards */}
          <div className="chassis-form__section">
            <label className="chassis-form__section-label">{t('chassisType')}</label>
            <div className="chassis-type-grid">
              {CHASSIS_TYPES.map(ct => (
                <button
                  key={ct.value}
                  type="button"
                  className={`chassis-type-card ${formData.type === ct.value ? 'chassis-type-card--active' : ''} ${ct.composite ? 'chassis-type-card--composite' : ''}`}
                  onClick={() => handleTypeChange(ct.value)}
                >
                  <span className="chassis-type-card__name">{getTypeLabel(ct)}</span>
                  {ct.composite && <span className="chassis-type-card__badge">{ct.vantaux}V</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Main fields */}
          <div className="chassis-form__section">
            <label className="chassis-form__section-label">Dimensions & Informations</label>
            <div className="chassis-form__fields">
              <div className="form-group">
                <label>{t('repere')}</label>
                <input
                  type="text" required
                  placeholder="ex: A1, F01..."
                  value={formData.repere}
                  onChange={e => set('repere', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>{t('quantityChassis')}</label>
                <input
                  type="number" required min="1" step="1"
                  value={formData.quantity}
                  onChange={e => set('quantity', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>{t('largeur')} (mm)</label>
                <input
                  type="number" required min="0" step="1"
                  placeholder="ex: 1200"
                  value={formData.largeur}
                  onChange={e => set('largeur', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>{t('hauteur')} (mm)</label>
                <input
                  type="number" required min="0" step="1"
                  placeholder="ex: 2100"
                  value={formData.hauteur}
                  onChange={e => set('hauteur', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>{t('chassisEtat')}</label>
                <select value={formData.etat} onChange={e => set('etat', e.target.value)}>
                  {ETAT_OPTIONS.map(o => (
                    <option key={o} value={o}>{t(`etat_${o}`)}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Composite components */}
          {isComposite && formData.components.length > 0 && (
            <div className="chassis-form__section chassis-form__section--composite">
              <label className="chassis-form__section-label">{t('componentsDimensions')}</label>
              <div className="composite-grid">
                {formData.components.map((comp, idx) => (
                  <div key={idx} className="composite-card">
                    <div className="composite-card__role">
                      {comp.role === 'dormant'
                        ? `${t('dormant')}`
                        : `${t('vantail')} ${idx}`}
                    </div>
                    <div className="composite-card__fields">
                      <div className="form-group form-group--sm">
                        <label>{t('repere')}</label>
                        <input type="text" value={comp.repere}
                          onChange={e => setComponent(idx, 'repere', e.target.value)} />
                      </div>
                      <div className="form-group form-group--sm">
                        <label>L (mm)</label>
                        <input type="number" min="0" step="1" value={comp.largeur}
                          onChange={e => setComponent(idx, 'largeur', e.target.value)} />
                      </div>
                      <div className="form-group form-group--sm">
                        <label>H (mm)</label>
                        <input type="number" min="0" step="1" value={comp.hauteur}
                          onChange={e => setComponent(idx, 'hauteur', e.target.value)} />
                      </div>
                      <div className="form-group form-group--sm">
                        <label>{t('chassisEtat')}</label>
                        <select value={comp.etat} onChange={e => setComponent(idx, 'etat', e.target.value)}>
                          {ETAT_OPTIONS.map(o => (
                            <option key={o} value={o}>{t(`etat_${o}`)}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" onClick={onClose}>{t('cancel')}</button>
            <button type="submit" className="primary" disabled={saving}>
              {saving ? '...' : (isEdit ? t('update') : t('create'))}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ChassisForm;
