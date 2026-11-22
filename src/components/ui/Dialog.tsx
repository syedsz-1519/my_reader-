import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { IconButton } from './Button';

export interface ModalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  maxWidthClass?: string;
  mobileSheet?: boolean;
  headerExtra?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function ModalDialog({
  open,
  onOpenChange,
  title,
  description,
  maxWidthClass = 'max-w-3xl',
  mobileSheet = false,
  headerExtra,
  footer,
  children,
}: ModalDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[var(--z-dialog)] bg-black/45 backdrop-blur-[2px] transition-opacity duration-[var(--dur-base)]" />
        <DialogPrimitive.Content
          className={`fixed z-[var(--z-dialog)] bg-[var(--surface)] text-[var(--text)] border border-[var(--border)] shadow-[var(--shadow-3)] flex flex-col overflow-hidden focus:outline-none ${
            mobileSheet
              ? 'inset-x-0 bottom-0 max-h-[90dvh] rounded-t-[var(--r-lg)] sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[calc(100vw-2rem)] sm:max-h-[88dvh] sm:rounded-[var(--r-md)] ' +
                maxWidthClass
              : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-1.5rem)] max-h-[88dvh] rounded-[var(--r-md)] ' +
                maxWidthClass
          }`}
        >
          {mobileSheet && (
            <div className="sm:hidden flex justify-center pt-2 pb-1 shrink-0" aria-hidden="true">
              <div className="w-10 h-1 rounded-[var(--r-full)] bg-[var(--border)]" />
            </div>
          )}

          <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-[var(--border)] shrink-0">
            <div className="min-w-0">
              {headerExtra}
              <DialogPrimitive.Title className="text-[18px] leading-[26px] font-semibold text-[var(--text)]">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="text-[13px] leading-[18px] text-[var(--text-soft)] mt-1">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close asChild>
              <IconButton label="Close dialog" variant="ghost">
                <X className="w-5 h-5" />
              </IconButton>
            </DialogPrimitive.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

          {footer && (
            <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--surface-2)] shrink-0">
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
