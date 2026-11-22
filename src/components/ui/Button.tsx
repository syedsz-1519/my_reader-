import * as React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent)] text-[var(--accent-fg)] hover:brightness-95 shadow-[var(--shadow-1)] border border-transparent',
  secondary:
    'bg-[var(--surface-2)] text-[var(--text)] hover:brightness-95 border border-[var(--border)]',
  ghost:
    'bg-transparent text-[var(--text-soft)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] border border-transparent',
  danger:
    'bg-[var(--danger)] text-white hover:brightness-95 border border-transparent shadow-[var(--shadow-1)]',
  'danger-outline':
    'bg-transparent text-[var(--danger)] border border-[var(--danger)] hover:bg-[var(--surface-2)]',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'min-h-[var(--tap-min,44px)] sm:min-h-[38px] px-3 text-[13px] rounded-[var(--r-sm)] whitespace-nowrap',
  md: 'min-h-[var(--tap-min,44px)] px-4 text-[14px] rounded-[var(--r-sm)] whitespace-nowrap',
  lg: 'min-h-[56px] px-5 text-[15px] rounded-[var(--r-full)] whitespace-nowrap',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', loading = false, disabled, className = '', children, ...rest }, ref) => {
    const isDisabled = Boolean(disabled || loading);
    return (
      <button
        ref={ref}
        type={rest.type ?? 'button'}
        disabled={isDisabled}
        aria-disabled={isDisabled || undefined}
        className={`inline-flex items-center justify-center gap-2 font-medium select-none transition-all duration-[var(--dur-fast)] ease-[var(--ease)] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none cursor-pointer ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
        {...rest}
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: ButtonVariant;
  active?: boolean;
  round?: boolean;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, variant = 'ghost', active = false, round = false, className = '', children, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        type={rest.type ?? 'button'}
        aria-label={label}
        title={rest.title ?? label}
        aria-pressed={rest['aria-pressed'] ?? (active ? true : undefined)}
        className={`inline-flex items-center justify-center min-w-[var(--tap-min,44px)] min-h-[var(--tap-min,44px)] shrink-0 select-none transition-all duration-[var(--dur-fast)] ease-[var(--ease)] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none cursor-pointer ${
          round ? 'rounded-[var(--r-full)]' : 'rounded-[var(--r-sm)]'
        } ${
          active
            ? 'bg-[var(--surface-2)] text-[var(--accent)] border border-[var(--border)]'
            : VARIANT_CLASSES[variant]
        } ${className}`}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
IconButton.displayName = 'IconButton';
