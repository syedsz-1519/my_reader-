import { ModalDialog } from './ui/Dialog';

export interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SHORTCUTS = [
  { keys: 'Space', desc: 'Play or pause audio' },
  { keys: '← / →', desc: 'Previous or next sentence' },
  { keys: 'Shift + ← / →', desc: 'Previous or next paragraph' },
  { keys: '↑ / ↓', desc: 'Adjust playback speed ±0.1x' },
  { keys: 'M', desc: 'Mute or unmute audio' },
  { keys: '/', desc: 'Focus text input editor' },
  { keys: 'T', desc: 'Cycle Light / Sepia / Dark theme' },
  { keys: '?', desc: 'Open this keyboard shortcuts guide' },
];

export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  return (
    <ModalDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Keyboard Shortcuts"
      description="Shortcuts work anywhere outside of text input fields."
      maxWidthClass="max-w-md"
    >
      <div className="divide-y divide-[var(--border)]">
        {SHORTCUTS.map((item) => (
          <div key={item.keys} className="flex items-center justify-between py-2.5 gap-4">
            <span className="text-[14px] text-[var(--text)]">{item.desc}</span>
            <kbd className="px-2 py-1 text-[12px] font-mono rounded-[6px] bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] whitespace-nowrap">
              {item.keys}
            </kbd>
          </div>
        ))}
      </div>
    </ModalDialog>
  );
}
