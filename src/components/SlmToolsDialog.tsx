import * as React from 'react';
import { Check, Download, Sparkles, X } from 'lucide-react';
import { OnDeviceSlmService, VERIFIED_SLM_MODELS } from '../slm/slmService';
import type { SpeechCleanupChange } from '../utils/textFilters';
import { Button } from './ui/Button';
import { ModalDialog } from './ui/Dialog';

export interface SlmToolsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slmEnabled: boolean;
  onEnableSlm: () => void;
  text: string;
  activeParagraphText: string;
  onApplyCleanedText: (nextText: string) => void;
  onNotify: (msg: { kind: 'info' | 'success' | 'error'; message: string }) => void;
}

export function SlmToolsDialog({
  open,
  onOpenChange,
  slmEnabled,
  onEnableSlm,
  text,
  activeParagraphText,
  onApplyCleanedText,
  onNotify,
}: SlmToolsDialogProps) {
  const [slm] = React.useState(() => new OnDeviceSlmService());

  const [selectedModelId, setSelectedModelId] = React.useState(VERIFIED_SLM_MODELS[0].id);
  const [modelReady, setModelReady] = React.useState(() => slm.isModelReady());
  const [downloadProgress, setDownloadProgress] = React.useState<{ progress: number; status: string } | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  const [busyTask, setBusyTask] = React.useState<'summary' | 'clean' | 'explain' | null>(null);
  const [summaryOut, setSummaryOut] = React.useState<{ text: string; aiGenerated: boolean } | null>(null);
  const [explainOut, setExplainOut] = React.useState<{ text: string; aiGenerated: boolean } | null>(null);
  const [cleanDiff, setCleanDiff] = React.useState<{
    cleanedText: string;
    changes: SpeechCleanupChange[];
    aiGenerated: boolean;
  } | null>(null);

  const activeSpec = VERIFIED_SLM_MODELS.find((m) => m.id === selectedModelId) ?? VERIFIED_SLM_MODELS[0];

  const handleDownloadModel = async () => {
    if (!slmEnabled) onEnableSlm();
    slm.setModelId(selectedModelId);
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      setDownloadProgress({ progress: 5, status: `Downloading ${activeSpec.label}…` });
      await slm.init((p) => setDownloadProgress({ progress: p.progress, status: p.status }), abort.signal);
      setModelReady(true);
      setDownloadProgress(null);
      onNotify({ kind: 'success', message: `${activeSpec.label} ready offline.` });
    } catch (err) {
      setDownloadProgress(null);
      if (err instanceof DOMException && err.name === 'AbortError') {
        onNotify({ kind: 'info', message: 'Model download canceled.' });
      } else {
        onNotify({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Failed to load on-device model.',
        });
      }
    } finally {
      abortRef.current = null;
    }
  };

  const handleSummarize = async (len: 'short' | 'medium') => {
    if (!text.trim()) return;
    setBusyTask('summary');
    try {
      const res = await slm.summarizeBeforeListening(text, len);
      setSummaryOut({ text: res.summary, aiGenerated: res.aiGenerated });
    } catch (err) {
      onNotify({ kind: 'error', message: err instanceof Error ? err.message : 'Summary failed.' });
    } finally {
      setBusyTask(null);
    }
  };

  const handleCleanForSpeech = async () => {
    if (!text.trim()) return;
    setBusyTask('clean');
    try {
      const res = await slm.cleanForSpeech(text);
      setCleanDiff(res);
    } catch (err) {
      onNotify({ kind: 'error', message: err instanceof Error ? err.message : 'Cleanup failed.' });
    } finally {
      setBusyTask(null);
    }
  };

  const handleExplainParagraph = async () => {
    const target = activeParagraphText.trim() || text.slice(0, 600);
    if (!target) return;
    setBusyTask('explain');
    try {
      const res = await slm.explainParagraph(target);
      setExplainOut({ text: res.explanation, aiGenerated: res.aiGenerated });
    } catch (err) {
      onNotify({ kind: 'error', message: err instanceof Error ? err.message : 'Explain failed.' });
    } finally {
      setBusyTask(null);
    }
  };

  return (
    <ModalDialog
      open={open}
      onOpenChange={onOpenChange}
      maxWidthClass="max-w-2xl"
      mobileSheet
      title="Clean & Summarize Text"
      description="Rule-based speech normalization works immediately with 0 MB download. Optionally download a quantized on-device SLM for offline summaries and explanations."
    >
      <div className="space-y-5">
        {/* Optional SLM model card */}
        <div className="p-4 rounded-[var(--r-md)] bg-[var(--surface-2)] border border-[var(--border)] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-[var(--text)] flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[var(--accent)]" aria-hidden="true" />
              Optional On-Device Model ({activeSpec.approxSizeMb} MB · {activeSpec.license})
            </span>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-[var(--r-full)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text-soft)]">
              {modelReady ? 'Ready offline' : 'Using instant deterministic rules'}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <select
              aria-label="Select on-device SLM"
              value={selectedModelId}
              onChange={(e) => {
                setSelectedModelId(e.target.value);
                setModelReady(false);
              }}
              className="flex-1 min-h-[40px] px-2.5 rounded-[var(--r-sm)] bg-[var(--surface)] border border-[var(--border)] text-[13px] text-[var(--text)]"
            >
              {VERIFIED_SLM_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} (~{m.approxSizeMb} MB, {m.license})
                </option>
              ))}
            </select>

            {downloadProgress ? (
              <Button size="sm" variant="ghost" onClick={() => abortRef.current?.abort()}>
                <X className="w-4 h-4" />
                Cancel ({downloadProgress.progress}%)
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => void handleDownloadModel()}>
                <Download className="w-4 h-4" aria-hidden="true" />
                {modelReady ? 'Loaded' : `Download (${activeSpec.approxSizeMb} MB)`}
              </Button>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            loading={busyTask === 'summary'}
            disabled={!text.trim()}
            onClick={() => void handleSummarize('short')}
          >
            Short Summary
          </Button>
          <Button
            size="sm"
            variant="secondary"
            loading={busyTask === 'summary'}
            disabled={!text.trim()}
            onClick={() => void handleSummarize('medium')}
          >
            Medium Summary
          </Button>
          <Button
            size="sm"
            variant="primary"
            loading={busyTask === 'clean'}
            disabled={!text.trim()}
            onClick={() => void handleCleanForSpeech()}
          >
            Clean for Speech (Preview Diff)
          </Button>
          <Button
            size="sm"
            variant="secondary"
            loading={busyTask === 'explain'}
            disabled={!text.trim()}
            onClick={() => void handleExplainParagraph()}
          >
            Explain Current Paragraph
          </Button>
        </div>

        {/* Clean for Speech Diff Preview (never auto-replaces!) */}
        {cleanDiff && (
          <div className="p-4 rounded-[var(--r-md)] bg-[var(--surface-2)] border border-[var(--accent)] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h4 className="text-[14px] font-semibold text-[var(--text)]">
                  Speech Cleanup Preview
                </h4>
                <span className="text-[11px] px-2 py-0.5 rounded-[var(--r-full)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text-soft)]">
                  {cleanDiff.aiGenerated ? 'AI-generated' : 'Rule-based (offline)'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setCleanDiff(null)}>
                  Dismiss
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    onApplyCleanedText(cleanDiff.cleanedText);
                    setCleanDiff(null);
                    onNotify({ kind: 'success', message: 'Applied cleaned speech text.' });
                  }}
                >
                  <Check className="w-4 h-4" aria-hidden="true" />
                  Accept All
                </Button>
              </div>
            </div>

            {cleanDiff.changes.length === 0 ? (
              <p className="text-[13px] text-[var(--text-soft)]">
                Your text is already clean for spoken synthesis.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {cleanDiff.changes.map((c, idx) => (
                  <div
                    key={idx}
                    className="flex flex-wrap items-center gap-2 p-2 rounded-[6px] bg-[var(--surface)] border border-[var(--border)] text-[12px]"
                  >
                    <span className="line-through text-[var(--danger)] font-mono">{c.original}</span>
                    <span aria-hidden="true">→</span>
                    <span className="font-medium text-[var(--success)]">{c.cleaned}</span>
                    <span className="ml-auto text-[11px] text-[var(--text-soft)]">{c.category}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Summary Output */}
        {summaryOut && (
          <div className="p-4 rounded-[var(--r-md)] bg-[var(--surface-2)] border border-[var(--border)] space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-[13px] font-semibold text-[var(--text)]">Summary Before Listening</h4>
              <span className="text-[11px] px-2 py-0.5 rounded-[var(--r-full)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text-soft)]">
                {summaryOut.aiGenerated ? 'AI-generated' : 'Extractive preview'}
              </span>
            </div>
            <p className="text-[14px] leading-[22px] text-[var(--text)]">{summaryOut.text}</p>
          </div>
        )}

        {/* Explanation Output */}
        {explainOut && (
          <div className="p-4 rounded-[var(--r-md)] bg-[var(--surface-2)] border border-[var(--border)] space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-[13px] font-semibold text-[var(--text)]">Paragraph Explanation</h4>
              <span className="text-[11px] px-2 py-0.5 rounded-[var(--r-full)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text-soft)]">
                {explainOut.aiGenerated ? 'AI-generated' : 'Offline note'}
              </span>
            </div>
            <p className="text-[14px] leading-[22px] text-[var(--text)]">{explainOut.text}</p>
          </div>
        )}
      </div>
    </ModalDialog>
  );
}
