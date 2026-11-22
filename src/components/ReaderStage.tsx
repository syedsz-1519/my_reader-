import * as React from 'react';
import {
  AlertTriangle,
  ArrowDown,
  BookmarkPlus,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Eye,
  FileEdit,
  Play,
  RotateCw,
  Ruler,
  Sparkles,
  X,
} from 'lucide-react';
import type { HighlightColor, TextHighlight } from '../db/libraryDb';
import type { BoundaryPosition, DocumentStructure, TtsEngineSnapshot } from '../engine/types';
import { Button, IconButton } from './ui/Button';
import { EmptyState } from './ui/EmptyState';

const PARAGRAPHS_PER_PAGE = 60;
const LONG_DOC_THRESHOLD_CHARS = 50_000;

export interface ReaderStageProps {
  title: string;
  author?: string;
  document: DocumentStructure;
  snapshot: TtsEngineSnapshot;
  boundary: BoundaryPosition | null;
  followAlong: boolean;
  onToggleFollowAlong: () => void;
  focusMode: boolean;
  onToggleFocusMode: () => void;
  readingRuler: boolean;
  onToggleReadingRuler: () => void;
  highlights: TextHighlight[];
  onSaveHighlight: (sentenceIndex: number, text: string, color: HighlightColor, note?: string) => void;
  onSeekToSentence: (sentenceIndex: number) => void;
  onPlaySentence: (sentenceIndex: number) => void;
  onRetry: () => void;
  onSwitchToKokoro: () => void;
  onOpenInputEditor: () => void;
  editingOpen: boolean;
  onLoadSample: () => void;
  onOpenSlmTools: () => void;
  tourCompleted: boolean;
  onCompleteTour: () => void;
  inputSlot?: React.ReactNode;
}

const HIGHLIGHT_CLASSES: Record<HighlightColor, string> = {
  yellow: 'underline decoration-[#E6B800] decoration-2 underline-offset-4',
  green: 'underline decoration-[#1E6B3A] decoration-2 underline-offset-4',
  blue: 'underline decoration-[#1A73E8] decoration-2 underline-offset-4',
  pink: 'underline decoration-[#C2185B] decoration-2 underline-offset-4',
};

const HIGHLIGHT_SWATCHES: Array<{ id: HighlightColor; label: string; bg: string }> = [
  { id: 'yellow', label: 'Yellow', bg: 'bg-[#E6B800]' },
  { id: 'green', label: 'Green', bg: 'bg-[#1E6B3A]' },
  { id: 'blue', label: 'Blue', bg: 'bg-[#1A73E8]' },
  { id: 'pink', label: 'Pink', bg: 'bg-[#C2185B]' },
];

