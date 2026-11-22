import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import {
  ChevronDown,
  CloudOff,
  Download,
  FileAudio,
  Keyboard,
  Languages,
  Play,
  ShieldCheck,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import { FEATURES } from '../config/features';
import type { PersistedReaderState, ReaderFont, ThemeMode } from '../engine/storage';
import type { TtsEngineSnapshot, TtsProvider, TtsVoice } from '../engine/types';
import { buildCueSheet, synthesizeDocumentToWav, type ExportProgress } from '../export/wavExporter';
import type { GoogleCloudTtsProvider } from '../providers/googleTtsProvider';
import type { RemoteOpenAIProvider } from '../providers/remoteProvider';
import { Button, IconButton } from './ui/Button';
import { Slider } from './ui/Slider';
import { Tooltip } from './ui/Tooltip';

export interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  snapshot: TtsEngineSnapshot;
  activeProvider: TtsProvider;
  prefs: PersistedReaderState;
  detectedLang: string;
  autoDetectLang: boolean;
  onToggleAutoDetectLang: () => void;
  onUpdatePrefs: (patch: Partial<PersistedReaderState>) => void;
  onChangeRate: (rate: number) => void;
  onChangePitch: (pitch: number) => void;
  onChangeVolume: (vol: number) => void;
  onSelectVoice: (voiceId: string) => void;
  onPreviewVoice: (voiceId: string) => void;
  onOpenVoiceLab: (initialTab?: 'runtime' | 'voices' | 'dictionary' | 'cadence') => void;
  onOpenShortcuts: () => void;
  onNotify: (msg: { kind: 'info' | 'success' | 'error'; message: string }) => void;
  spokenText: string;
  documentTitle: string;
  onDeviceSlmEnabled: boolean;
  onToggleOnDeviceSlm: (enabled: boolean) => void;
  isInstallable: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  onInstallPwa: () => void;
}

type SectionKey =
  | 'voice'
  | 'speed'
  | 'reading'
  | 'theme'
  | 'accessibility'
  | 'filters'
  | 'export'
  | 'ai'
  | 'privacy';

