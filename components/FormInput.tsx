import { InputHTMLAttributes } from 'react';
import { componentStyles } from '../lib/theme';

interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helperText?: string;
}

/**
 * Form input component with validation error display
 * Shows label, input field, and error/helper text
 */
export function FormInput({
  label,
  error,
  helperText,
  className = '',
  id,
  ...props
}: FormInputProps) {
  const inputId = id || `input-${label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="block text-sm font-medium text-slate-200">
        {label}
        {props.required && <span className="text-rose-400 ml-1">*</span>}
      </label>
      <input
        id={inputId}
        className={`${componentStyles.input.base} ${error ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/20' : ''} ${className}`}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
        {...props}
      />
      {error && (
        <p id={`${inputId}-error`} className="text-sm text-rose-400" role="alert">
          {error}
        </p>
      )}
      {!error && helperText && (
        <p id={`${inputId}-helper`} className="text-sm text-slate-400">
          {helperText}
        </p>
      )}
    </div>
  );
}
