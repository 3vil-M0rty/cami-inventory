import { useState, useEffect, useRef } from 'react';
import { useProjects } from '../../../context/ProjectContext';
import { useLanguage } from '../../../context/LanguageContext';
import { fetchChassisTypes, ETAT_OPTIONS, STATIC_CHASSIS_TYPES } from './ChassisTypesConfig';
import './ChassisForm.css';

function buildComponents(typeObj, existing = []) {
  if (!typeObj?.composite) return [];
  const dormantEx = existing.find(c => c.role === 'dormant') || {};
  const components = [{ role: 'dormant', repere: dormantEx.repere || 'D', largeur: dormantEx.largeur || '', hauteur: dormantEx.hauteur || '', etat: dormantEx.etat || 'non_entame' }];
  for (let i = 0; i < (typeObj.vantaux || 0); i++) {
    const vEx = existing.filter(c => c.role === 'vantail')[i] || {};
    components.push({ role: 'vantail', repere: vEx.repere || `V${i+1}`, largeur: vEx.largeur || '', hauteur: vEx.hauteur || '', etat: vEx.etat || 'non_entame' });
  }
  return components;
}

function ChassisForm({ chassis, projectId, onClose, onSave }) {
  const { addChassis, updateChassis } = useProjects();
  const { t, currentLanguage } = useLanguage();
  const lang = currentLanguage;
  const isEdit = !!chassis;
  const initialType = chassis?.type || 'fenetre_1_ouvrant';

  const [chassisTypes, setChassisTypes] = useState(STATIC_CHASSIS_TYPES);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchChassisTypes().then(setChassisTypes).catch(()=>{}); }, []);

  const getTypeObj = (v) => chassisTypes.find(ct => ct.value === v);

  const [formData, setFormData] = useState({
    type:       initialType,
    repere:     chassis?.repere || '',
    quantity:   chassis?.quantity ?? 1,
    largeur:    chassis?.largeur ?? '',
    hauteur:    chassis?.hauteur ?? '',
    etat:       chassis?.etat || 'non_entame',
    components: buildComponents(getTypeObj(initialType), chassis?.components || [])
  });

  const set = (key, val) => setFormData(prev => ({ ...prev, [key]: val }));

  const handleTypeChange = (newType) => {
    setFormData(prev => ({ ...prev, type: newType, components: buildComponents(getTypeObj(newType), prev.components) }));
  };

  const setComponent = (idx, key, val) => {
    setFormData(prev => { const c=[...prev.components]; c[idx]={...c[idx],[key]:val}; return{...prev,components:c}; });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const qty = parseInt(formData.quantity, 10) || 1;
    const payload = {
      ...formData,
      quantity: qty,
      largeur:  parseInt(formData.largeur, 10) || 0,
      hauteur:  parseInt(formData.hauteur, 10) || 0,
      dimension:`${formData.largeur}×${formData.hauteur}`,
      components: formData.components.map(c=>({...c, largeur:parseInt(c.largeur,10)||0, hauteur:parseInt(c.hauteur,10)||0}))
    };
    try {
      if (isEdit) {
        const originalId = chassis._originalId || chassis._id || chassis.id;
        // Update chassis template only (no unit states — those are managed per unit)
        const cleanPayload = { ...payload };
        delete cleanPayload._originalId;
        delete cleanPayload._unitIndex;
        delete cleanPayload._totalQty;
        await updateChassis(projectId, originalId, cleanPayload);
      } else {
        await addChassis(projectId, payload);
      }
      onSave();
    } finally { setSaving(false); }
  };

  const isComposite = getTypeObj(formData.type)?.composite;
  const getTypeLabel = (ct) => ct[lang] || ct.fr;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal chassis-form-modal" onClick={e=>e.stopPropagation()}>
        <div className="chassis-form__header">
          <h2>{isEdit ? t('chassisTitleEdit') : t('chassisTitleAdd')}</h2>
          <button className="chassis-form__close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="chassis-form">
          <div className="chassis-form__section">
            <label className="chassis-form__section-label">{t('chassisType')}</label>
            <ChassisTypeSearch
              chassisTypes={chassisTypes}
              value={formData.type}
              lang={lang}
              onChange={handleTypeChange}
            />
          </div>

          <div className="chassis-form__section">
            <label className="chassis-form__section-label">Dimensions & Informations</label>
            <div className="chassis-form__fields">
              <div className="form-group">
                <label>{t('repere')}</label>
                <input type="text" required placeholder="ex: A1, F01..." value={formData.repere} onChange={e=>set('repere',e.target.value)}/>
              </div>
              <div className="form-group">
                <label>{t('quantityChassis')}</label>
                <input type="number" required min="1" step="1" value={formData.quantity} onChange={e=>set('quantity',parseInt(e.target.value,10)||1)}/>
              </div>
              <div className="form-group">
                <label>{t('largeur')} (mm)</label>
                <input type="number" required min="0" step="1" placeholder="ex: 1200" value={formData.largeur} onChange={e=>set('largeur',e.target.value)}/>
              </div>
              <div className="form-group">
                <label>{t('hauteur')} (mm)</label>
                <input type="number" required min="0" step="1" placeholder="ex: 2100" value={formData.hauteur} onChange={e=>set('hauteur',e.target.value)}/>
              </div>
              {!isEdit && (
                <div className="form-group">
                  <label>{t('chassisEtat')}</label>
                  <select value={formData.etat} onChange={e=>set('etat',e.target.value)}>
                    {ETAT_OPTIONS.map(o=><option key={o} value={o}>{t(`etat_${o}`)}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>

          {isComposite && formData.components.length > 0 && (
            <div className="chassis-form__section chassis-form__section--composite">
              <label className="chassis-form__section-label">{t('componentsDimensions')}</label>
              <div className="composite-grid">
                {formData.components.map((comp, idx) => (
                  <div key={idx} className="composite-card">
                    <div className="composite-card__role">{comp.role==='dormant'?t('dormant'):`${t('vantail')} ${idx}`}</div>
                    <div className="composite-card__fields">
                      <div className="form-group form-group--sm">
                        <label>{t('repere')}</label>
                        <input type="text" value={comp.repere} onChange={e=>setComponent(idx,'repere',e.target.value)}/>
                      </div>
                      <div className="form-group form-group--sm">
                        <label>L (mm)</label>
                        <input type="number" min="0" step="1" value={comp.largeur} onChange={e=>setComponent(idx,'largeur',e.target.value)}/>
                      </div>
                      <div className="form-group form-group--sm">
                        <label>H (mm)</label>
                        <input type="number" min="0" step="1" value={comp.hauteur} onChange={e=>setComponent(idx,'hauteur',e.target.value)}/>
                      </div>
                      <div className="form-group form-group--sm">
                        <label>{t('chassisEtat')}</label>
                        <select value={comp.etat} onChange={e=>setComponent(idx,'etat',e.target.value)}>
                          {ETAT_OPTIONS.map(o=><option key={o} value={o}>{t(`etat_${o}`)}</option>)}
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
            <button type="submit" className="primary" disabled={saving}>{saving?'...':(isEdit?t('update'):t('create'))}</button>
          </div>
        </form>
      </div>
    </div>
  );
}


// ── Inline search-and-select for chassis type ───────────────────────────────
function ChassisTypeSearch({ chassisTypes, value, lang, onChange }) {
  const [query,  setQuery]  = useState('');
  const [open,   setOpen]   = useState(false);
  const wrapRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const getLabel = (ct) => ct[lang] || ct.fr || ct.value;
  const selected = chassisTypes.find(ct => ct.value === value);

  const filtered = chassisTypes.filter(ct => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return getLabel(ct).toLowerCase().includes(q) || ct.value.toLowerCase().includes(q);
  });

  const handleSelect = (ct) => {
    onChange(ct.value);
    setQuery('');
    setOpen(false);
  };

  return (
    <div className="ct-search" ref={wrapRef}>
      <div className={`ct-search__trigger ${open ? 'ct-search__trigger--open' : ''}`} onClick={() => setOpen(o => !o)}>
        {selected ? (
          <span className="ct-search__selected">
            <span className="ct-search__selected-name">{getLabel(selected)}</span>
            {selected.composite && <span className="ct-search__badge">{selected.vantaux}V</span>}
          </span>
        ) : (
          <span className="ct-search__placeholder">Sélectionner un type…</span>
        )}
        <span className="ct-search__arrow">{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div className="ct-search__dropdown">
          <div className="ct-search__input-wrap">
            <input
              autoFocus
              type="text"
              className="ct-search__input"
              placeholder="Rechercher un type…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onClick={e => e.stopPropagation()}
            />
          </div>
          <div className="ct-search__list">
            {filtered.length === 0
              ? <div className="ct-search__empty">Aucun résultat</div>
              : filtered.map(ct => (
                <div
                  key={ct.value}
                  className={`ct-search__item ${ct.value === value ? 'ct-search__item--active' : ''} ${ct.composite ? 'ct-search__item--composite' : ''}`}
                  onClick={() => handleSelect(ct)}
                >
                  <span className="ct-search__item-name">{getLabel(ct)}</span>
                  {ct.composite && <span className="ct-search__badge">{ct.vantaux}V</span>}
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
}

export default ChassisForm;