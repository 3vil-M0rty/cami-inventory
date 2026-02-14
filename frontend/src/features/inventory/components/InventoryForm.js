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
 */

const InventoryForm = ({ onSubmit, onCancel, initialData = null }) => {
  const { t } = useLanguage();
  const isEditMode = Boolean(initialData);

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
        [name]: value
      }));
    }

    // Clear error for this field
    setErrors(prev => ({
      ...prev,
      [name]: null
    }));
  };

  const handleImageChange = (e) => {
    const url = e.target.value;
    setFormData(prev => ({ ...prev, image: url }));
    
    if (url) {
      // Simulate image loading for preview
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

    // Prepare data for validation
    const dataToValidate = {
      ...formData,
      quantity: Number(formData.quantity),
      threshold: Number(formData.threshold)
    };

    const validation = validateInventoryItem(dataToValidate);

    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    // Submit with correct data types
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
            placeholder="100"
            min="0"
            step="1"
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
            placeholder="20"
            min="0"
            step="1"
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
