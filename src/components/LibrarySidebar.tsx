import * as React from 'react';
import {
  Bookmark,
  Check,
  Copy,
  Download,
  Edit3,
  FilePlus2,
  ListTree,
  MoreVertical,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  exportHighlightsMarkdown,
  MAX_LIBRARY_ITEMS,
  type LibraryDocument,
  type TextHighlight,
} from '../db/libraryDb';
import { Button, IconButton } from './ui/Button';
import { EmptyState } from './ui/EmptyState';

export interface LibrarySidebarProps {
  open: boolean;
  onClose: () => void;
  documents: LibraryDocument[];
  activeDocumentId: string | null;
  onSelectDocument: (doc: LibraryDocument) => void;
  onNewDocument: () => void;
  onLoadSample: () => void;
  onRenameDocument: (id: string, nextTitle: string) => void;
  onDuplicateDocument: (doc: LibraryDocument) => void;
  onDeleteDocument: (id: string) => void;
  activeDocument: LibraryDocument | null;
  onSelectChapter: (chapterIndex: number) => void;
  highlights: TextHighlight[];
  onJumpToSentence: (sentenceIndex: number) => void;
  onUpdateHighlightNote: (id: string, note: string) => void;
  onDeleteHighlight: (id: string) => void;
}

const HIGHLIGHT_DOT_COLORS: Record<TextHighlight['color'], string> = {
  yellow: 'bg-[#E6B800]',
  green: 'bg-[#1E6B3A]',
  blue: 'bg-[#1A73E8]',
  pink: 'bg-[#C2185B]',
};

