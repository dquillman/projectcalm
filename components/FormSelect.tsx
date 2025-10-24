import { SelectHTMLAttributes } from 'react';
import { componentStyles } from '../lib/theme';

interface FormSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  helperText?: string;
  options: Array<{ value: string | number; label: string }>;
}

/**
 * Form select component with validation error display
 * Shows label, select dropdown, and error/helper text
 */
export function FormSelect({
  label,
  error,
  helperText,
  options,
  className = '',
  id,
  ...props
}: FormSelectProps) {
  const selectId = id || `select-${label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div className="space-y-1">
      <label htmlFor={selectId} className="block text-sm font-medium text-slate-200">
        {label}
        {props.required && <span className="text-rose-400 ml-1">*</span>}
      </label>
      <select
        id={selectId}
        className={`${componentStyles.input.base} ${error ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/20' : ''} ${className}`}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? `${selectId}-error` : helperText ? `${selectId}-helper` : undefined}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <p id={`${selectId}-error`} className="text-sm text-rose-400" role="alert">
          {error}
        </p>
      )}
      {!error && helperText && (
        <p id={`${selectId}-helper`} className="text-sm text-slate-400">
          {helperText}
        </p>
      )}
    </div>
  );
}
