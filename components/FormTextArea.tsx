/* @jsxRuntime classic */
/* @jsx React.createElement */
// Use global React from UMD build
import { componentStyles } from '../lib/theme';

interface FormTextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  helperText?: string;
}

/**
 * Form textarea component with validation error display
 * Shows label, textarea field, and error/helper text
 */
export function FormTextArea({
  label,
  error,
  helperText,
  className = '',
  id,
  rows = 4,
  ...props
}: FormTextAreaProps) {
  const textareaId = id || `textarea-${label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div className="space-y-1">
      <label htmlFor={textareaId} className="block text-sm font-medium text-slate-200">
        {label}
        {props.required && <span className="text-rose-400 ml-1">*</span>}
      </label>
      <textarea
        id={textareaId}
        rows={rows}
        className={`${componentStyles.input.base} resize-y ${error ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/20' : ''} ${className}`}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? `${textareaId}-error` : helperText ? `${textareaId}-helper` : undefined}
        {...props}
      />
      {error && (
        <p id={`${textareaId}-error`} className="text-sm text-rose-400" role="alert">
          {error}
        </p>
      )}
      {!error && helperText && (
        <p id={`${textareaId}-helper`} className="text-sm text-slate-400">
          {helperText}
        </p>
      )}
    </div>
  );
}
