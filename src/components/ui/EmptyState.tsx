import { BookOpen, ShieldCheck } from 'lucide-react';
import { Button } from './Button';

export interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center text-center ${
        compact ? 'py-5 px-3 gap-2' : 'py-8 sm:py-12 px-4 sm:px-6 gap-3 max-w-md mx-auto'
      }`}
    >
      <div
        className={`${
          compact ? 'w-10 h-10' : 'w-12 h-12 max-w-[160px]'
        } rounded-[var(--r-md)] bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-[var(--accent)]`}
        aria-hidden="true"
      >
        <BookOpen className={compact ? 'w-5 h-5' : 'w-6 h-6'} />
      </div>
      <h2
        className={`${
          compact ? 'text-[14px]' : 'text-[18px]'
        } font-semibold text-[var(--text)]`}
      >
        {title}
      </h2>
      <p className="text-[13px] leading-[20px] text-[var(--text-soft)]">{description}</p>
      {actionLabel && onAction && (
        <Button variant="primary" size={compact ? 'sm' : 'md'} onClick={onAction} className="mt-1">
          {actionLabel}
        </Button>
      )}
      {!compact && (
        <p className="inline-flex items-center gap-1.5 text-[12px] text-[var(--text-soft)] mt-2">
          <ShieldCheck className="w-4 h-4 text-[var(--success)] shrink-0" aria-hidden="true" />
          <span>Everything runs in your browser. No text leaves your device.</span>
        </p>
      )}
    </div>
  );
}