export function LibrarySidebar({
  open,
  onClose,
  documents,
  activeDocumentId,
  onSelectDocument,
  onNewDocument,
  onLoadSample,
  onRenameDocument,
  onDuplicateDocument,
  onDeleteDocument,
  activeDocument,
  onSelectChapter,
  highlights,
  onJumpToSentence,
  onUpdateHighlightNote,
  onDeleteHighlight,
}: LibrarySidebarProps) {
  const [tab, setTab] = React.useState<'library' | 'highlights' | 'chapters'>('library');
  const [menuOpenId, setMenuOpenId] = React.useState<string | null>(null);
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [renameDraft, setRenameDraft] = React.useState('');
  const [editingNoteId, setEditingNoteId] = React.useState<string | null>(null);
  const [noteDraft, setNoteDraft] = React.useState('');

  const drawerRef = React.useRef<HTMLElement | null>(null);
  const swipeStartX = React.useRef<number | null>(null);

  const hasChapters = Boolean(activeDocument?.chapters && activeDocument.chapters.length > 0);

  // Focus management, Escape close & mobile body scroll lock
  React.useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const isDrawer = window.innerWidth < 1024;
    if (!isDrawer) return;

    const prevOverflow = document.body.style.overflow;
    const prevFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    drawerRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
      prevFocus?.focus?.();
    };
  }, [open, onClose]);

  const handleExportHighlights = () => {
    const md = exportHighlightsMarkdown(activeDocument?.title ?? 'Document', highlights);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(activeDocument?.title || 'highlights').replace(/[^a-z0-9-_]+/gi, '_')}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop on mobile/tablet */}
      <div
        className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px] lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      <nav
        ref={drawerRef}
        tabIndex={-1}
        aria-label="Document library"
        onTouchStart={(e) => {
          swipeStartX.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          if (swipeStartX.current === null || window.innerWidth >= 1024) return;
          const endX = e.changedTouches[0]?.clientX ?? swipeStartX.current;
          if (swipeStartX.current - endX > 48) {
            onClose();
          }
          swipeStartX.current = null;
        }}
        className="sheet-contain fixed inset-y-0 left-0 z-50 lg:z-10 lg:sticky lg:top-[var(--header-h)] h-[100dvh] lg:h-[calc(100dvh-var(--header-h)-var(--player-h))] w-[var(--sidebar-w)] shrink-0 bg-[var(--surface)] border-r border-[var(--border)] flex flex-col overflow-hidden shadow-[var(--shadow-3)] lg:shadow-none pt-safe lg:pt-0 focus:outline-none transition-transform duration-[var(--dur-slow)] ease-[var(--ease)]"
      >
        <div className="p-3 border-b border-[var(--border)] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">
              Library
            </span>
            <span className="text-[12px] tabular-nums text-[var(--text-soft)]">
              · {documents.length}/{MAX_LIBRARY_ITEMS}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="primary" onClick={onNewDocument}>
              <FilePlus2 className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
              New
            </Button>
            <IconButton label="Close library" onClick={onClose} className="lg:hidden">
              <X className="w-4 h-4" strokeWidth={1.75} />
            </IconButton>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex border-b border-[var(--border)] bg-[var(--surface-2)] px-2 pt-1 gap-1">
          <button
            type="button"
            onClick={() => setTab('library')}
            className={`flex-1 min-h-[44px] sm:min-h-[38px] text-[12px] font-medium border-b-2 cursor-pointer transition-colors ${
              tab === 'library'
                ? 'border-[var(--accent)] text-[var(--text)]'
                : 'border-transparent text-[var(--text-soft)] hover:text-[var(--text)]'
            }`}
          >
            Docs ({documents.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('highlights')}
            className={`flex-1 min-h-[44px] sm:min-h-[38px] text-[12px] font-medium border-b-2 cursor-pointer transition-colors ${
              tab === 'highlights'
                ? 'border-[var(--accent)] text-[var(--text)]'
                : 'border-transparent text-[var(--text-soft)] hover:text-[var(--text)]'
            }`}
          >
            Notes ({highlights.length})
          </button>
          {hasChapters && (
            <button
              type="button"
              onClick={() => setTab('chapters')}
              className={`flex-1 min-h-[44px] sm:min-h-[38px] text-[12px] font-medium border-b-2 cursor-pointer transition-colors ${
                tab === 'chapters'
                  ? 'border-[var(--accent)] text-[var(--text)]'
                  : 'border-transparent text-[var(--text-soft)] hover:text-[var(--text)]'
              }`}
            >
              Chapters
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
          {tab === 'library' && (
            <>
              {documents.length === 0 ? (
                <EmptyState
                  compact
                  title="No saved documents"
                  description="Paste or upload text to start listening."
                  actionLabel="Load sample text"
                  onAction={onLoadSample}
                />
              ) : (
                documents.map((doc) => {
                  const isActive = doc.id === activeDocumentId;
                  const isRenaming = renamingId === doc.id;
                  const menuOpen = menuOpenId === doc.id;

                  return (
                    <div
                      key={doc.id}
                      className={`group relative rounded-[var(--r-sm)] border p-2.5 transition-colors ${
                        isActive
                          ? 'bg-[var(--surface-2)] border-[var(--accent)]'
                          : 'bg-[var(--surface)] border-[var(--border)] hover:bg-[var(--surface-2)]'
                      }`}
                    >
                      {isRenaming ? (
                        <form
                          className="flex items-center gap-1.5"
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (renameDraft.trim()) {
                              onRenameDocument(doc.id, renameDraft.trim());
                            }
                            setRenamingId(null);
                          }}
                        >
                          <input
                            type="text"
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            autoFocus
                            aria-label="Document title"
                            className="flex-1 min-w-0 px-2.5 min-h-[44px] sm:min-h-[36px] text-[16px] sm:text-[13px] rounded-[6px] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)]"
                          />
                          <IconButton label="Save title" type="submit">
                            <Check className="w-4 h-4 text-[var(--success)]" strokeWidth={1.75} />
                          </IconButton>
                        </form>
                      ) : (
                        <div className="flex items-start justify-between gap-1.5">
                          <button
                            type="button"
                            onClick={() => onSelectDocument(doc)}
                            className="flex-1 min-w-0 min-h-[44px] text-left cursor-pointer py-0.5"
                          >
                            <p className="text-[13px] font-medium text-[var(--text)] truncate">
                              {doc.title}
                            </p>
                            <p className="text-[11px] text-[var(--text-soft)] mt-0.5 tabular-nums">
                              {new Date(doc.updatedAt).toLocaleDateString()} · {doc.totalWords} words
                            </p>
                          </button>

                          <IconButton
                            label={`Actions for ${doc.title}`}
                            onClick={() => setMenuOpenId(menuOpen ? null : doc.id)}
                            className="-mr-1"
                          >
                            <MoreVertical className="w-4 h-4" strokeWidth={1.75} />
                          </IconButton>
                        </div>
                      )}

                      {/* 3px progress bar */}
                      <div
                        className="mt-1.5 h-[3px] w-full rounded-[var(--r-full)] bg-[var(--border)] overflow-hidden"
                        aria-label={`${doc.progress}% completed`}
                      >
                        <div
                          className="h-full bg-[var(--accent)] transition-all duration-[var(--dur-base)]"
                          style={{ width: `${Math.min(100, Math.max(0, doc.progress))}%` }}
                        />
                      </div>

                      {menuOpen && (
                        <div
                          role="menu"
                          className="mt-2 p-1 rounded-[var(--r-sm)] bg-[var(--surface)] border border-[var(--border)] shadow-[var(--shadow-2)] flex flex-col gap-0.5"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setRenamingId(doc.id);
                              setRenameDraft(doc.title);
                              setMenuOpenId(null);
                            }}
                            className="flex items-center gap-2 px-2.5 min-h-[44px] sm:min-h-[36px] text-[13px] text-[var(--text)] hover:bg-[var(--surface-2)] rounded-[6px] cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                            Rename
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              onDuplicateDocument(doc);
                              setMenuOpenId(null);
                            }}
                            className="flex items-center gap-2 px-2.5 min-h-[44px] sm:min-h-[36px] text-[13px] text-[var(--text)] hover:bg-[var(--surface-2)] rounded-[6px] cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                            Duplicate
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              onDeleteDocument(doc.id);
                              setMenuOpenId(null);
                            }}
                            className="flex items-center gap-2 px-2.5 min-h-[44px] sm:min-h-[36px] text-[13px] text-[var(--danger)] hover:bg-[var(--surface-2)] rounded-[6px] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </>
          )}

          {tab === 'highlights' && (
            <div className="space-y-2 p-1">
              {highlights.length > 0 && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full"
                  onClick={handleExportHighlights}
                >
                  <Download className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                  Export Markdown
                </Button>
              )}
              {highlights.length === 0 ? (
                <EmptyState
                  compact
                  title="No highlights yet"
                  description="Long-press any sentence on touch devices or tap Highlight while reading."
                />
              ) : (
                highlights.map((h) => (
                  <div
                    key={h.id}
                    className="p-2.5 rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--surface)] space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-soft)]">
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${HIGHLIGHT_DOT_COLORS[h.color]}`}
                          aria-hidden="true"
                        />
                        <Bookmark className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                        Sentence {h.sentenceIndex + 1}
                      </span>
                      <div className="flex items-center gap-0.5">
                        <IconButton
                          label="Edit highlight note"
                          onClick={() => {
                            setEditingNoteId(h.id);
                            setNoteDraft(h.note);
                          }}
                        >
                          <Edit3 className="w-4 h-4" strokeWidth={1.75} />
                        </IconButton>
                        <IconButton label="Delete highlight" onClick={() => onDeleteHighlight(h.id)}>
                          <Trash2 className="w-4 h-4 text-[var(--danger)]" strokeWidth={1.75} />
                        </IconButton>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onJumpToSentence(h.sentenceIndex)}
                      className="text-left text-[13px] leading-[19px] text-[var(--text)] line-clamp-3 hover:underline cursor-pointer"
                    >
                      “{h.text}”
                    </button>
                    {editingNoteId === h.id ? (
                      <form
                        className="flex flex-col gap-1.5 mt-1"
                        onSubmit={(e) => {
                          e.preventDefault();
                          onUpdateHighlightNote(h.id, noteDraft);
                          setEditingNoteId(null);
                        }}
                      >
                        <textarea
                          rows={2}
                          value={noteDraft}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          placeholder="Add a note…"
                          className="w-full p-2 text-[16px] sm:text-[13px] rounded-[6px] bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)]"
                        />
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="ghost" onClick={() => setEditingNoteId(null)}>
                            Cancel
                          </Button>
                          <Button size="sm" variant="primary" type="submit">
                            Save
                          </Button>
                        </div>
                      </form>
                    ) : (
                      h.note && (
                        <p className="text-[12px] text-[var(--text-soft)] bg-[var(--surface-2)] px-2 py-1 rounded-[6px]">
                          {h.note}
                        </p>
                      )
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'chapters' && hasChapters && activeDocument?.chapters && (
            <div className="space-y-1 p-1">
              {activeDocument.chapters.map((ch, idx) => {
                const isCurr = idx === (activeDocument.activeChapterIndex ?? 0);
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => onSelectChapter(idx)}
                    className={`w-full flex items-center gap-2 px-2.5 min-h-[44px] rounded-[var(--r-sm)] text-left text-[13px] cursor-pointer transition-colors ${
                      isCurr
                        ? 'bg-[var(--accent)] text-[var(--accent-fg)] font-medium'
                        : 'text-[var(--text)] hover:bg-[var(--surface-2)]'
                    }`}
                  >
                    <ListTree className="w-4 h-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                    <span className="truncate">{ch.title}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-3 border-t border-[var(--border)] bg-[var(--surface-2)] pb-safe">
          <button
            type="button"
            onClick={onLoadSample}
            className="w-full min-h-[44px] flex items-center justify-center gap-1.5 text-[13px] font-medium text-[var(--text-soft)] hover:text-[var(--text)] cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-[var(--accent)]" strokeWidth={1.75} aria-hidden="true" />
            Load sample passage
          </button>
        </div>
      </nav>
    </>
  );
}