export function SettingsPanel({
  open,
  onClose,
  snapshot,
  activeProvider,
  prefs,
  detectedLang,
  autoDetectLang,
  onToggleAutoDetectLang,
  onUpdatePrefs,
  onChangeRate,
  onChangePitch,
  onChangeVolume,
  onSelectVoice,
  onPreviewVoice,
  onOpenVoiceLab,
  onOpenShortcuts,
  onNotify,
  spokenText,
  documentTitle,
  onDeviceSlmEnabled,
  onToggleOnDeviceSlm,
  isInstallable,
  isInstalled,
  isIOS,
  onInstallPwa,
}: SettingsPanelProps) {
  const [voiceSearch, setVoiceSearch] = React.useState('');
  const [exportProgress, setExportProgress] = React.useState<ExportProgress | null>(null);
  const [sheetSnap, setSheetSnap] = React.useState<'half' | 'full'>('half');
  const [openSections, setOpenSections] = React.useState<Record<SectionKey, boolean>>({
    voice: true,
    speed: true,
    reading: true,
    theme: true,
    accessibility: false,
    filters: false,
    export: false,
    ai: false,
    privacy: true,
  });

  const exportAbortRef = React.useRef<AbortController | null>(null);
  const dragStartY = React.useRef<number | null>(null);

  // Body scroll lock & Escape handler when shown as an overlay (<1280px)
  React.useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    if (window.innerWidth >= 1280) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const toggleSection = (key: SectionKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const groupedVoices = React.useMemo(() => {
    const q = voiceSearch.trim().toLowerCase();
    const filtered = snapshot.voices.filter(
      (v) => !q || v.name.toLowerCase().includes(q) || v.lang.toLowerCase().includes(q),
    );
    const map = new Map<string, TtsVoice[]>();
    for (const v of filtered) {
      const langKey = v.lang.split('-')[0].toUpperCase() || 'OTHER';
      const arr = map.get(langKey) ?? [];
      arr.push(v);
      map.set(langKey, arr);
    }
    return Array.from(map.entries());
  }, [snapshot.voices, voiceSearch]);

  const canExportAudio = activeProvider.capabilities.exportAudio && spokenText.trim().length > 0;

  const handleExportWav = async (
    withMarkers: 'wav' | 'cue' | 'json' | 'remote-encoded' | 'google-mp3',
  ) => {
    if (!activeProvider.capabilities.exportAudio) {
      onNotify({
        kind: 'info',
        message: "Browsers can't export system voices. Switch to Kokoro, Google Cloud, or Remote Server.",
      });
      return;
    }

    const safeName = (documentTitle || 'tts-reading').replace(/[^a-z0-9-_]+/gi, '_');

    if (withMarkers === 'google-mp3' && activeProvider.id === 'google') {
      const abort = new AbortController();
      exportAbortRef.current = abort;
      try {
        setExportProgress({ completedChunks: 0, totalChunks: 1, percent: 5 });
        const google = activeProvider as GoogleCloudTtsProvider;
        const blob = await google.fetchDocumentMp3(
          spokenText,
          {
            voiceId: snapshot.voiceId,
            lang: snapshot.lang,
            rate: snapshot.rate,
            pitch: snapshot.pitch,
          },
          (p) => setExportProgress(p),
          abort.signal,
        );
        setExportProgress(null);
        triggerDownload(blob, `${safeName}.mp3`);
        onNotify({ kind: 'success', message: 'Downloaded MP3 audio.' });
      } catch (err) {
        setExportProgress(null);
        if (err instanceof DOMException && err.name === 'AbortError') {
          onNotify({ kind: 'info', message: 'Export canceled.' });
        } else {
          onNotify({
            kind: 'error',
            message: err instanceof Error ? err.message : 'Google Cloud MP3 export failed.',
          });
        }
      } finally {
        exportAbortRef.current = null;
      }
      return;
    }

    if (withMarkers === 'remote-encoded' && activeProvider.id === 'remote') {
      try {
        setExportProgress({ completedChunks: 0, totalChunks: 1, percent: 30 });
        const remote = activeProvider as RemoteOpenAIProvider;
        const blob = await remote.fetchEncodedAudio(spokenText.slice(0, 4000), {
          voiceId: snapshot.voiceId,
          rate: snapshot.rate,
        });
        triggerDownload(blob, `${safeName}.${prefs.remoteFormat}`);
        setExportProgress(null);
        onNotify({ kind: 'success', message: `Downloaded ${prefs.remoteFormat.toUpperCase()} audio.` });
      } catch (err) {
        setExportProgress(null);
        onNotify({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Remote audio export failed.',
        });
      }
      return;
    }

    const abort = new AbortController();
    exportAbortRef.current = abort;
    try {
      setExportProgress({ completedChunks: 0, totalChunks: 1, percent: 1 });
      const res = await synthesizeDocumentToWav(
        spokenText,
        activeProvider,
        {
          voiceId: snapshot.voiceId,
          lang: snapshot.lang,
          rate: snapshot.rate,
          pitch: snapshot.pitch,
          volume: snapshot.volume,
        },
        (p) => setExportProgress(p),
        abort.signal,
      );
      setExportProgress(null);

      if (withMarkers === 'cue') {
        const cue = buildCueSheet(documentTitle || 'TTS Reader', `${safeName}.wav`, res.markers);
        triggerDownload(new Blob([cue], { type: 'text/plain;charset=utf-8' }), `${safeName}.cue`);
      } else if (withMarkers === 'json') {
        const json = JSON.stringify(
          { title: documentTitle, durationSec: res.totalDurationSec, markers: res.markers },
          null,
          2,
        );
        triggerDownload(new Blob([json], { type: 'application/json' }), `${safeName}.markers.json`);
      } else {
        triggerDownload(res.wavBlob, `${safeName}.wav`);
      }
      onNotify({ kind: 'success', message: 'Audio export ready.' });
    } catch (err) {
      setExportProgress(null);
      if (err instanceof DOMException && err.name === 'AbortError') {
        onNotify({ kind: 'info', message: 'Export canceled.' });
      } else {
        onNotify({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Audio export failed.',
        });
      }
    } finally {
      exportAbortRef.current = null;
    }
  };

  if (!open) return null;

  const snapHeightClass = sheetSnap === 'full' ? 'h-[90dvh]' : 'h-[54dvh]';

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px] xl:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        aria-label="Reader settings"
        className={`sheet-contain fixed sm:top-[var(--header-h)] sm:right-0 bottom-0 left-0 sm:left-auto z-50 xl:z-10 xl:sticky ${snapHeightClass} sm:h-[calc(100dvh-var(--header-h)-var(--player-h))] w-full sm:w-[min(92vw,360px)] xl:w-[var(--panel-w)] rounded-t-[var(--r-lg)] sm:rounded-none shrink-0 bg-[var(--surface)] border-t sm:border-t-0 sm:border-l border-[var(--border)] flex flex-col overflow-hidden shadow-[var(--shadow-3)] xl:shadow-none transition-[height] duration-[var(--dur-base)] ease-[var(--ease)]`}
      >
        {/* Mobile drag handle (tap to toggle 50% / 90%, swipe up/down to snap/close) */}
        <button
          type="button"
          aria-label={sheetSnap === 'half' ? 'Expand settings sheet to full height' : 'Shrink settings sheet'}
          onClick={() => setSheetSnap((s) => (s === 'half' ? 'full' : 'half'))}
          onTouchStart={(e) => {
            dragStartY.current = e.touches[0]?.clientY ?? null;
          }}
          onTouchEnd={(e) => {
            if (dragStartY.current === null) return;
            const endY = e.changedTouches[0]?.clientY ?? dragStartY.current;
            const delta = endY - dragStartY.current;
            if (delta < -36) {
              setSheetSnap('full');
            } else if (delta > 48) {
              if (sheetSnap === 'full') setSheetSnap('half');
              else onClose();
            }
            dragStartY.current = null;
          }}
          className="sm:hidden w-full flex flex-col items-center justify-center py-2.5 shrink-0 cursor-grab active:cursor-grabbing"
        >
          <span className="w-10 h-1.5 rounded-[var(--r-full)] bg-[var(--border)]" />
        </button>

        <div className="px-4 py-2.5 sm:py-3 border-b border-[var(--border)] flex items-center justify-between gap-2 shrink-0">
          <h2 className="text-[14px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">
            Settings
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSheetSnap((s) => (s === 'half' ? 'full' : 'half'))}
              className="sm:hidden min-h-[36px] px-2.5 rounded-[6px] text-[12px] font-medium text-[var(--accent)] cursor-pointer"
            >
              {sheetSnap === 'half' ? 'Full view' : 'Half view'}
            </button>
            <IconButton label="Close settings" onClick={onClose} className="xl:hidden">
              <X className="w-4 h-4" strokeWidth={1.75} />
            </IconButton>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 sm:py-4 space-y-4 sm:space-y-5">
          {/* Voice & Provider */}
          <AccordionSection
            title="Voice"
            isOpen={openSections.voice}
            onToggle={() => toggleSection('voice')}
            headerRight={
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenVoiceLab('runtime');
                }}
                className="min-h-[36px] px-2 text-[12px] font-medium text-[var(--accent)] hover:underline cursor-pointer"
              >
                Voice Lab
              </button>
            }
          >
            <div className="p-2.5 rounded-[var(--r-sm)] bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-[var(--text)] truncate">
                  {activeProvider.name}
                </p>
                <p className="text-[11px] text-[var(--text-soft)]">
                  Detected language: <span className="uppercase font-medium">{detectedLang}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={onToggleAutoDetectLang}
                aria-pressed={autoDetectLang}
                className="inline-flex items-center gap-1 px-2.5 min-h-[38px] rounded-[6px] bg-[var(--surface)] border border-[var(--border)] text-[11px] text-[var(--text)] cursor-pointer shrink-0"
                title="Automatically pick saved voice for detected language"
              >
                <Languages className="w-3.5 h-3.5 text-[var(--accent)]" strokeWidth={1.75} aria-hidden="true" />
                {autoDetectLang ? 'Auto-lang ON' : 'Auto-lang OFF'}
              </button>
            </div>

            <input
              type="search"
              value={voiceSearch}
              onChange={(e) => setVoiceSearch(e.target.value)}
              placeholder="Search voices or language…"
              aria-label="Search voices"
              className="w-full min-h-[44px] sm:min-h-[38px] px-3 rounded-[var(--r-sm)] bg-[var(--surface-2)] border border-[var(--border)] text-[16px] sm:text-[13px] text-[var(--text)]"
            />

            {snapshot.voicesLoading ? (
              <div className="space-y-2" aria-busy="true">
                <div className="h-10 rounded-[var(--r-sm)] bg-[var(--surface-2)] animate-pulse" />
                <div className="h-10 rounded-[var(--r-sm)] bg-[var(--surface-2)] animate-pulse" />
              </div>
            ) : groupedVoices.length === 0 ? (
              <p className="text-[12px] text-[var(--text-soft)] p-2.5 rounded-[var(--r-sm)] bg-[var(--surface-2)]">
                No voices found. Try Chrome, Edge or Safari, or switch to Kokoro in Voice Lab.
              </p>
            ) : (
              <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                {groupedVoices.map(([groupLang, list]) => (
                  <div key={groupLang} className="space-y-1">
                    <p className="text-[11px] font-semibold text-[var(--text-soft)] px-1">{groupLang}</p>
                    {list.map((voice) => {
                      const selected = voice.id === snapshot.voiceId;
                      return (
                        <div
                          key={voice.id}
                          className={`flex items-center justify-between gap-1 px-2 py-1 rounded-[var(--r-sm)] border ${
                            selected
                              ? 'bg-[var(--surface-2)] border-[var(--accent)]'
                              : 'border-transparent hover:bg-[var(--surface-2)]'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => onSelectVoice(voice.id)}
                            className="flex-1 min-w-0 min-h-[44px] sm:min-h-[36px] text-left cursor-pointer py-1"
                          >
                            <p className="text-[13px] sm:text-[12px] font-medium text-[var(--text)] truncate">
                              {voice.name}
                            </p>
                            <p className="text-[11px] text-[var(--text-soft)]">
                              {voice.lang} ·{' '}
                              <span className="font-medium">
                                {voice.badge ?? (voice.localService ? 'Local' : 'Network')}
                              </span>
                            </p>
                          </button>
                          <IconButton
                            label={`Preview ${voice.name}`}
                            onClick={() => onPreviewVoice(voice.id)}
                          >
                            <Play className="w-4 h-4" strokeWidth={1.75} />
                          </IconButton>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </AccordionSection>

          {/* Speed, Pitch & Volume */}
          <AccordionSection
            title="Speed & Pitch"
            isOpen={openSections.speed}
            onToggle={() => toggleSection('speed')}
            summary={`${snapshot.rate.toFixed(2)}x`}
          >
            <div className="space-y-1">
              <div className="flex justify-between text-[12px]">
                <span className="text-[var(--text-soft)]">Speed</span>
                <span className="tabular-nums font-medium">{snapshot.rate.toFixed(2)}x</span>
              </div>
              <Slider
                value={snapshot.rate}
                min={0.5}
                max={3.0}
                step={0.05}
                onValueChange={onChangeRate}
                ariaLabel="Speed"
                ariaValueText={`${snapshot.rate.toFixed(2)}x speed`}
                formatTooltip={(v) => `${v.toFixed(2)}x`}
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[12px]">
                <span className="text-[var(--text-soft)]">Pitch</span>
                <span className="tabular-nums font-medium">{snapshot.pitch.toFixed(2)}</span>
              </div>
              <Slider
                value={snapshot.pitch}
                min={0.5}
                max={2.0}
                step={0.05}
                onValueChange={onChangePitch}
                ariaLabel="Pitch"
                ariaValueText={`Pitch ${snapshot.pitch.toFixed(2)}`}
                formatTooltip={(v) => v.toFixed(2)}
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[12px]">
                <span className="text-[var(--text-soft)] flex items-center gap-1">
                  <Volume2 className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" /> Volume
                </span>
                <span className="tabular-nums font-medium">{Math.round(snapshot.volume * 100)}%</span>
              </div>
              <Slider
                value={snapshot.volume}
                min={0}
                max={1}
                step={0.05}
                onValueChange={onChangeVolume}
                ariaLabel="Volume"
                ariaValueText={`${Math.round(snapshot.volume * 100)} percent`}
                formatTooltip={(v) => `${Math.round(v * 100)}%`}
              />
            </div>
          </AccordionSection>

          {/* Reading Typography */}
          <AccordionSection
            title="Reading & Typography"
            isOpen={openSections.reading}
            onToggle={() => toggleSection('reading')}
            summary={`${prefs.readSize}px`}
          >
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  ['literata', 'Literata'],
                  ['inter', 'Inter'],
                  ['opendyslexic', 'Dyslexic'],
                ] as Array<[ReaderFont, string]>
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onUpdatePrefs({ readerFont: id })}
                  className={`min-h-[44px] sm:min-h-[38px] rounded-[var(--r-sm)] text-[12px] font-medium border cursor-pointer ${
                    prefs.readerFont === id
                      ? 'bg-[var(--accent)] text-[var(--accent-fg)] border-transparent'
                      : 'bg-[var(--surface-2)] text-[var(--text)] border-[var(--border)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[12px]">
                <span className="text-[var(--text-soft)]">Font size</span>
                <span className="tabular-nums font-medium">{prefs.readSize}px</span>
              </div>
              <Slider
                value={prefs.readSize}
                min={16}
                max={32}
                step={1}
                onValueChange={(v) => onUpdatePrefs({ readSize: v })}
                ariaLabel="Font size"
                ariaValueText={`${prefs.readSize} pixels`}
                formatTooltip={(v) => `${v}px`}
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[12px]">
                <span className="text-[var(--text-soft)]">Column width</span>
                <span className="tabular-nums font-medium">{prefs.readMeasure}ch</span>
              </div>
              <Slider
                value={prefs.readMeasure}
                min={62}
                max={72}
                step={2}
                onValueChange={(v) => onUpdatePrefs({ readMeasure: v })}
                ariaLabel="Reading measure"
                ariaValueText={`${prefs.readMeasure} characters wide`}
                formatTooltip={(v) => `${v}ch`}
              />
            </div>
          </AccordionSection>

          {/* Theme */}
          <AccordionSection
            title="Theme"
            isOpen={openSections.theme}
            onToggle={() => toggleSection('theme')}
            summary={prefs.theme}
          >
            <div className="grid grid-cols-4 gap-1.5">
              {(['light', 'sepia', 'dark', 'system'] as ThemeMode[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onUpdatePrefs({ theme: t })}
                  className={`min-h-[44px] sm:min-h-[38px] rounded-[var(--r-sm)] text-[12px] font-medium capitalize border cursor-pointer ${
                    prefs.theme === t
                      ? 'bg-[var(--accent)] text-[var(--accent-fg)] border-transparent'
                      : 'bg-[var(--surface-2)] text-[var(--text)] border-[var(--border)]'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </AccordionSection>

          {/* Accessibility */}
          <AccordionSection
            title="Accessibility"
            isOpen={openSections.accessibility}
            onToggle={() => toggleSection('accessibility')}
            summary={prefs.largeControls ? 'Large' : 'Standard'}
          >
            <SettingToggleRow
              label="Large controls (52px targets)"
              checked={prefs.largeControls}
              onCheckedChange={(val) => onUpdatePrefs({ largeControls: val })}
            />
          </AccordionSection>

          {/* Filters & Pronunciation */}
          <AccordionSection
            title="Filters & Pronunciation"
            isOpen={openSections.filters}
            onToggle={() => toggleSection('filters')}
            headerRight={
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenVoiceLab('dictionary');
                }}
                className="min-h-[36px] px-2 text-[12px] font-medium text-[var(--accent)] hover:underline cursor-pointer"
              >
                Dictionary ({prefs.pronunciationRules.length})
              </button>
            }
          >
            {(
              [
                ['skipUrls', 'Skip URLs'],
                ['skipEmojis', 'Skip emojis'],
                ['skipMarkdown', 'Strip Markdown syntax'],
                ['expandAbbreviations', 'Expand Dr., e.g., months'],
                ['normalizeNumbers', 'Normalize numbers & currency'],
              ] as const
            ).map(([key, label]) => (
              <SettingToggleRow
                key={key}
                label={label}
                checked={prefs.filters[key]}
                onCheckedChange={(val) =>
                  onUpdatePrefs({ filters: { ...prefs.filters, [key]: val } })
                }
              />
            ))}
          </AccordionSection>

          {/* Audio Export */}
          {FEATURES.audioExport && (
            <AccordionSection
              title="Audio Export"
              isOpen={openSections.export}
              onToggle={() => toggleSection('export')}
              icon={<FileAudio className="w-4 h-4 text-[var(--accent)]" strokeWidth={1.75} aria-hidden="true" />}
            >
              {!activeProvider.capabilities.exportAudio ? (
                <Tooltip content="Browsers can't export system voices. Switch to Kokoro Neural, Google Cloud TTS, or Remote Server in Voice Lab.">
                  <div className="p-2.5 rounded-[var(--r-sm)] bg-[var(--surface-2)] border border-[var(--border)] text-[12px] text-[var(--text-soft)]">
                    Browsers can’t export system voices. Switch to{' '}
                    <button
                      type="button"
                      onClick={() => onOpenVoiceLab('runtime')}
                      className="text-[var(--accent)] font-medium underline cursor-pointer"
                    >
                      Kokoro Neural or Google Cloud
                    </button>{' '}
                    to export WAV or MP3 audio.
                  </div>
                </Tooltip>
              ) : (
                <div className="space-y-2">
                  {exportProgress && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[12px] tabular-nums">
                        <span>Rendering audio…</span>
                        <span>{exportProgress.percent}%</span>
                      </div>
                      <div className="h-1.5 rounded-[var(--r-full)] bg-[var(--border)] overflow-hidden">
                        <div
                          className="h-full bg-[var(--accent)]"
                          style={{ width: `${exportProgress.percent}%` }}
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => exportAbortRef.current?.abort()}
                      >
                        Cancel export
                      </Button>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!canExportAudio || Boolean(exportProgress)}
                      onClick={() => void handleExportWav('wav')}
                    >
                      <Download className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                      Export WAV
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!canExportAudio || Boolean(exportProgress)}
                      onClick={() => void handleExportWav('cue')}
                    >
                      .CUE
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!canExportAudio || Boolean(exportProgress)}
                      onClick={() => void handleExportWav('json')}
                    >
                      JSON markers
                    </Button>
                    {activeProvider.id === 'google' && (
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={!canExportAudio || Boolean(exportProgress)}
                        onClick={() => void handleExportWav('google-mp3')}
                      >
                        <Download className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                        Export MP3
                      </Button>
                    )}
                    {activeProvider.id === 'remote' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!canExportAudio || Boolean(exportProgress)}
                        onClick={() => void handleExportWav('remote-encoded')}
                      >
                        Remote {prefs.remoteFormat.toUpperCase()}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </AccordionSection>
          )}

          {/* On-Device AI & Cloud */}
          <AccordionSection
            title="On-Device AI & Cloud"
            isOpen={openSections.ai}
            onToggle={() => toggleSection('ai')}
            icon={<Sparkles className="w-4 h-4 text-[var(--accent)]" strokeWidth={1.75} aria-hidden="true" />}
          >
            <SettingToggleRow
              label="Enable local SLM weights (260–483 MB)"
              checked={onDeviceSlmEnabled}
              onCheckedChange={onToggleOnDeviceSlm}
            />

            <div className="p-2.5 rounded-[var(--r-sm)] bg-[var(--surface-2)] border border-[var(--border)] space-y-1.5 opacity-85">
              <div className="flex items-center justify-between text-[12px] font-medium text-[var(--text)]">
                <span className="flex items-center gap-1.5">
                  <CloudOff className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                  Cloud Sync & AI Summary
                </span>
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--surface)] border border-[var(--border)]">
                  Disabled
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-soft)]">
                Optional Supabase library sync and Claude cloud summaries are feature-flagged off by default. Configure keys in .env to enable.
              </p>
            </div>
          </AccordionSection>

          {/* Shortcuts, Install & Privacy */}
          <section className="space-y-2.5 pt-3 border-t border-[var(--border)]">
            <Button size="sm" variant="secondary" className="w-full" onClick={onOpenShortcuts}>
              <Keyboard className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
              Keyboard shortcuts (?)
            </Button>

            {isInstallable && !isInstalled && (
              <Button size="sm" variant="primary" className="w-full" onClick={onInstallPwa}>
                <Download className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                Install offline app
              </Button>
            )}

            {isIOS && !isInstalled && (
              <p className="text-[11px] text-[var(--text-soft)] p-2 rounded-[var(--r-sm)] bg-[var(--surface-2)]">
                On iOS Safari: tap Share → “Add to Home Screen” for standalone offline reading.
              </p>
            )}

            <p className="flex items-start gap-2 text-[12px] leading-[18px] text-[var(--text-soft)] pt-1">
              <ShieldCheck className="w-4 h-4 text-[var(--success)] shrink-0 mt-0.5" strokeWidth={1.75} aria-hidden="true" />
              <span>
                {activeProvider.id === 'google'
                  ? 'Google Cloud TTS is active (opt-in): reading text is sent via /api/google-tts without server logging.'
                  : activeProvider.id === 'remote'
                    ? 'Remote TTS server is active: speech requests route to your configured endpoint.'
                    : 'Everything runs in your browser. No text leaves your device.'}
              </span>
            </p>
          </section>
        </div>

        {/* Sticky Done CTA on Mobile Sheet */}
        <div className="sm:hidden px-4 pt-2.5 pb-safe border-t border-[var(--border)] bg-[var(--surface)] shrink-0">
          <Button variant="primary" size="md" className="w-full" onClick={onClose}>
            Done
          </Button>
        </div>
      </aside>
    </>
  );
}

function AccordionSection({
  title,
  summary,
  icon,
  headerRight,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  summary?: string;
  icon?: React.ReactNode;
  headerRight?: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="pt-3 border-t border-[var(--border)] first:pt-0 first:border-t-0 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          className="sm:pointer-events-none flex-1 min-w-0 min-h-[40px] sm:min-h-0 flex items-center justify-between gap-2 text-left cursor-pointer"
        >
          <span className="text-[13px] font-semibold text-[var(--text)] flex items-center gap-1.5">
            {icon}
            {title}
          </span>
          <span className="sm:hidden flex items-center gap-1.5 text-[12px] text-[var(--text-soft)]">
            {summary && <span className="capitalize tabular-nums">{summary}</span>}
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-[var(--dur-fast)] ${
                isOpen ? 'rotate-180' : 'rotate-0'
              }`}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </span>
        </button>
        {headerRight}
      </div>
      <div className={`${isOpen ? 'block' : 'hidden'} sm:block space-y-2.5`}>{children}</div>
    </section>
  );
}

function SettingToggleRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 min-h-[44px] sm:min-h-[34px] py-1 cursor-pointer">
      <span className="text-[13px] text-[var(--text)]">{label}</span>
      <SwitchPrimitive.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="w-11 h-6 rounded-[var(--r-full)] bg-[var(--border)] data-[state=checked]:bg-[var(--accent)] transition-colors relative shrink-0 cursor-pointer"
      >
        <SwitchPrimitive.Thumb className="block w-4 h-4 rounded-[var(--r-full)] bg-white shadow transition-transform translate-x-1 data-[state=checked]:translate-x-6" />
      </SwitchPrimitive.Root>
    </label>
  );
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
