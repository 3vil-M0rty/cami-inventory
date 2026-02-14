import './Input.css';

/**
 * Input Component
 * 
 * Reusable input field with label and error handling
 */

const Input = ({
  label,
  type = 'text',
  name,
  value,
  onChange,
  placeholder,
  error,
  required = false,
  disabled = false,
  min,
  max,
  step
}) => {
  const inputId = `input-${name}`;

  return (
    <div className="input-group">
      {label && (
        <label htmlFor={inputId} className="input-label">
          {label}
          {required && <span className="input-required">*</span>}
        </label>
      )}
      <input
        id={inputId}
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        min={min}
        max={max}
        step={step}
        className={`input-field ${error ? 'input-field--error' : ''}`}
      />
      {error && <span className="input-error">{error}</span>}
    </div>
  );
};

export default Input;
