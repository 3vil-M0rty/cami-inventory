/**
 * Validation Utilities
 * 
 * Reusable validation functions for form inputs
 */

export const isRequired = (value) => {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  return value !== null && value !== undefined;
};

export const isValidNumber = (value) => {
  return !isNaN(value) && value !== '' && value !== null;
};

export const isPositiveNumber = (value) => {
  return isValidNumber(value) && Number(value) >= 0;
};

export const isValidUrl = (value) => {
  if (!value) return true; // Optional field
  
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

export const validateInventoryItem = (formData) => {
  const errors = {};

  // Validate designations
  if (!isRequired(formData.designation?.it)) {
    errors.designationIt = 'Required field';
  }
  if (!isRequired(formData.designation?.fr)) {
    errors.designationFr = 'Required field';
  }
  if (!isRequired(formData.designation?.en)) {
    errors.designationEn = 'Required field';
  }

  // Validate quantity
  if (!isValidNumber(formData.quantity)) {
    errors.quantity = 'Enter a valid number';
  } else if (!isPositiveNumber(formData.quantity)) {
    errors.quantity = 'Must be a positive number';
  }

  // Validate threshold
  if (!isValidNumber(formData.threshold)) {
    errors.threshold = 'Enter a valid number';
  } else if (!isPositiveNumber(formData.threshold)) {
    errors.threshold = 'Must be a positive number';
  }

  // Validate image URL (optional but must be valid if provided)
  if (formData.image && !isValidUrl(formData.image)) {
    errors.image = 'Enter a valid URL';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

export default {
  isRequired,
  isValidNumber,
  isPositiveNumber,
  isValidUrl,
  validateInventoryItem
};
