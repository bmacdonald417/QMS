import { forwardRef, type InputHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = '', id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    const base =
      'w-full rounded-lg border bg-surface-elevated px-3 py-2 text-gray-100 placeholder-gray-500 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-mactech-blue focus:ring-offset-2 focus:ring-offset-surface disabled:opacity-50';
    const borderClass = error
      ? 'border-compliance-red focus:ring-compliance-red'
      : 'border-surface-border hover:border-gray-500';

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="label-caps block mb-1.5">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`${base} ${borderClass} ${className}`}
          aria-invalid={!!error}
          aria-describedby={hint ? `${inputId}-hint` : error ? `${inputId}-error` : undefined}
          {...props}
        />
        {hint && !error && (
          <p id={`${inputId}-hint`} className="mt-1 text-xs text-gray-500">
            {hint}
          </p>
        )}
        {error && (
          <p id={`${inputId}-error`} className="mt-1 text-xs text-compliance-red" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
