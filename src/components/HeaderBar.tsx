import {
  BarChart3,
  BookOpen,
  Download,
  FileText,
  PanelLeft,
  Settings2,
  Sparkles,
  WifiOff,
} from 'lucide-react';
import type { ThemeMode } from '../engine/storage';
import { Button, IconButton } from './ui/Button';

export type ActiveWorkspaceView = 'reader' | 'documents' | 'stats';

export interface HeaderBarProps {
  activeView: ActiveWorkspaceView;
  onChangeView: (view: ActiveWorkspaceView) => void;
  theme: ThemeMode;
  onChangeTheme: (theme: ThemeMode) => void;
  libraryOpen: boolean;
  onToggleLibrary: () => void;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  onOpenVoiceLab: () => void;
  onOpenSlmTools?: () => void;
  isOnline: boolean;
  isInstallable: boolean;
  isInstalled: boolean;
  onInstallPwa: () => void;
  activeProviderLabel: string;
  headerHidden?: boolean;
}

const THEME_OPTIONS: Array<{ id: ThemeMode; label: string }> = [
  { id: 'light', label: 'Light' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'Auto' },
];

export function HeaderBar({
  activeView,
  onChangeView,
  theme,
  onChangeTheme,
  libraryOpen,
  onToggleLibrary,
  settingsOpen,
  onToggleSettings,
  onOpenVoiceLab,
  onOpenSlmTools,
  isOnline,
  isInstallable,
  isInstalled,
  onInstallPwa,
  activeProviderLabel,
  headerHidden = false,
}: HeaderBarProps) {
  return (
    <header
      className={`mobile-landscape-hide sticky top-0 z-30 h-14 md:h-16 pt-safe w-full border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-md px-2.5 sm:px-5 flex items-center justify-between gap-2 transition-transform duration-[var(--dur-base)] ease-[var(--ease)] ${
        headerHidden ? '-translate-y-full md:translate-y-0' : 'translate-y-0'
      }`}
    >
      {/* Left: Sidebar toggle + Logo + View navigation */}
      <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
        <IconButton
          label={libraryOpen ? 'Hide library sidebar' : 'Show library sidebar'}
          active={libraryOpen}
          onClick={onToggleLibrary}
        >
          <PanelLeft className="w-5 h-5" strokeWidth={1.75} />
        </IconButton>

        <div className="flex items-center gap-2 min-w-0">
          <svg
            viewBox="0 0 36 36"
            className="w-7 h-7 sm:w-8 sm:h-8 shrink-0"
            aria-hidden="true"
            fill="none"
          >
            <rect width="36" height="36" rx="9" fill="var(--accent)" />
            <rect x="7" y="9" width="14" height="18" rx="2.5" fill="var(--surface)" />
            <rect x="9.5" y="13" width="9" height="1.8" rx="0.9" fill="var(--accent)" opacity="0.35" />
            <rect x="9.5" y="16.5" width="9" height="2.2" rx="1.1" fill="var(--hl-word-bg)" />
            <rect x="9.5" y="20.5" width="7" height="1.8" rx="0.9" fill="var(--accent)" opacity="0.35" />
            <path
              d="M24 14C25.8 15.5 26.8 16.8 26.8 18C26.8 19.2 25.8 20.5 24 22"
              stroke="var(--surface)"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M26.8 11.2C29.4 13.4 30.8 15.6 30.8 18C30.8 20.4 29.4 22.6 26.8 24.8"
              stroke="var(--hl-word-bg)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <span className="font-semibold text-[16px] sm:text-[18px] tracking-tight text-[var(--text)] truncate whitespace-nowrap">
            TTS Reader
          </span>
        </div>

        <nav aria-label="Primary workspace views" className="hidden md:flex items-center gap-1 ml-2">
          <button
            type="button"
            onClick={() => onChangeView('reader')}
            className={`inline-flex items-center gap-1.5 px-3 min-h-[38px] rounded-[var(--r-sm)] text-[14px] font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              activeView === 'reader'
                ? 'bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border)]'
                : 'text-[var(--text-soft)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]'
            }`}
          >
            <BookOpen className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
            Reader
          </button>
          <button
            type="button"
            onClick={() => onChangeView('documents')}
            className={`inline-flex items-center gap-1.5 px-3 min-h-[38px] rounded-[var(--r-sm)] text-[14px] font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              activeView === 'documents'
                ? 'bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border)]'
                : 'text-[var(--text-soft)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]'
            }`}
          >
            <FileText className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
            Documents
          </button>
          <button
            type="button"
            onClick={() => onChangeView('stats')}
            className={`inline-flex items-center gap-1.5 px-3 min-h-[38px] rounded-[var(--r-sm)] text-[14px] font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              activeView === 'stats'
                ? 'bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border)]'
                : 'text-[var(--text-soft)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]'
            }`}
          >
            <BarChart3 className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
            Stats
          </button>
        </nav>
      </div>

      {/* Right: Offline info + Theme + Voice Lab + Settings */}
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        {!isOnline ? (
          <span className="hidden lg:inline-flex items-center gap-1.5 text-[12px] text-[var(--text-soft)] pr-1 whitespace-nowrap">
            <WifiOff className="w-3.5 h-3.5 text-[var(--accent)]" strokeWidth={1.75} aria-hidden="true" />
            Offline · Saved ready
          </span>
        ) : (
          <span className="hidden xl:inline-flex items-center gap-1.5 text-[12px] text-[var(--text-soft)] pr-1 whitespace-nowrap">
            <span>{activeProviderLabel}</span>
          </span>
        )}

        <div
          role="group"
          aria-label="Theme"
          className="hidden sm:flex items-center bg-[var(--surface-2)] p-0.5 rounded-[var(--r-sm)] border border-[var(--border)]"
        >
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              aria-pressed={theme === opt.id}
              onClick={() => onChangeTheme(opt.id)}
              className={`px-2.5 min-h-[32px] rounded-[6px] text-[12px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                theme === opt.id
                  ? 'bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-1)]'
                  : 'text-[var(--text-soft)] hover:text-[var(--text)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {onOpenSlmTools && (
          <Button
            size="sm"
            variant="secondary"
            onClick={onOpenSlmTools}
            className="hidden lg:inline-flex"
            title="Clean & summarize tools"
          >
            <Sparkles className="w-4 h-4 text-[var(--accent)]" strokeWidth={1.75} aria-hidden="true" />
            <span>Prep Text</span>
          </Button>
        )}

        <Button
          size="sm"
          variant="secondary"
          onClick={onOpenVoiceLab}
          aria-label="Open Voice Lab and speech settings"
          className="hidden sm:inline-flex"
        >
          <span className="text-[13px] font-medium">Voice Lab</span>
        </Button>

        {isInstallable && !isInstalled && (
          <IconButton label="Install app" onClick={onInstallPwa} variant="ghost">
            <Download className="w-4 h-4" strokeWidth={1.75} />
          </IconButton>
        )}

        <IconButton
          label={settingsOpen ? 'Hide settings panel' : 'Show settings panel'}
          active={settingsOpen}
          onClick={onToggleSettings}
        >
          <Settings2 className="w-5 h-5" strokeWidth={1.75} />
        </IconButton>
      </div>
    </header>
  );
}
