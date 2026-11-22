import * as React from 'react';
import * as Popover from '@radix-ui/react-popover';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  Square,
  Timer,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { TtsEngineSnapshot } from '../engine/types';
import type { SleepTimerMode } from '../hooks/useSleepTimer';
import { Button, IconButton } from './ui/Button';
import { Slider } from './ui/Slider';
import { Tooltip } from './ui/Tooltip';

const SPEED_PRESETS = [0.75, 1, 1.25, 1.5, 2];

export interface PlayerBarProps {
  title: string;
  snapshot: TtsEngineSnapshot;
  totalChars: number;
  onTogglePlay: () => void;
  onStop: () => void;
  onPrevSentence: () => void;
  onNextSentence: () => void;
  onSkipSeconds: (delta: number) => void;
  onSeekChunk: (chunkIndex: number) => void;
  onChangeRate: (rate: number) => void;
  onToggleMute: () => void;
  onChangeVolume: (vol: number) => void;
  sleepMode: SleepTimerMode;
  sleepRemainingSec: number;
  onSelectSleepTimer: (mode: SleepTimerMode) => void;
  onOpenVoiceLab: () => void;
  onToggleSettings: () => void;
  hiddenWhileTyping?: boolean;
}

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function PlayerBar({
  title,
  snapshot,
  totalChars,
  onTogglePlay,
  onStop,
  onPrevSentence,
  onNextSentence,
  onSkipSeconds,
  onSeekChunk,
  onChangeRate,
  onToggleMute,
  onChangeVolume,
  sleepMode,
  sleepRemainingSec,
  onSelectSleepTimer,
  onOpenVoiceLab,
  onToggleSettings,
  hiddenWhileTyping = false,
}: PlayerBarProps) {
  const [expanded, setExpanded] = React.useState(false);
  const touchStartY = React.useRef<number | null>(null);

  // Lock background scroll & support Escape when Full Player Sheet is expanded on mobile
  React.useEffect(() => {
    if (!expanded) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [expanded]);

  const isPlaying = snapshot.state === 'speaking' || snapshot.state === 'loading';
  const isPaused = snapshot.state === 'paused';
  const hasChunks = snapshot.totalChunks > 0;
  const playDisabled = !hasChunks || snapshot.voicesLoading;

  const progressRatio =
    snapshot.totalChunks > 1
      ? snapshot.activeChunkIndex / (snapshot.totalChunks - 1)
      : isPlaying
        ? 1
        : 0;

  const charsPerSec = Math.max(4, snapshot.rate * 14);
  const totalEstSec = totalChars / charsPerSec;
  const elapsedEstSec = totalEstSec * progressRatio;
  const remainingEstSec = Math.max(0, totalEstSec - elapsedEstSec);

  const activeVoiceName =
    snapshot.voices.find((v) => v.id === snapshot.voiceId)?.name ??
    (snapshot.providerId === 'kokoro'
      ? 'Kokoro Neural'
      : snapshot.providerId === 'remote'
        ? 'Remote Server'
        : snapshot.providerId === 'google'
          ? 'Google Cloud TTS'
          : 'System Voice');

  const playButtonContent = snapshot.autoplayBlocked ? (
    <span className="inline-flex items-center gap-1.5 px-3 text-[13px] font-semibold">
      <Play className="w-4 h-4 fill-current" aria-hidden="true" />
      Tap to start
    </span>
  ) : isPlaying ? (
    <Pause className="w-5 h-5 transition-transform duration-[var(--dur-base)]" strokeWidth={1.75} aria-hidden="true" />
  ) : (
    <Play className="w-5 h-5 fill-current ml-0.5 transition-transform duration-[var(--dur-base)]" strokeWidth={1.75} aria-hidden="true" />
  );

  return (
    <>
      {/* Sticky Mini Player (64px mobile / 72px md+) */}
      <div
        role="region"
        aria-label="Audio player"
        className={`fixed bottom-0 left-0 right-0 z-[var(--z-player)] h-[var(--player-h)] bg-[var(--surface)]/95 backdrop-blur-md border-t border-[var(--border)] shadow-[var(--shadow-2)] pb-safe transition-transform duration-[var(--dur-base)] ease-[var(--ease)] ${
          hiddenWhileTyping ? 'translate-y-full pointer-events-none' : 'translate-y-0'
        }`}
        onTouchStart={(e) => {
          touchStartY.current = e.touches[0]?.clientY ?? null;
        }}
        onTouchEnd={(e) => {
          if (touchStartY.current === null) return;
          const endY = e.changedTouches[0]?.clientY ?? touchStartY.current;
          if (touchStartY.current - endY > 36 && window.innerWidth < 768) {
            setExpanded(true);
          }
          touchStartY.current = null;
        }}
      >
        {/* Top Scrubber / Progress Line */}
        <div className="absolute -top-2 left-0 right-0 px-0">
          <input
            type="range"
            min={0}
            max={Math.max(0, snapshot.totalChunks - 1)}
            value={Math.min(snapshot.activeChunkIndex, Math.max(0, snapshot.totalChunks - 1))}
            disabled={!hasChunks}
            onChange={(e) => onSeekChunk(Number(e.target.value))}
            aria-label="Reading progress scrubber"
            aria-valuetext={`Chunk ${snapshot.activeChunkIndex + 1} of ${Math.max(1, snapshot.totalChunks)}`}
            className="w-full h-2 appearance-none bg-transparent cursor-pointer accent-[var(--accent)]"
          />
        </div>

        <div className="h-full max-w-[1440px] mx-auto px-2.5 sm:px-5 flex items-center justify-between gap-2 sm:gap-4">
          {/* Left: Equalizer + Title + Sentence X of Y (tap opens full player sheet on mobile) */}
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined' && window.innerWidth < 768) {
                setExpanded(true);
              }
            }}
            aria-label="Open full player controls"
            className="flex items-center gap-2 min-w-0 flex-1 sm:max-w-[280px] min-h-[44px] text-left rounded-[var(--r-sm)] px-1 md:cursor-default cursor-pointer"
          >
            <div className="flex items-end gap-[2px] h-4 w-4 shrink-0" aria-hidden="true">
              <span className={`eq-bar ${isPlaying ? '' : 'is-paused'}`} />
              <span className={`eq-bar ${isPlaying ? '' : 'is-paused'}`} />
              <span className={`eq-bar ${isPlaying ? '' : 'is-paused'}`} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-[var(--text)] truncate">
                {title || 'No document loaded'}
              </p>
              <p className="text-[12px] text-[var(--text-soft)] tabular-nums truncate">
                {snapshot.totalSentences > 0
                  ? `Sentence ${snapshot.activeSentenceIndex + 1} of ${snapshot.totalSentences}`
                  : 'Ready to read'}
                {totalChars > 0 && (
                  <span className="hidden md:inline">
                    {' '}
                    · <time>{formatClock(elapsedEstSec)}</time> /{' '}
                    <time>-{formatClock(remainingEstSec)}</time>
                  </span>
                )}
              </p>
            </div>
            <ChevronUp className="w-4 h-4 text-[var(--text-soft)] shrink-0 md:hidden" strokeWidth={1.75} aria-hidden="true" />
          </button>

          {/* Center: Primary Transport Controls */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            <IconButton
              label="Previous sentence"
              disabled={!hasChunks}
              onClick={onPrevSentence}
              round
            >
              <ChevronLeft className="w-5 h-5" strokeWidth={1.75} />
            </IconButton>

            <IconButton
              label="Back 10 seconds"
              disabled={!hasChunks}
              onClick={() => onSkipSeconds(-10)}
              round
              className="hidden sm:inline-flex"
            >
              <RotateCcw className="w-4 h-4" strokeWidth={1.75} />
            </IconButton>

            {snapshot.voicesLoading ? (
              <Tooltip content="Loading voices...">
                <span>
                  <Button
                    variant="primary"
                    size="lg"
                    disabled
                    aria-label="Loading voices"
                    className="w-[56px] h-[56px] sm:w-[48px] sm:h-[48px] !px-0 rounded-[var(--r-full)]"
                  >
                    {playButtonContent}
                  </Button>
                </span>
              </Tooltip>
            ) : (
              <Button
                variant="primary"
                size="lg"
                disabled={playDisabled}
                onClick={onTogglePlay}
                aria-label={
                  snapshot.autoplayBlocked
                    ? 'Tap to start audio'
                    : isPlaying
                      ? 'Pause playback'
                      : isPaused
                        ? 'Resume playback'
                        : 'Play audio'
                }
                className={
                  snapshot.autoplayBlocked
                    ? 'rounded-[var(--r-full)] min-h-[48px]'
                    : 'w-[56px] h-[56px] sm:w-[48px] sm:h-[48px] !px-0 rounded-[var(--r-full)]'
                }
              >
                {playButtonContent}
              </Button>
            )}

            <IconButton
              label="Forward 10 seconds"
              disabled={!hasChunks}
              onClick={() => onSkipSeconds(10)}
              round
              className="hidden sm:inline-flex"
            >
              <RotateCw className="w-4 h-4" strokeWidth={1.75} />
            </IconButton>

            <IconButton
              label="Next sentence"
              disabled={!hasChunks}
              onClick={onNextSentence}
              round
            >
              <ChevronRight className="w-5 h-5" strokeWidth={1.75} />
            </IconButton>

            <IconButton
              label="Stop playback"
              disabled={!isPlaying && !isPaused}
              onClick={onStop}
              round
              className="hidden sm:inline-flex"
            >
              <Square className="w-4 h-4" strokeWidth={1.75} />
            </IconButton>
          </div>

          {/* Right: Desktop / Tablet Secondary Controls */}
          <div className="hidden md:flex items-center justify-end gap-1.5 sm:flex-1 sm:max-w-[300px]">
            <Popover.Root>
              <Popover.Trigger asChild>
                <button
                  type="button"
                  aria-label={`Playback speed ${snapshot.rate.toFixed(2)}x`}
                  className="min-h-[40px] px-2.5 rounded-[var(--r-sm)] bg-[var(--surface-2)] border border-[var(--border)] text-[13px] font-medium tabular-nums text-[var(--text)] hover:brightness-95 cursor-pointer whitespace-nowrap"
                >
                  {snapshot.rate.toFixed(2)}x
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  sideOffset={10}
                  align="end"
                  className="z-[var(--z-dialog)] w-64 p-4 rounded-[var(--r-md)] bg-[var(--surface)] border border-[var(--border)] shadow-[var(--shadow-3)] space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-[var(--text)]">Speed</span>
                    <span className="text-[13px] tabular-nums font-medium text-[var(--accent)]">
                      {snapshot.rate.toFixed(2)}x
                    </span>
                  </div>
                  <Slider
                    value={snapshot.rate}
                    min={0.5}
                    max={3.0}
                    step={0.05}
                    onValueChange={onChangeRate}
                    ariaLabel="Reading speed"
                    ariaValueText={`${snapshot.rate.toFixed(2)}x speed`}
                    formatTooltip={(v) => `${v.toFixed(2)}x`}
                  />
                  <div className="flex items-center justify-between gap-1">
                    {SPEED_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => onChangeRate(preset)}
                        className={`flex-1 py-1.5 rounded-[6px] text-[12px] font-medium tabular-nums cursor-pointer ${
                          Math.abs(snapshot.rate - preset) < 0.03
                            ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                            : 'bg-[var(--surface-2)] text-[var(--text)] hover:brightness-95'
                        }`}
                      >
                        {preset}x
                      </button>
                    ))}
                  </div>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>

            <button
              type="button"
              onClick={onOpenVoiceLab}
              className="hidden lg:inline-flex items-center px-2.5 min-h-[38px] max-w-[130px] rounded-[var(--r-sm)] bg-[var(--surface-2)] border border-[var(--border)] text-[12px] text-[var(--text)] truncate cursor-pointer hover:brightness-95"
              title={`Active voice: ${activeVoiceName}`}
            >
              <span className="truncate">{activeVoiceName}</span>
            </button>

            <Popover.Root>
              <Popover.Trigger asChild>
                <IconButton
                  label="Sleep timer"
                  active={sleepMode !== 'off'}
                >
                  <Timer className="w-4 h-4" strokeWidth={1.75} />
                </IconButton>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  sideOffset={10}
                  align="end"
                  className="z-[var(--z-dialog)] w-52 p-2 rounded-[var(--r-md)] bg-[var(--surface)] border border-[var(--border)] shadow-[var(--shadow-3)] space-y-1"
                >
                  <p className="px-2 py-1 text-[12px] font-semibold text-[var(--text-soft)]">
                    Sleep timer
                    {sleepMode !== 'off' && sleepMode !== 'end_of_text' && sleepRemainingSec > 0
                      ? ` (${formatClock(sleepRemainingSec)})`
                      : ''}
                  </p>
                  {(
                    [
                      ['off', 'Off'],
                      ['10', '10 minutes'],
                      ['20', '20 minutes'],
                      ['30', '30 minutes'],
                      ['60', '60 minutes'],
                      ['end_of_text', 'End of document'],
                    ] as const
                  ).map(([modeId, label]) => (
                    <button
                      key={modeId}
                      type="button"
                      onClick={() => onSelectSleepTimer(modeId)}
                      className={`w-full text-left px-2.5 min-h-[38px] rounded-[6px] text-[13px] cursor-pointer ${
                        sleepMode === modeId
                          ? 'bg-[var(--accent)] text-[var(--accent-fg)] font-medium'
                          : 'text-[var(--text)] hover:bg-[var(--surface-2)]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>

            <Popover.Root>
              <Popover.Trigger asChild>
                <IconButton label={snapshot.muted ? 'Unmute audio' : 'Volume controls'}>
                  {snapshot.muted || snapshot.volume === 0 ? (
                    <VolumeX className="w-4 h-4 text-[var(--danger)]" strokeWidth={1.75} />
                  ) : (
                    <Volume2 className="w-4 h-4" strokeWidth={1.75} />
                  )}
                </IconButton>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  sideOffset={10}
                  align="end"
                  className="z-[var(--z-dialog)] w-52 p-3 rounded-[var(--r-md)] bg-[var(--surface)] border border-[var(--border)] shadow-[var(--shadow-3)] space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-[var(--text)]">Volume</span>
                    <button
                      type="button"
                      onClick={onToggleMute}
                      className="text-[12px] text-[var(--accent)] font-medium cursor-pointer"
                    >
                      {snapshot.muted ? 'Unmute' : 'Mute'}
                    </button>
                  </div>
                  <Slider
                    value={snapshot.muted ? 0 : snapshot.volume}
                    min={0}
                    max={1}
                    step={0.05}
                    onValueChange={onChangeVolume}
                    ariaLabel="Audio volume"
                    ariaValueText={`${Math.round((snapshot.muted ? 0 : snapshot.volume) * 100)} percent volume`}
                    formatTooltip={(v) => `${Math.round(v * 100)}%`}
                  />
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>

            <IconButton label="Toggle settings" onClick={onToggleSettings} className="xl:hidden">
              <SlidersHorizontal className="w-4 h-4" strokeWidth={1.75} />
            </IconButton>
          </div>
        </div>
      </div>

      {/* Expandable Full Player Sheet for Mobile (<768px) */}
      {expanded && (
        <div
          className="fixed inset-0 z-[var(--z-dialog)] md:hidden flex flex-col justify-end bg-black/45 backdrop-blur-[2px]"
          onClick={() => setExpanded(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Expanded audio player"
            className="sheet-contain w-full max-h-[92dvh] overflow-y-auto rounded-t-[var(--r-lg)] bg-[var(--surface)] border-t border-[var(--border)] shadow-[var(--shadow-3)] px-5 pt-2 pb-safe flex flex-col gap-5 transition-transform duration-[var(--dur-slow)] ease-[var(--ease)]"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => {
              touchStartY.current = e.touches[0]?.clientY ?? null;
            }}
            onTouchEnd={(e) => {
              if (touchStartY.current === null) return;
              const endY = e.changedTouches[0]?.clientY ?? touchStartY.current;
              if (endY - touchStartY.current > 48) {
                setExpanded(false);
              }
              touchStartY.current = null;
            }}
          >
            {/* Drag Handle + Header */}
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-1.5 rounded-[var(--r-full)] bg-[var(--border)]" aria-hidden="true" />
              <div className="w-full flex items-center justify-between gap-2">
                <IconButton label="Collapse player" onClick={() => setExpanded(false)}>
                  <ChevronDown className="w-5 h-5" strokeWidth={1.75} />
                </IconButton>
                <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">
                  Now Reading
                </span>
                <IconButton
                  label="Open reader settings"
                  onClick={() => {
                    setExpanded(false);
                    onToggleSettings();
                  }}
                >
                  <SlidersHorizontal className="w-5 h-5" strokeWidth={1.75} />
                </IconButton>
              </div>
            </div>

            {/* Title & Progress */}
            <div className="space-y-1 text-center px-2">
              <h2 className="text-[18px] leading-[24px] font-semibold text-[var(--text)] line-clamp-2 text-balance">
                {title || 'No document loaded'}
              </h2>
              <p className="text-[13px] text-[var(--text-soft)] tabular-nums">
                {snapshot.totalSentences > 0
                  ? `Sentence ${snapshot.activeSentenceIndex + 1} of ${snapshot.totalSentences}`
                  : 'Ready to read'}
              </p>
            </div>

            {/* Scrubber Slider */}
            <div className="space-y-1.5">
              <Slider
                value={Math.min(snapshot.activeChunkIndex, Math.max(0, snapshot.totalChunks - 1))}
                min={0}
                max={Math.max(1, snapshot.totalChunks - 1)}
                step={1}
                disabled={!hasChunks}
                onValueChange={(v) => onSeekChunk(v)}
                ariaLabel="Reading progress"
                ariaValueText={`Chunk ${snapshot.activeChunkIndex + 1} of ${Math.max(1, snapshot.totalChunks)}`}
                formatTooltip={(v) => `Chunk ${v + 1}`}
              />
              <div className="flex justify-between text-[12px] text-[var(--text-soft)] tabular-nums">
                <time>{formatClock(elapsedEstSec)}</time>
                <time>-{formatClock(remainingEstSec)}</time>
              </div>
            </div>

            {/* Large Transport Controls (72px Primary Play Button) */}
            <div className="flex items-center justify-center gap-3">
              <IconButton label="Previous sentence" disabled={!hasChunks} onClick={onPrevSentence} round>
                <ChevronLeft className="w-6 h-6" strokeWidth={1.75} />
              </IconButton>
              <IconButton label="Back 10 seconds" disabled={!hasChunks} onClick={() => onSkipSeconds(-10)} round>
                <RotateCcw className="w-5 h-5" strokeWidth={1.75} />
              </IconButton>
              <Button
                variant="primary"
                disabled={playDisabled}
                onClick={onTogglePlay}
                aria-label={isPlaying ? 'Pause playback' : 'Play audio'}
                className="w-[72px] h-[72px] !px-0 rounded-[var(--r-full)] shadow-[var(--shadow-2)]"
              >
                {isPlaying ? (
                  <Pause className="w-7 h-7" strokeWidth={1.75} aria-hidden="true" />
                ) : (
                  <Play className="w-7 h-7 fill-current ml-0.5" strokeWidth={1.75} aria-hidden="true" />
                )}
              </Button>
              <IconButton label="Forward 10 seconds" disabled={!hasChunks} onClick={() => onSkipSeconds(10)} round>
                <RotateCw className="w-5 h-5" strokeWidth={1.75} />
              </IconButton>
              <IconButton label="Next sentence" disabled={!hasChunks} onClick={onNextSentence} round>
                <ChevronRight className="w-6 h-6" strokeWidth={1.75} />
              </IconButton>
            </div>

            {/* Rate Chips */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-medium text-[var(--text)]">Speed</span>
                <span className="tabular-nums font-semibold text-[var(--accent)]">
                  {snapshot.rate.toFixed(2)}x
                </span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {SPEED_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => onChangeRate(preset)}
                    className={`min-h-[44px] rounded-[var(--r-sm)] text-[13px] font-medium tabular-nums border cursor-pointer ${
                      Math.abs(snapshot.rate - preset) < 0.03
                        ? 'bg-[var(--accent)] text-[var(--accent-fg)] border-transparent'
                        : 'bg-[var(--surface-2)] text-[var(--text)] border-[var(--border)]'
                    }`}
                  >
                    {preset}x
                  </button>
                ))}
              </div>
            </div>

            {/* Voice + Stop + Volume */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="secondary"
                  size="md"
                  className="flex-1 min-w-0 justify-between"
                  onClick={() => {
                    setExpanded(false);
                    onOpenVoiceLab();
                  }}
                >
                  <span className="truncate">{activeVoiceName}</span>
                  <span className="text-[12px] text-[var(--text-soft)]">Change</span>
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  disabled={!isPlaying && !isPaused}
                  onClick={() => {
                    onStop();
                    setExpanded(false);
                  }}
                >
                  <Square className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                  Stop
                </Button>
              </div>

              <div className="flex items-center gap-3">
                <IconButton label={snapshot.muted ? 'Unmute audio' : 'Mute audio'} onClick={onToggleMute}>
                  {snapshot.muted || snapshot.volume === 0 ? (
                    <VolumeX className="w-5 h-5 text-[var(--danger)]" strokeWidth={1.75} />
                  ) : (
                    <Volume2 className="w-5 h-5" strokeWidth={1.75} />
                  )}
                </IconButton>
                <div className="flex-1">
                  <Slider
                    value={snapshot.muted ? 0 : snapshot.volume}
                    min={0}
                    max={1}
                    step={0.05}
                    onValueChange={onChangeVolume}
                    ariaLabel="Volume"
                    ariaValueText={`${Math.round((snapshot.muted ? 0 : snapshot.volume) * 100)} percent`}
                    formatTooltip={(v) => `${Math.round(v * 100)}%`}
                  />
                </div>
              </div>

              {/* Sleep timer horizontal chips */}
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                <Timer className="w-4 h-4 text-[var(--text-soft)] shrink-0" strokeWidth={1.75} aria-hidden="true" />
                {(
                  [
                    ['off', 'Timer off'],
                    ['10', '10m'],
                    ['20', '20m'],
                    ['30', '30m'],
                    ['60', '60m'],
                    ['end_of_text', 'End of doc'],
                  ] as const
                ).map(([modeId, label]) => (
                  <button
                    key={modeId}
                    type="button"
                    onClick={() => onSelectSleepTimer(modeId)}
                    className={`min-h-[44px] px-3 rounded-[var(--r-sm)] text-[12px] font-medium whitespace-nowrap shrink-0 border cursor-pointer ${
                      sleepMode === modeId
                        ? 'bg-[var(--accent)] text-[var(--accent-fg)] border-transparent'
                        : 'bg-[var(--surface-2)] text-[var(--text)] border-[var(--border)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
