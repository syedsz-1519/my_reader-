import * as React from 'react';
import { AlertCircle, CheckCircle2, Info, RotateCw, X } from 'lucide-react';
import { Button, IconButton } from './Button';

export interface ToastMessage {
  id: string;
  kind: 'info' | 'success' | 'error';
  message: string;
  onRetry?: () => void;
}

export interface ToastBannerProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

export function ToastBanner({ toast, onDismiss }: ToastBannerProps) {
  React.useEffect(() => {
    if (!toast || toast.kind === 'error') return;
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const isError = toast.kind === 'error';
  const Icon = isError ? AlertCircle : toast.kind === 'success' ? CheckCircle2 : Info;

  return (
    <div
      role="status"
      aria-live={isError ? 'assertive' : 'polite'}
      className="fixed bottom-[calc(var(--player-h)+14px+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-[var(--z-toast)] w-[min(calc(100vw-1.5rem),480px)] pointer-events-auto"
    >
      <div
        className={`flex items-center gap-3 px-4 py-2.5 rounded-[var(--r-md)] border shadow-[var(--shadow-2)] ${
          isError
            ? 'bg-[var(--surface)] border-[var(--danger)] text-[var(--text)]'
            : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text)]'
        }`}
      >
        <Icon
          className={`w-5 h-5 shrink-0 ${
            isError
              ? 'text-[var(--danger)]'
              : toast.kind === 'success'
                ? 'text-[var(--success)]'
                : 'text-[var(--accent)]'
          }`}
          aria-hidden="true"
        />
        <p className="text-[14px] leading-[20px] flex-1 min-w-0">{toast.message}</p>
        {toast.onRetry && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              toast.onRetry?.();
              onDismiss();
            }}
          >
            <RotateCw className="w-3.5 h-3.5" />
            Retry
          </Button>
        )}
        <IconButton label="Dismiss notification" onClick={onDismiss} className="-mr-2">
          <X className="w-4 h-4" />
        </IconButton>
      </div>
    </div>
  );
}
