import { useState, useEffect } from 'react';
import Input from '../../../components/common/Input';
import Button from '../../../components/common/Button';
import { useLanguage } from '../../../context/LanguageContext';
import { validateInventoryItem } from '../../../utils/validation';
import './InventoryForm.css';

/**
 * InventoryForm Component
 * 
 * Form for adding/editing inventory items
 * Handles validation and image preview
 * 
 * @prop {string} superCategory - current supercategory key (e.g. 'poudre')
 *   When 'poudre', quantity and threshold inputs accept decimals (step=0.01).
 *   All other supercategories use integers only (step=1).
 */

const InventoryForm = ({ onSubmit, onCancel, initialData = null, superCategory = '' }) => {
  const { t } = useLanguage();

  // Decimals allowed only for the 'poudre' supercategory
  const isPoudre = superCategory === 'poudre';

  const [formData, setFormData] = useState({
    image: '',
    designation: {
      it: '',
      fr: '',
      en: ''
    },
    quantity: '',
    threshold: ''
  });

  const [errors, setErrors] = useState({});
  const [imagePreview, setImagePreview] = useState(null);

  useEffect(() => {
    if (initialData) {
      setFormData({
        image: initialData.image || '',
        designation: { ...initialData.designation },
        quantity: initialData.quantity.toString(),
        threshold: initialData.threshold.toString()
      });
      setImagePreview(initialData.image);
    }
  }, [initialData]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    let parsedValue = value;

    // Convert comma to dot for decimals (relevant when isPoudre)
    if (typeof value === 'string') {
      parsedValue = value.replace(',', '.');
    }

    if (name.startsWith('designation-')) {
      const lang = name.split('-')[1];
      setFormData(prev => ({
        ...prev,
        designation: {
          ...prev.designation,
          [lang]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: parsedValue
      }));
    }

    setErrors(prev => ({
      ...prev,
      [name]: null
    }));
  };

  const handleImageChange = (e) => {
    const url = e.target.value;
    setFormData(prev => ({ ...prev, image: url }));

    if (url) {
      const img = new Image();
      img.onload = () => setImagePreview(url);
      img.onerror = () => setImagePreview(null);
      img.src = url;
    } else {
      setImagePreview(null);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // Parse quantity/threshold: float for poudre, integer for others
    const parsedQuantity = isPoudre
      ? parseFloat(formData.quantity)
      : parseInt(formData.quantity, 10);

    const parsedThreshold = isPoudre
      ? parseFloat(formData.threshold)
      : parseInt(formData.threshold, 10);

    const dataToValidate = {
      ...formData,
      quantity: parsedQuantity,
      threshold: parsedThreshold
    };

    const validation = validateInventoryItem(dataToValidate);

    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    onSubmit(dataToValidate);
  };

  return (
    <form onSubmit={handleSubmit} className="inventory-form">
      <div className="inventory-form__grid">
        {/* Image Section */}
        <div className="inventory-form__section inventory-form__section--full">
          <Input
            label={t('imageUrl')}
            type="url"
            name="image"
            value={formData.image}
            onChange={handleImageChange}
            placeholder="https://example.com/image.jpg"
            error={errors.image}
          />
          {imagePreview && (
            <div className="inventory-form__preview">
              <img
                src={imagePreview}
                alt="Preview"
                className="inventory-form__preview-image"
                onError={() => setImagePreview(null)}
              />
            </div>
          )}
        </div>

        {/* Designations */}
        <div className="inventory-form__section inventory-form__section--full">
          <h3 className="inventory-form__subtitle">{t('designation')}</h3>

          <Input
            label={t('designationIt')}
            type="text"
            name="designation-it"
            value={formData.designation.it}
            onChange={handleInputChange}
            placeholder="Barra Alluminio 6063..."
            error={errors.designationIt}
            required
          />

          <Input
            label={t('designationFr')}
            type="text"
            name="designation-fr"
            value={formData.designation.fr}
            onChange={handleInputChange}
            placeholder="Barre Aluminium 6063..."
            error={errors.designationFr}
            required
          />

          <Input
            label={t('designationEn')}
            type="text"
            name="designation-en"
            value={formData.designation.en}
            onChange={handleInputChange}
            placeholder="Aluminum Bar 6063..."
            error={errors.designationEn}
            required
          />
        </div>

        {/* Quantity & Threshold */}
        <div className="inventory-form__section">
          <Input
            label={t('quantityLabel')}
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

        <div className="inventory-form__section">
          <Input
            label={t('thresholdLabel')}
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

      {/* Form Actions */}
      <div className="inventory-form__actions">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
        >
          {t('cancel')}
        </Button>
        <Button
          type="submit"
          variant="primary"
        >
          {t('save')}
        </Button>
      </div>
    </form>
  );
};

export default InventoryForm;