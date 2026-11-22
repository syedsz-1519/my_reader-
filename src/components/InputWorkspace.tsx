import * as React from 'react';
import {
  ClipboardPaste,
  FileUp,
  Globe,
  ScanText,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { FEATURES } from '../config/features';
import type { LibraryChapter } from '../db/libraryDb';
import { importDocxFile } from '../importers/docxImporter';
import { importEpubFile } from '../importers/epubImporter';
import { runOcrOnImageFile, runOcrOnPdfFile, type OcrLanguage } from '../importers/ocrImporter';
import { importPdfFile } from '../importers/pdfImporter';
import { buildReaderBookmarkletHref, extractArticleFromUrl } from '../importers/urlImporter';
import { Button } from './ui/Button';
import { ModalDialog } from './ui/Dialog';

const MAX_DOC_CHARS = 500_000;

export interface ImportedPayload {
  title: string;
  author?: string;
  text: string;
  sourceType: 'paste' | 'txt' | 'md' | 'pdf' | 'docx' | 'epub' | 'ocr' | 'url' | 'sample';
  sourceUrl?: string;
  chapters?: LibraryChapter[];
}

export interface InputWorkspaceProps {
  text: string;
  title: string;
  onTitleChange: (nextTitle: string) => void;
  onApplyText: (payload: ImportedPayload) => void;
  onLoadSample: () => void;
  onNotify: (msg: { kind: 'info' | 'success' | 'error'; message: string }) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  onDoneEditing?: () => void;
}

export function InputWorkspace({
  text,
  title,
  onTitleChange,
  onApplyText,
  onLoadSample,
  onNotify,
  textareaRef,
  onDoneEditing,
}: InputWorkspaceProps) {
  const [draft, setDraft] = React.useState(text);
  const [prevPropText, setPrevPropText] = React.useState(text);
  if (text !== prevPropText) {
    setPrevPropText(text);
    setDraft(text);
  }

  const [dragOver, setDragOver] = React.useState(false);
  const [importProgress, setImportProgress] = React.useState<{ pct: number; status: string } | null>(null);
  const importAbortRef = React.useRef<AbortController | null>(null);

  const [scannedPdfFile, setScannedPdfFile] = React.useState<File | null>(null);
  const [ocrLang, setOcrLang] = React.useState<OcrLanguage>('eng');

  const [urlModalOpen, setUrlModalOpen] = React.useState(false);
  const [urlInput, setUrlInput] = React.useState('');
  const [urlBusy, setUrlBusy] = React.useState(false);

  const [clearConfirmOpen, setClearConfirmOpen] = React.useState(false);
  const [oversizePending, setOversizePending] = React.useState<ImportedPayload | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const chars = draft.length;
  const words = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  const estMinutes = Math.max(1, Math.ceil(words / 165));

  const commitPayload = (payload: ImportedPayload) => {
    if (payload.text.length > MAX_DOC_CHARS) {
      setOversizePending(payload);
      return;
    }
    setDraft(payload.text);
    onApplyText(payload);
  };

  const handlePasteClipboard = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip.trim()) {
        onNotify({ kind: 'info', message: 'Your clipboard is empty.' });
        return;
      }
      commitPayload({
        title: title || 'Pasted text',
        text: clip,
        sourceType: 'paste',
      });
      onNotify({ kind: 'success', message: 'Pasted text from clipboard.' });
    } catch {
      onNotify({
        kind: 'info',
        message: 'Clipboard access was blocked. Press Ctrl+V / Cmd+V directly in the text box.',
      });
      textareaRef?.current?.focus();
    }
  };

  const handleFile = async (file: File) => {
    const name = file.name;
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    const baseTitle = name.replace(/\.[^.]+$/, '') || 'Imported document';

    const abort = new AbortController();
    importAbortRef.current = abort;

    try {
      if (ext === 'txt' || ext === 'md' || file.type.startsWith('text/')) {
        const raw = await file.text();
        commitPayload({
          title: baseTitle,
          text: raw,
          sourceType: ext === 'md' ? 'md' : 'txt',
        });
        onNotify({ kind: 'success', message: `Loaded ${name}` });
        return;
      }

      if (ext === 'pdf' && FEATURES.pdfImport) {
        setImportProgress({ pct: 5, status: 'Reading PDF…' });
        const result = await importPdfFile(file, (pct, status) => setImportProgress({ pct, status }));
        setImportProgress(null);

        if (result.isLikelyScanned && FEATURES.ocrImport) {
          setScannedPdfFile(file);
          if (result.text.trim()) {
            commitPayload({
              title: baseTitle,
              text: result.text,
              sourceType: 'pdf',
            });
          }
          return;
        }

        commitPayload({
          title: baseTitle,
          text: result.text,
          sourceType: 'pdf',
        });
        onNotify({ kind: 'success', message: `Extracted ${result.pageCount} PDF pages.` });
        return;
      }

      if (ext === 'docx' && FEATURES.docxImport) {
        setImportProgress({ pct: 40, status: 'Reading Word document…' });
        const extracted = await importDocxFile(file);
        setImportProgress(null);
        commitPayload({
          title: baseTitle,
          text: extracted,
          sourceType: 'docx',
        });
        onNotify({ kind: 'success', message: `Imported ${name}` });
        return;
      }

      if (ext === 'epub' && FEATURES.epubImport) {
        setImportProgress({ pct: 10, status: 'Opening EPUB…' });
        const epub = await importEpubFile(file, (pct, status) => setImportProgress({ pct, status }));
        setImportProgress(null);
        if (epub.chapters.length === 0) {
          onNotify({ kind: 'error', message: 'No readable chapters found inside that EPUB.' });
          return;
        }
        commitPayload({
          title: epub.title || baseTitle,
          author: epub.author,
          text: epub.chapters[0].text,
          sourceType: 'epub',
          chapters: epub.chapters,
        });
        onNotify({
          kind: 'success',
          message: `Imported "${epub.title}" (${epub.chapters.length} chapters).`,
        });
        return;
      }

      if (['png', 'jpg', 'jpeg', 'webp'].includes(ext) && FEATURES.ocrImport) {
        setImportProgress({ pct: 5, status: 'Running on-device OCR…' });
        const recognized = await runOcrOnImageFile(file, {
          language: ocrLang,
          signal: abort.signal,
          onProgress: (pct, status) => setImportProgress({ pct, status }),
        });
        setImportProgress(null);
        if (!recognized) {
          onNotify({ kind: 'info', message: 'No text detected in that image.' });
          return;
        }
        commitPayload({
          title: baseTitle,
          text: recognized,
          sourceType: 'ocr',
        });
        onNotify({ kind: 'success', message: 'Image text recognized locally.' });
        return;
      }

      onNotify({
        kind: 'error',
        message: 'Unsupported file type. Drop .txt, .md, .pdf, .docx, .epub, or an image.',
      });
    } catch (err) {
      setImportProgress(null);
      if (err instanceof DOMException && err.name === 'AbortError') {
        onNotify({ kind: 'info', message: 'Import canceled.' });
      } else {
        onNotify({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Failed to import file.',
        });
      }
    } finally {
      importAbortRef.current = null;
    }
  };

  const handleRunScannedPdfOcr = async () => {
    if (!scannedPdfFile) return;
    const file = scannedPdfFile;
    setScannedPdfFile(null);
    const abort = new AbortController();
    importAbortRef.current = abort;
    try {
      setImportProgress({ pct: 5, status: 'Preparing scanned PDF pages…' });
      const textOut = await runOcrOnPdfFile(file, {
        language: ocrLang,
        signal: abort.signal,
        onProgress: (pct, status) => setImportProgress({ pct, status }),
      });
      setImportProgress(null);
      if (!textOut.trim()) {
        onNotify({ kind: 'info', message: 'No readable text found during OCR.' });
        return;
      }
      commitPayload({
        title: file.name.replace(/\.pdf$/i, ''),
        text: textOut,
        sourceType: 'ocr',
      });
      onNotify({ kind: 'success', message: 'Scanned PDF OCR complete.' });
    } catch (err) {
      setImportProgress(null);
      if (err instanceof DOMException && err.name === 'AbortError') {
        onNotify({ kind: 'info', message: 'OCR canceled.' });
      } else {
        onNotify({
          kind: 'error',
          message: err instanceof Error ? err.message : 'OCR failed.',
        });
      }
    } finally {
      importAbortRef.current = null;
    }
  };

  const handleExtractUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    setUrlBusy(true);
    try {
      const article = await extractArticleFromUrl(urlInput);
      setUrlModalOpen(false);
      setUrlInput('');
      commitPayload({
        title: article.title,
        author: article.byline || undefined,
        text: article.text,
        sourceType: 'url',
        sourceUrl: urlInput.trim(),
      });
      onNotify({ kind: 'success', message: `Imported article: ${article.title}` });
    } catch (err) {
      onNotify({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Could not extract web page.',
      });
    } finally {
      setUrlBusy(false);
    }
  };

  const bookmarkletHref =
    typeof window !== 'undefined' ? buildReaderBookmarkletHref(window.location.origin) : '#';

  return (
    <section
      aria-label="Text input and document import"
      className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] p-3.5 sm:p-5 shadow-[var(--shadow-1)] space-y-3.5"
    >
      {/* Document Title */}
      <input
        type="text"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="Document title"
        aria-label="Document title"
        className="w-full min-w-0 px-3 min-h-[44px] rounded-[var(--r-sm)] bg-[var(--surface-2)] border border-[var(--border)] text-[16px] sm:text-[14px] font-medium text-[var(--text)]"
      />

      {/* Drop zone + Textarea */}
      <div className="space-y-1.5">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files[0];
            if (f) void handleFile(f);
          }}
          className={`rounded-[var(--r-sm)] border-2 border-dashed transition-colors ${
            dragOver ? 'border-[var(--accent)] bg-[var(--surface-2)]' : 'border-[var(--border)]'
          }`}
        >
          <textarea
            ref={textareaRef}
            rows={6}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Paste or type text here, or drop a .txt, .md, .pdf, .docx, .epub, or image file…"
            aria-label="Text to read aloud"
            className="w-full min-h-[160px] max-h-[380px] resize-y p-3.5 rounded-[var(--r-sm)] bg-transparent text-[16px] leading-[24px] text-[var(--text)] focus:outline-none"
          />
        </div>

        {/* Char / Word / Time Counter directly below textarea */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-0.5 text-[12px] text-[var(--text-soft)] tabular-nums">
          <div className="flex items-center gap-2">
            <span>{chars.toLocaleString()} chars</span>
            <span aria-hidden="true">·</span>
            <span>{words.toLocaleString()} words</span>
          </div>
          <span>~{estMinutes} min listen</span>
        </div>
      </div>

      {/* Progress banner during PDF / EPUB / OCR */}
      {importProgress && (
        <div className="p-3 rounded-[var(--r-sm)] bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex justify-between text-[12px] text-[var(--text)]">
              <span className="truncate">{importProgress.status}</span>
              <span className="tabular-nums font-medium">{importProgress.pct}%</span>
            </div>
            <div className="h-1.5 w-full rounded-[var(--r-full)] bg-[var(--border)] overflow-hidden">
              <div
                className="h-full bg-[var(--accent)] transition-all"
                style={{ width: `${importProgress.pct}%` }}
              />
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => importAbortRef.current?.abort()}>
            <X className="w-4 h-4" strokeWidth={1.75} />
            Cancel
          </Button>
        </div>
      )}

      {/* Scanned PDF detected prompt */}
      {scannedPdfFile && (
        <div className="p-3.5 rounded-[var(--r-sm)] bg-[var(--surface-2)] border border-[var(--accent)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-[13px] font-semibold text-[var(--text)] flex items-center gap-1.5">
              <ScanText className="w-4 h-4 text-[var(--accent)]" strokeWidth={1.75} aria-hidden="true" />
              This PDF looks scanned (little selectable text).
            </p>
            <p className="text-[12px] text-[var(--text-soft)]">
              Run on-device OCR locally in your browser (downloads ~15 MB OCR model once).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <select
              aria-label="OCR language"
              value={ocrLang}
              onChange={(e) => setOcrLang(e.target.value as OcrLanguage)}
              className="min-h-[44px] sm:min-h-[38px] px-2.5 rounded-[var(--r-sm)] bg-[var(--surface)] border border-[var(--border)] text-[16px] sm:text-[12px] text-[var(--text)]"
            >
              <option value="eng">English</option>
              <option value="hin">Hindi</option>
              <option value="urd">Urdu</option>
              <option value="ara">Arabic</option>
            </select>
            <Button size="sm" variant="primary" onClick={() => void handleRunScannedPdfOcr()}>
              Run OCR
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setScannedPdfFile(null)}>
              Skip
            </Button>
          </div>
        </div>
      )}

      {/* Horizontally scrollable import chip row + CTA */}
      <div className="space-y-2.5">
        <div className="flex flex-nowrap sm:flex-wrap items-center gap-2 overflow-x-auto pb-1">
          <Button size="sm" variant="secondary" onClick={() => void handlePasteClipboard()} className="shrink-0">
            <ClipboardPaste className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
            Paste text
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.pdf,.docx,.epub,.png,.jpg,.jpeg,.webp"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = '';
            }}
          />
          <Button size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()} className="shrink-0">
            <FileUp className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
            Upload file
          </Button>

          {FEATURES.urlImport && (
            <Button size="sm" variant="secondary" onClick={() => setUrlModalOpen(true)} className="shrink-0">
              <Globe className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
              Import URL
            </Button>
          )}

          <Button size="sm" variant="ghost" onClick={onLoadSample} className="shrink-0">
            <Sparkles className="w-4 h-4 text-[var(--accent)]" strokeWidth={1.75} aria-hidden="true" />
            Sample
          </Button>

          <Button
            size="sm"
            variant="ghost"
            disabled={!draft}
            className="shrink-0"
            onClick={() => {
              if (draft.length > 500) {
                setClearConfirmOpen(true);
              } else {
                setDraft('');
                onApplyText({ title: title || 'Untitled', text: '', sourceType: 'paste' });
              }
            }}
          >
            <Trash2 className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
            Clear
          </Button>
        </div>

        <div className="flex items-center justify-end gap-2">
          {onDoneEditing && (
            <Button size="sm" variant="ghost" onClick={onDoneEditing}>
              Close editor
            </Button>
          )}
          <Button
            size="sm"
            variant="primary"
            disabled={!draft.trim()}
            onClick={() => {
              commitPayload({
                title: title.trim() || 'Untitled reading',
                text: draft,
                sourceType: 'paste',
              });
              onDoneEditing?.();
            }}
          >
            Load into Reader
          </Button>
        </div>
      </div>

      {/* URL Import Modal */}
      <ModalDialog
        open={urlModalOpen}
        onOpenChange={setUrlModalOpen}
        title="Import Web Article"
        description="Opt-in network fetch: only the URL you enter is fetched through /api/extract to strip ads and navigation."
        maxWidthClass="max-w-lg"
        mobileSheet
      >
        <form onSubmit={(e) => void handleExtractUrl(e)} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="extract-url-input" className="text-[13px] font-medium text-[var(--text)]">
              Article URL (http or https)
            </label>
            <input
              id="extract-url-input"
              type="url"
              required
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/article"
              className="w-full min-h-[44px] px-3 rounded-[var(--r-sm)] bg-[var(--surface-2)] border border-[var(--border)] text-[16px] sm:text-[14px] text-[var(--text)]"
            />
          </div>

          <div className="p-3 rounded-[var(--r-sm)] bg-[var(--surface-2)] border border-[var(--border)] space-y-2">
            <p className="text-[12px] font-medium text-[var(--text)]">
              Zero-server alternative: Reader Bookmarklet
            </p>
            <p className="text-[12px] text-[var(--text-soft)]">
              Drag this link to your bookmarks bar to send any open page’s text directly via URL fragment without contacting a server:
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={bookmarkletHref}
                onClick={(e) => e.preventDefault()}
                className="inline-flex items-center px-3 min-h-[40px] rounded-[var(--r-sm)] bg-[var(--surface)] border border-[var(--border)] text-[12px] font-medium text-[var(--accent)]"
              >
                Send to TTS Reader
              </a>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  void navigator.clipboard.writeText(bookmarkletHref);
                  onNotify({ kind: 'success', message: 'Bookmarklet code copied.' });
                }}
              >
                Copy link
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setUrlModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={urlBusy}>
              Fetch article
            </Button>
          </div>
        </form>
      </ModalDialog>

      {/* Clear Confirmation (>500 chars) */}
      <ModalDialog
        open={clearConfirmOpen}
        onOpenChange={setClearConfirmOpen}
        title="Clear current text?"
        description="You have more than 500 characters in the editor. Clearing removes unsaved edits from this view."
        maxWidthClass="max-w-sm"
        mobileSheet
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => setClearConfirmOpen(false)}>
            Keep text
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setDraft('');
              onApplyText({ title: 'Untitled', text: '', sourceType: 'paste' });
              setClearConfirmOpen(false);
            }}
          >
            Clear text
          </Button>
        </div>
      </ModalDialog>

      {/* Huge input (>500,000 chars) dialog */}
      <ModalDialog
        open={Boolean(oversizePending)}
        onOpenChange={(open) => {
          if (!open) setOversizePending(null);
        }}
        title="Document exceeds 500,000 characters"
        description={`This document has ${oversizePending?.text.length.toLocaleString() ?? 0} characters. To keep playback responsive in the browser, we recommend trimming to the first 500,000 characters.`}
        maxWidthClass="max-w-md"
        mobileSheet
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => setOversizePending(null)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (!oversizePending) return;
              const trimmedPayload: ImportedPayload = {
                ...oversizePending,
                text: oversizePending.text.slice(0, MAX_DOC_CHARS),
              };
              setOversizePending(null);
              setDraft(trimmedPayload.text);
              onApplyText(trimmedPayload);
            }}
          >
            Trim to 500,000 chars
          </Button>
        </div>
      </ModalDialog>
    </section>
  );
}
