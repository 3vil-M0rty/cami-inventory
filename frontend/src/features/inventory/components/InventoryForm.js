import { useState, useEffect } from 'react';
import { ImageIcon, Languages, Hash, Save, X } from 'lucide-react';
import Input from '../../../components/common/Input';
import Button from '../../../components/common/Button';
import { useLanguage } from '../../../context/LanguageContext';
import { validateInventoryItem } from '../../../utils/validation';
import { PackagePlus } from 'lucide-react';
import './InventoryForm.css';

const InventoryForm = ({ onSubmit, onCancel, initialData = null, superCategory = '' }) => {
  const { t } = useLanguage();
  const isPoudre = superCategory === 'poudre';

  const [formData, setFormData] = useState({
    image: '',
    designation: { it: '', fr: '', en: '' },
    quantity: '',
    threshold: '',
  });
  const [errors,       setErrors]       = useState({});
  const [imagePreview, setImagePreview] = useState(null);

  useEffect(() => {
    if (initialData) {
      setFormData({
        image: initialData.image || '',
        designation: { ...initialData.designation },
        quantity:  initialData.quantity.toString(),
        threshold: initialData.threshold.toString(),
      });
      setImagePreview(initialData.image);
    }
  }, [initialData]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    const parsed = typeof value === 'string' ? value.replace(',', '.') : value;

    if (name.startsWith('designation-')) {
      const lang = name.split('-')[1];
      setFormData(prev => ({ ...prev, designation: { ...prev.designation, [lang]: value } }));
    } else {
      setFormData(prev => ({ ...prev, [name]: parsed }));
    }
    setErrors(prev => ({ ...prev, [name]: null }));
  };

  const handleImageChange = (e) => {
    const url = e.target.value;
    setFormData(prev => ({ ...prev, image: url }));
    if (url) {
      const img = new Image();
      img.onload  = () => setImagePreview(url);
      img.onerror = () => setImagePreview(null);
      img.src = url;
    } else {
      setImagePreview(null);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const parsedQty       = isPoudre ? parseFloat(formData.quantity)  : parseInt(formData.quantity, 10);
    const parsedThreshold = isPoudre ? parseFloat(formData.threshold) : parseInt(formData.threshold, 10);
    const data = { ...formData, quantity: parsedQty, threshold: parsedThreshold };
    const { isValid, errors: errs } = validateInventoryItem(data);
    if (!isValid) { setErrors(errs); return; }
    onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit} className="inv-form">

      {/* Image */}
      <div className="inv-form__section">
        <div className="inv-form__section-title">
          <ImageIcon size={13} strokeWidth={2.5} />
          {t('imageUrl')}
        </div>
        <Input
          type="url"
          name="image"
          value={formData.image}
          onChange={handleImageChange}
          placeholder="https://example.com/image.jpg"
          error={errors.image}
        />
        {imagePreview && (
          <div className="inv-form__preview">
            <img
              src={imagePreview}
              alt="Preview"
              className="inv-form__preview-img"
              onError={() => setImagePreview(null)}
            />
          </div>
        )}
      </div>

      {/* Designations */}
      <div className="inv-form__section">
        <div className="inv-form__section-title">
          <Languages size={13} strokeWidth={2.5} />
          {t('designation')}
        </div>
        <div className="inv-form__lang-grid">
          <div className="inv-form__lang-row">
            <span className="inv-form__lang-tag">FR</span>
            <Input
              type="text"
              name="designation-fr"
              value={formData.designation.fr}
              onChange={handleInputChange}
              placeholder="Barre Aluminium 6063…"
              error={errors.designationFr}
              required
            />
          </div>
          <div className="inv-form__lang-row">
            <span className="inv-form__lang-tag">IT</span>
            <Input
              type="text"
              name="designation-it"
              value={formData.designation.it}
              onChange={handleInputChange}
              placeholder="Barra Alluminio 6063…"
              error={errors.designationIt}
              required
            />
          </div>
          <div className="inv-form__lang-row">
            <span className="inv-form__lang-tag">EN</span>
            <Input
              type="text"
              name="designation-en"
              value={formData.designation.en}
              onChange={handleInputChange}
              placeholder="Aluminum Bar 6063…"
              error={errors.designationEn}
              required
            />
          </div>
        </div>
      </div>

      {/* Quantity & Threshold */}
      <div className="inv-form__section">
        <div className="inv-form__section-title">
          <Hash size={13} strokeWidth={2.5} />
          {t('stock')}
        </div>
        <div className="inv-form__numbers">
          <div className="inv-form__number-field">
            <label>{t('quantityLabel')}</label>
            <Input
              type="number"
              name="quantity"
              value={formData.quantity}
              onChange={handleInputChange}
              placeholder={isPoudre ? '145.23' : '100'}
              min="0"
              step={isPoudre ? '0.01' : '1'}
              error={errors.quantity}
              required
            />
          </div>
          <div className="inv-form__number-field">
            <label>{t('thresholdLabel')}</label>
            <Input
              type="number"
              name="threshold"
              value={formData.threshold}
              onChange={handleInputChange}
              placeholder={isPoudre ? '10.50' : '20'}
              min="0"
              step={isPoudre ? '0.01' : '1'}
              error={errors.threshold}
              required
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="inv-form__actions">
        <button type="button" className="inv-form__btn-cancel" onClick={onCancel}>
          <X size={14} strokeWidth={2.5} />
          {t('cancel')}
        </button>
        <button type="submit" className="inv-form__btn-save">
          <Save size={14} strokeWidth={2.5} />
          {t('save')}
        </button>
      </div>
    </form>
  );
};

export default InventoryForm;