export function ReaderStage({
  title,
  author,
  document: doc,
  snapshot,
  boundary,
  followAlong,
  onToggleFollowAlong,
  focusMode,
  onToggleFocusMode,
  readingRuler,
  onToggleReadingRuler,
  highlights,
  onSaveHighlight,
  onSeekToSentence,
  onPlaySentence,
  onRetry,
  onSwitchToKokoro,
  onOpenInputEditor,
  editingOpen,
  onLoadSample,
  onOpenSlmTools,
  tourCompleted,
  onCompleteTour,
  inputSlot,
}: ReaderStageProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const activeSentenceElRef = React.useRef<HTMLSpanElement | null>(null);
  const longPressTimerRef = React.useRef<number | null>(null);
  const longPressOriginRef = React.useRef<{ x: number; y: number } | null>(null);
  const longPressTriggeredRef = React.useRef(false);

  const [manualPausedFollow, setManualPausedFollow] = React.useState(false);
  const [selectedHighlightColor, setSelectedHighlightColor] = React.useState<HighlightColor>('yellow');
  const [tourStep, setTourStep] = React.useState(0);
  const [pageIndex, setPageIndex] = React.useState(0);

  // Floating long-press / context-menu Highlight & Note popover state
  const [contextSentence, setContextSentence] = React.useState<{
    index: number;
    text: string;
  } | null>(null);
  const [contextColor, setContextColor] = React.useState<HighlightColor>('yellow');
  const [contextNote, setContextNote] = React.useState('');

  const isLongDoc = doc.totalChars > LONG_DOC_THRESHOLD_CHARS;
  const totalPages = isLongDoc ? Math.max(1, Math.ceil(doc.paragraphs.length / PARAGRAPHS_PER_PAGE)) : 1;
  const activePage = isLongDoc ? Math.floor(snapshot.activeParagraphIndex / PARAGRAPHS_PER_PAGE) : 0;
  const [prevActivePage, setPrevActivePage] = React.useState(activePage);
  if (activePage !== prevActivePage) {
    setPrevActivePage(activePage);
    setPageIndex(activePage);
  }

  const visibleParagraphs = React.useMemo(() => {
    if (!isLongDoc) return doc.paragraphs;
    const start = pageIndex * PARAGRAPHS_PER_PAGE;
    return doc.paragraphs.slice(start, start + PARAGRAPHS_PER_PAGE);
  }, [doc.paragraphs, isLongDoc, pageIndex]);

  // Direct DOM class update via refs + rAF for word highlights
  React.useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const activeSentenceEl = activeSentenceElRef.current;
      if (!activeSentenceEl) return;
      const wordSpans = activeSentenceEl.querySelectorAll<HTMLSpanElement>('[data-w]');
      const activeWordIdx = boundary?.wordIndex ?? snapshot.activeWordIndex;
      for (const el of wordSpans) {
        const wIdx = Number(el.dataset.w);
        if (wIdx === activeWordIdx && (snapshot.state === 'speaking' || snapshot.state === 'paused')) {
          el.classList.add('is-active-word');
        } else {
          el.classList.remove('is-active-word');
        }
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [boundary?.wordIndex, snapshot.activeWordIndex, snapshot.activeSentenceIndex, snapshot.state]);

  // Follow-along auto-scroll (~35% from top of viewport) + manual scroll detection
  React.useEffect(() => {
    if (!followAlong || manualPausedFollow) return;
    if (snapshot.state !== 'speaking' && snapshot.state !== 'loading') return;

    const el = activeSentenceElRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const targetTop = window.innerHeight * 0.35;
    if (Math.abs(rect.top - targetTop) > 70) {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({
        top: Math.max(0, window.scrollY + rect.top - targetTop),
        behavior: reduced ? 'auto' : 'smooth',
      });
    }
  }, [snapshot.activeSentenceIndex, snapshot.state, followAlong, manualPausedFollow]);

  React.useEffect(() => {
    if (!followAlong) return;
    const onUserScrollIntent = () => {
      if (snapshot.state === 'speaking') {
        setManualPausedFollow(true);
      }
    };
    window.addEventListener('wheel', onUserScrollIntent, { passive: true });
    window.addEventListener('touchmove', onUserScrollIntent, { passive: true });
    return () => {
      window.removeEventListener('wheel', onUserScrollIntent);
      window.removeEventListener('touchmove', onUserScrollIntent);
    };
  }, [followAlong, snapshot.state]);

  React.useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressOriginRef.current = null;
  };

  const openContextMenuForSentence = (index: number, text: string) => {
    setContextSentence({ index, text });
    setContextColor(selectedHighlightColor);
    setContextNote('');
  };

  const jumpToCurrent = () => {
    setManualPausedFollow(false);
    if (!followAlong) onToggleFollowAlong();
    const el = activeSentenceElRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      window.scrollTo({
        top: Math.max(0, window.scrollY + rect.top - window.innerHeight * 0.35),
        behavior: 'smooth',
      });
    }
  };

  const highlightBySentence = React.useMemo(() => {
    const map = new Map<number, TextHighlight>();
    for (const h of highlights) map.set(h.sentenceIndex, h);
    return map;
  }, [highlights]);

  const activeChunk = doc.chunks[snapshot.activeChunkIndex];
  const isWebSpeechUnsupported =
    snapshot.providerId === 'webspeech' &&
    typeof window !== 'undefined' &&
    !('speechSynthesis' in window);
  const hasNoVoices = !snapshot.voicesLoading && snapshot.voices.length === 0;

  return (
    <main
      ref={containerRef}
      className="flex-1 min-w-0 px-4 sm:px-6 md:px-8 py-5 sm:py-8 pb-[calc(var(--player-h)+72px)]"
    >
      <div className="mx-auto w-full max-w-[var(--read-measure)] space-y-5 sm:space-y-6">
        {/* Top Reader Toolbar (horizontally scrollable chip strip on mobile) */}
        <div className="flex flex-nowrap sm:flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[var(--border)] overflow-x-auto">
          <div className="flex flex-nowrap sm:flex-wrap items-center gap-1.5 shrink-0">
            <Button
              size="sm"
              variant={editingOpen ? 'primary' : 'secondary'}
              onClick={onOpenInputEditor}
              className="shrink-0"
            >
              <FileEdit className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
              {editingOpen ? 'Hide Editor' : 'Paste / Import'}
            </Button>

            <Button
              size="sm"
              variant="ghost"
              aria-pressed={followAlong && !manualPausedFollow}
              onClick={() => {
                setManualPausedFollow(false);
                onToggleFollowAlong();
              }}
              className="shrink-0"
            >
              <Crosshair className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
              Follow
            </Button>

            <Button
              size="sm"
              variant="ghost"
              aria-pressed={focusMode}
              onClick={onToggleFocusMode}
              className="shrink-0"
            >
              <Eye className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
              Focus
            </Button>

            <Button
              size="sm"
              variant="ghost"
              aria-pressed={readingRuler}
              onClick={onToggleReadingRuler}
              className="shrink-0"
            >
              <Ruler className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
              Ruler
            </Button>
          </div>

          <div className="flex flex-nowrap items-center gap-1.5 shrink-0">
            {doc.sentences.length > 0 && (
              <>
                <select
                  aria-label="Highlight color"
                  value={selectedHighlightColor}
                  onChange={(e) => setSelectedHighlightColor(e.target.value as HighlightColor)}
                  className="min-h-[44px] sm:min-h-[38px] px-2.5 rounded-[var(--r-sm)] bg-[var(--surface-2)] border border-[var(--border)] text-[13px] sm:text-[12px] text-[var(--text)] shrink-0"
                >
                  <option value="yellow">Yellow marker</option>
                  <option value="green">Green marker</option>
                  <option value="blue">Blue marker</option>
                  <option value="pink">Pink marker</option>
                </select>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const activeS = doc.sentences[snapshot.activeSentenceIndex];
                    if (activeS) {
                      onSaveHighlight(activeS.index, activeS.text, selectedHighlightColor);
                    }
                  }}
                  title="Bookmark or highlight the current sentence"
                  className="shrink-0"
                >
                  <BookmarkPlus className="w-4 h-4 text-[var(--accent)]" strokeWidth={1.75} aria-hidden="true" />
                  <span>Highlight</span>
                </Button>
              </>
            )}

            <Button size="sm" variant="ghost" onClick={onOpenSlmTools} className="shrink-0">
              <Sparkles className="w-4 h-4 text-[var(--accent)]" strokeWidth={1.75} aria-hidden="true" />
              Clean & Summary
            </Button>
          </div>
        </div>

        {/* Inline Input Editor Slot */}
        {editingOpen && inputSlot}

        {/* First-Run 3-Step Skippable Tour */}
        {!tourCompleted && doc.sentences.length > 0 && (
          <div
            role="region"
            aria-label="Quick start guide"
            className="p-3.5 rounded-[var(--r-md)] bg-[var(--surface)] border border-[var(--accent)] shadow-[var(--shadow-1)] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="space-y-1 min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
                Tip {tourStep + 1} of 3
              </p>
              <p className="text-[13px] leading-[19px] text-[var(--text)]">
                {tourStep === 0 && 'Tap any sentence to jump straight there, or long-press a sentence to highlight and add a note.'}
                {tourStep === 1 && 'Press Space to Play/Pause, arrow keys for sentences, and T to switch Light, Sepia, or Dark themes.'}
                {tourStep === 2 && 'Open Voice Lab for offline Kokoro neural voices, WAV/MP3 export, and custom pronunciation rules.'}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 shrink-0">
              <Button size="sm" variant="ghost" onClick={onCompleteTour}>
                Skip tour
              </Button>
              {tourStep < 2 ? (
                <Button size="sm" variant="primary" onClick={() => setTourStep((s) => s + 1)}>
                  Next
                </Button>
              ) : (
                <Button size="sm" variant="primary" onClick={onCompleteTour}>
                  Got it
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Unsupported Browser State */}
        {isWebSpeechUnsupported && (
          <div className="p-4 sm:p-5 rounded-[var(--r-md)] bg-[var(--surface)] border border-[var(--border)] space-y-3">
            <h2 className="text-[16px] font-semibold text-[var(--text)]">
              Browser built-in speech is unavailable here
            </h2>
            <p className="text-[14px] text-[var(--text-soft)]">
              Your current browser does not support Web Speech synthesis. You can switch to the offline Kokoro Neural voice engine or try Chrome, Edge, or Safari.
            </p>
            <Button variant="primary" size="sm" onClick={onSwitchToKokoro}>
              Switch to Kokoro Offline Voices
            </Button>
          </div>
        )}

        {/* Zero-Voice Notice */}
        {!isWebSpeechUnsupported && hasNoVoices && (
          <div className="p-3.5 sm:p-4 rounded-[var(--r-md)] bg-[var(--surface-2)] border border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-[13px] text-[var(--text)]">
              No device voices found for this browser. Try Chrome, Edge, or Safari — or switch to offline Kokoro Neural voices.
            </p>
            <Button size="sm" variant="secondary" onClick={onSwitchToKokoro} className="self-start sm:self-auto">
              Use Kokoro Neural
            </Button>
          </div>
        )}

        {/* Inline Error Banner */}
        {snapshot.error && (
          <div
            role="alert"
            className="p-3.5 sm:p-4 rounded-[var(--r-md)] bg-[var(--surface)] border border-[var(--danger)] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <AlertTriangle className="w-5 h-5 text-[var(--danger)] shrink-0 mt-0.5" strokeWidth={1.75} aria-hidden="true" />
              <div className="space-y-0.5 min-w-0">
                <p className="text-[14px] font-medium text-[var(--text)]">{snapshot.error.message}</p>
                {snapshot.error.detail && (
                  <p className="text-[12px] text-[var(--text-soft)] break-words">{snapshot.error.detail}</p>
                )}
              </div>
            </div>
            <Button size="sm" variant="secondary" onClick={onRetry} className="self-start sm:self-auto">
              <RotateCw className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
              Retry
            </Button>
          </div>
        )}

        {/* Document Header (Single h1) */}
        <header className="space-y-2 pt-1">
          <h1 className="text-[clamp(24px,4vw,34px)] leading-[1.2] font-semibold text-[var(--text)] tracking-tight text-balance">
            {title || 'TTS Reader'}
          </h1>
          {(author || doc.totalWords > 0) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-[var(--text-soft)]">
              {author && <span>{author}</span>}
              {doc.totalWords > 0 && (
                <div className="flex items-center gap-2">
                  <span className="tabular-nums">{doc.totalWords.toLocaleString()} words</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">
                    ~{Math.max(1, Math.ceil(doc.totalWords / 165))} min listen
                  </span>
                </div>
              )}
              {doc.sentences.length > 0 && snapshot.state === 'idle' && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => onPlaySentence(snapshot.activeSentenceIndex)}
                  className="sm:ml-auto"
                >
                  <Play className="w-4 h-4 fill-current" strokeWidth={1.75} aria-hidden="true" />
                  Listen
                </Button>
              )}
            </div>
          )}
        </header>

        {/* Empty State or Reading Prose */}
        {doc.sentences.length === 0 ? (
          <EmptyState
            title="Paste or upload text to start"
            description="Drop a TXT, Markdown, PDF, Word, EPUB, or scanned image file above, or load a short sample passage."
            actionLabel="Load sample text"
            onAction={onLoadSample}
          />
        ) : (
          <article className="reader-prose space-y-5 sm:space-y-6">
            {isLongDoc && (
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-[var(--r-sm)] bg-[var(--surface-2)] border border-[var(--border)] text-[12px]">
                <span className="text-[var(--text-soft)] tabular-nums">
                  Section {pageIndex + 1} of {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pageIndex === 0}
                    onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                  >
                    <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
                    Prev
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pageIndex >= totalPages - 1}
                    onClick={() => setPageIndex((p) => Math.min(totalPages - 1, p + 1))}
                  >
                    Next
                    <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
                  </Button>
                </div>
              </div>
            )}

            {visibleParagraphs.map((para) => {
              const isParaActive = para.index === snapshot.activeParagraphIndex;
              const dimmed = focusMode && snapshot.state !== 'idle' && !isParaActive;
              const rulerClass = readingRuler && isParaActive ? 'reading-ruler-active px-2.5 py-1.5 -mx-2.5' : '';

              const Tag = para.isHeading ? 'h2' : 'p';

              return (
                <Tag
                  key={para.index}
                  dir={para.dir}
                  className={`${
                    para.isHeading ? 'reader-heading pt-2' : ''
                  } ${dimmed ? 'focus-dimmed' : ''} ${rulerClass}`}
                >
                  {para.sentences.map((sentence, idxInPara) => {
                    const isSentenceActive = sentence.index === snapshot.activeSentenceIndex;
                    const isPaused = snapshot.state === 'paused' && isSentenceActive;
                    const savedHl = highlightBySentence.get(sentence.index);

                    return (
                      <React.Fragment key={sentence.index}>
                        {idxInPara > 0 && ' '}
                        <span
                          ref={isSentenceActive ? activeSentenceElRef : undefined}
                          data-s={sentence.index}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            if (longPressTriggeredRef.current) {
                              longPressTriggeredRef.current = false;
                              return;
                            }
                            onSeekToSentence(sentence.index);
                          }}
                          onTouchStart={(e) => {
                            const touch = e.touches[0];
                            if (!touch) return;
                            longPressOriginRef.current = { x: touch.clientX, y: touch.clientY };
                            longPressTriggeredRef.current = false;
                            clearLongPressTimer();
                            longPressTimerRef.current = window.setTimeout(() => {
                              longPressTriggeredRef.current = true;
                              openContextMenuForSentence(sentence.index, sentence.text);
                            }, 450);
                          }}
                          onTouchMove={(e) => {
                            const origin = longPressOriginRef.current;
                            const touch = e.touches[0];
                            if (!origin || !touch) return;
                            if (
                              Math.abs(touch.clientX - origin.x) > 10 ||
                              Math.abs(touch.clientY - origin.y) > 10
                            ) {
                              clearLongPressTimer();
                            }
                          }}
                          onTouchEnd={() => clearLongPressTimer()}
                          onTouchCancel={() => clearLongPressTimer()}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            openContextMenuForSentence(sentence.index, sentence.text);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onSeekToSentence(sentence.index);
                            }
                          }}
                          className={`sentence-span ${
                            isSentenceActive && snapshot.state !== 'idle' ? 'is-active' : ''
                          } ${isPaused ? 'is-paused' : ''} ${
                            savedHl ? HIGHLIGHT_CLASSES[savedHl.color] : ''
                          }`}
                        >
                          {isSentenceActive && activeChunk && activeChunk.sentenceIndex === sentence.index
                            ? renderChunkWords(activeChunk.text, activeChunk.words)
                            : sentence.text}
                        </span>
                      </React.Fragment>
                    );
                  })}
                </Tag>
              );
            })}
          </article>
        )}
      </div>

      {/* Floating "Jump to current" pill when user scrolls manually */}
      {manualPausedFollow && snapshot.state === 'speaking' && (
        <div className="fixed bottom-[calc(var(--player-h)+18px)] left-1/2 -translate-x-1/2 z-30 max-w-[calc(100vw-2rem)]">
          <Button
            size="sm"
            variant="primary"
            onClick={jumpToCurrent}
            className="rounded-[var(--r-full)] shadow-[var(--shadow-2)]"
          >
            <ArrowDown className="w-4 h-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span className="truncate">
              Jump to sentence {snapshot.activeSentenceIndex + 1}/{snapshot.totalSentences}
            </span>
          </Button>
        </div>
      )}

      {/* Sentence Highlight & Note Menu (Long-Press / Right-Click) */}
      {contextSentence && (
        <div
          className="fixed inset-0 z-[var(--z-dialog)] flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/35 backdrop-blur-[1px]"
          onClick={() => setContextSentence(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Highlight and add note"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-[var(--r-lg)] sm:rounded-[var(--r-md)] bg-[var(--surface)] border border-[var(--border)] shadow-[var(--shadow-3)] p-4 pb-safe space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
                  Sentence {contextSentence.index + 1}
                </p>
                <p className="text-[13px] text-[var(--text-soft)] line-clamp-2 mt-0.5">
                  “{contextSentence.text}”
                </p>
              </div>
              <IconButton label="Close sentence menu" onClick={() => setContextSentence(null)}>
                <X className="w-4 h-4" strokeWidth={1.75} />
              </IconButton>
            </div>

            <div className="flex items-center gap-2" role="radiogroup" aria-label="Highlight color">
              {HIGHLIGHT_SWATCHES.map((sw) => (
                <button
                  key={sw.id}
                  type="button"
                  role="radio"
                  aria-checked={contextColor === sw.id}
                  aria-label={`${sw.label} highlight`}
                  onClick={() => {
                    setContextColor(sw.id);
                    setSelectedHighlightColor(sw.id);
                  }}
                  className={`min-w-[44px] min-h-[44px] rounded-[var(--r-sm)] border flex items-center justify-center cursor-pointer ${
                    contextColor === sw.id
                      ? 'border-[var(--accent)] bg-[var(--surface-2)] ring-2 ring-[var(--accent)]/30'
                      : 'border-[var(--border)] bg-[var(--surface)]'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full ${sw.bg}`} aria-hidden="true" />
                </button>
              ))}
            </div>

            <input
              type="text"
              value={contextNote}
              onChange={(e) => setContextNote(e.target.value)}
              placeholder="Optional note for this sentence…"
              aria-label="Highlight note"
              className="w-full min-h-[44px] px-3 rounded-[var(--r-sm)] bg-[var(--surface-2)] border border-[var(--border)] text-[16px] sm:text-[13px] text-[var(--text)]"
            />

            <div className="flex items-center justify-between gap-2 pt-1">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const target = contextSentence.index;
                  setContextSentence(null);
                  onPlaySentence(target);
                }}
              >
                <Play className="w-4 h-4 fill-current" strokeWidth={1.75} aria-hidden="true" />
                Listen from here
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  onSaveHighlight(
                    contextSentence.index,
                    contextSentence.text,
                    contextColor,
                    contextNote.trim(),
                  );
                  setContextSentence(null);
                }}
              >
                Save highlight
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function renderChunkWords(
  text: string,
  words: Array<{ index: number; start: number; end: number }>,
): React.ReactNode {
  if (words.length === 0) return text;
  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  for (const w of words) {
    if (w.start > cursor) {
      nodes.push(text.slice(cursor, w.start));
    }
    nodes.push(
      <span key={w.index} data-w={w.index} className="word-span">
        {text.slice(w.start, w.end)}
      </span>,
    );
    cursor = w.end;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }
  return nodes;
}
