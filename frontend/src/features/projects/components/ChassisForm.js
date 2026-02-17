import { useState } from 'react';
import { useProjects } from '../../../context/ProjectContext';
import { useLanguage } from '../../../context/LanguageContext';

const CHASSIS_TYPES = [
  { value: 'fenetre_2_ouvrants', fr: 'Fenêtre 2 ouvrants', composite: false },
  { value: 'chassis_fixe', fr: 'Châssis fixe', composite: false },
  { value: 'fenetre_1_ouvrant', fr: 'Fenêtre 1 ouvrant', composite: false },
  { value: 'fenetre_oscillo_battant', fr: 'Fenêtre oscillo-battant', composite: false },
  { value: 'soufflet', fr: 'Soufflet', composite: false },
  { value: 'porte_1_ouvrant', fr: 'Porte 1 ouvrant', composite: false },
  { value: 'mur_rideau', fr: 'Mur rideau', composite: false },
  { value: 'volet_roulant', fr: 'Volet roulant', composite: false },
  { value: 'faux_cadre', fr: 'Faux cadre', composite: false },
  { value: 'minimaliste_2_vantaux', fr: 'Minimaliste 2 vantaux', composite: true, vantaux: 2 },
  { value: 'minimaliste_3_vantaux', fr: 'Minimaliste 3 vantaux', composite: true, vantaux: 3 },
  { value: 'minimaliste_4_vantaux', fr: 'Minimaliste 4 vantaux', composite: true, vantaux: 4 },
  { value: 'coulisse_2_vantaux', fr: 'Coulisse 2 vantaux', composite: true, vantaux: 2 },
  { value: 'coulisse_3_vantaux', fr: 'Coulisse 3 vantaux', composite: true, vantaux: 3 },
  { value: 'coulisse_4_vantaux', fr: 'Coulisse 4 vantaux', composite: true, vantaux: 4 },
];

const ETAT_OPTIONS = ['non_entame', 'en_cours', 'fabrique', 'livre'];

function buildComponents(type, existing = []) {
  const found = CHASSIS_TYPES.find(ct => ct.value === type);
  if (!found?.composite) return [];
  const count = found.vantaux;
  const components = [];
  const dormantEx = existing.find(c => c.role === 'dormant') || {};
  components.push({
    role: 'dormant', repere: dormantEx.repere || 'D',
    largeur: dormantEx.largeur || 0, hauteur: dormantEx.hauteur || 0,
    etat: dormantEx.etat || 'non_entame'
  });
  for (let i = 0; i < count; i++) {
    const vEx = existing.filter(c => c.role === 'vantail')[i] || {};
    components.push({
      role: 'vantail', repere: vEx.repere || `V${i + 1}`,
      largeur: vEx.largeur || 0, hauteur: vEx.hauteur || 0,
      etat: vEx.etat || 'non_entame'
    });
  }
  return components;
}

function ChassisForm({ chassis, projectId, onClose, onSave }) {
  const { addChassis, updateChassis } = useProjects();
  const { t } = useLanguage();

  const isEdit = !!chassis;
  const initialType = chassis?.type || 'fenetre_1_ouvrant';

  const [formData, setFormData] = useState({
    type: initialType,
    repere: chassis?.repere || '',
    quantity: chassis?.quantity || 1,
    largeur: chassis?.largeur || '',
    hauteur: chassis?.hauteur || '',
    etat: chassis?.etat || 'non_entame',
    components: buildComponents(initialType, chassis?.components || [])
  });

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
    const payload = {
      ...formData,
      quantity: Number(formData.quantity) || 1,
      largeur: Number(formData.largeur) || 0,
      hauteur: Number(formData.hauteur) || 0,
      dimension: `${formData.largeur}×${formData.hauteur}`,
    };
    if (isEdit) {
      await updateChassis(projectId, chassis._id || chassis.id, payload);
    } else {
      await addChassis(projectId, payload);
    }
    onSave();
  };

  const isComposite = CHASSIS_TYPES.find(ct => ct.value === formData.type)?.composite;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal large" onClick={e => e.stopPropagation()}>
        <h2>{isEdit ? t('chassisTitleEdit') : t('chassisTitleAdd')}</h2>
        <form onSubmit={handleSubmit}>

          <div className="form-group">
            <label>{t('chassisType')}</label>
            <select value={formData.type} onChange={e => handleTypeChange(e.target.value)}>
              {CHASSIS_TYPES.map(ct => (
                <option key={ct.value} value={ct.value}>{ct.fr}</option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>{t('repere')}</label>
              <input type="text" required value={formData.repere}
                onChange={e => set('repere', e.target.value)} />
            </div>
            <div className="form-group">
              <label>{t('quantityChassis')}</label>
              <input type="number" required min="1" value={formData.quantity}
                onChange={e => set('quantity', e.target.value)} />
            </div>
            <div className="form-group">
              <label>{t('largeur')} (mm)</label>
              <input type="number" required min="0" value={formData.largeur}
                onChange={e => set('largeur', e.target.value)} />
            </div>
            <div className="form-group">
              <label>{t('hauteur')} (mm)</label>
              <input type="number" required min="0" value={formData.hauteur}
                onChange={e => set('hauteur', e.target.value)} />
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

          {isComposite && formData.components.length > 0 && (
            <div className="composite-section">
              <h3 className="composite-section__title">{t('componentsDimensions')}</h3>
              {formData.components.map((comp, idx) => (
                <div key={idx} className="composite-component">
                  <span className="composite-component__role">
                    {comp.role === 'dormant' ? t('dormant') : `${t('vantail')} ${idx}`}
                  </span>
                  <div className="form-row composite-component__fields">
                    <div className="form-group">
                      <label>{t('repere')}</label>
                      <input type="text" value={comp.repere}
                        onChange={e => setComponent(idx, 'repere', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>{t('largeur')}</label>
                      <input type="number" min="0" value={comp.largeur}
                        onChange={e => setComponent(idx, 'largeur', Number(e.target.value))} />
                    </div>
                    <div className="form-group">
                      <label>{t('hauteur')}</label>
                      <input type="number" min="0" value={comp.hauteur}
                        onChange={e => setComponent(idx, 'hauteur', Number(e.target.value))} />
                    </div>
                    <div className="form-group">
                      <label>{t('chassisEtat')}</label>
                      <select value={comp.etat}
                        onChange={e => setComponent(idx, 'etat', e.target.value)}>
                        {ETAT_OPTIONS.map(o => (
                          <option key={o} value={o}>{t(`etat_${o}`)}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="modal-actions">
            <button type="button" onClick={onClose}>{t('cancel')}</button>
            <button type="submit" className="primary">
              {isEdit ? t('update') : t('create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ChassisForm;
