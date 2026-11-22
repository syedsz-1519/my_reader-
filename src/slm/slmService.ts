import { deterministicCleanForSpeech, type SpeechCleanupChange } from '../utils/textFilters';

export interface SlmModelSpec {
  id: string;
  label: string;
  approxSizeMb: number;
  license: string;
  languages: string;
}

export const VERIFIED_SLM_MODELS: SlmModelSpec[] = [
  {
    id: 'onnx-community/SmolLM2-360M-Instruct-ONNX',
    label: 'SmolLM2 360M Instruct (Quantized)',
    approxSizeMb: 260,
    license: 'Apache-2.0',
    languages: 'English',
  },
  {
    id: 'onnx-community/Qwen2.5-0.5B-Instruct',
    label: 'Qwen 2.5 0.5B Instruct (Q4F16)',
    approxSizeMb: 483,
    license: 'Apache-2.0',
    languages: 'Multilingual (29+ languages)',
  },
];

const MAX_CHUNK_CHARS = 8000;
const TASK_TIMEOUT_MS = 45_000;

export class OnDeviceSlmService {
  private worker: Worker | null = null;
  private ready = false;
  private activeModelId = VERIFIED_SLM_MODELS[0].id;
  private reqCounter = 0;

  isModelReady(): boolean {
    return this.ready;
  }

  getActiveModelSpec(): SlmModelSpec {
    return VERIFIED_SLM_MODELS.find((m) => m.id === this.activeModelId) ?? VERIFIED_SLM_MODELS[0];
  }

  setModelId(id: string): void {
    if (id !== this.activeModelId) {
      this.activeModelId = id;
      this.ready = false;
    }
  }

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('../workers/slm.worker.ts', import.meta.url), {
        type: 'module',
      });
    }
    return this.worker;
  }

  async init(
    onProgress?: (p: { progress: number; status: string; file?: string }) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    if (this.ready) return;
    const worker = this.ensureWorker();
    const reqId = `slm_${++this.reqCounter}`;
    const hasWebGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;

    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        worker.removeEventListener('message', onMessage);
        this.dispose();
        reject(new DOMException('Download canceled', 'AbortError'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      const onMessage = (event: MessageEvent) => {
        const msg = event.data as {
          id: string;
          type: string;
          payload?: { progress?: number; status?: string; file?: string; message?: string };
        };
        if (msg.id !== reqId) return;

        if (msg.type === 'progress') {
          onProgress?.({
            progress: msg.payload?.progress ?? 0,
            status: msg.payload?.status ?? 'Downloading SLM weights…',
            file: msg.payload?.file,
          });
        } else if (msg.type === 'ready') {
          signal?.removeEventListener('abort', onAbort);
          worker.removeEventListener('message', onMessage);
          this.ready = true;
          resolve();
        } else if (msg.type === 'error') {
          signal?.removeEventListener('abort', onAbort);
          worker.removeEventListener('message', onMessage);
          reject(new Error(msg.payload?.message ?? 'Failed to load SLM model'));
        }
      };

      worker.addEventListener('message', onMessage);
      worker.postMessage({
        id: reqId,
        type: 'init',
        payload: {
          modelId: this.activeModelId,
          device: hasWebGpu ? 'webgpu' : 'wasm',
          dtype: hasWebGpu ? 'q4f16' : 'q4',
        },
      });
    });
  }

  private async runPrompt(
    systemPrompt: string,
    userPrompt: string,
    maxNewTokens: number,
    signal?: AbortSignal,
  ): Promise<string> {
    if (!this.ready) throw new Error('SLM model is not downloaded yet.');
    const worker = this.ensureWorker();
    const reqId = `slm_${++this.reqCounter}`;

    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        worker.removeEventListener('message', onMessage);
        reject(new Error('On-device AI timed out. Try a shorter passage.'));
      }, TASK_TIMEOUT_MS);

      const onAbort = () => {
        clearTimeout(timeout);
        worker.removeEventListener('message', onMessage);
        reject(new DOMException('AI task canceled', 'AbortError'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      const onMessage = (event: MessageEvent) => {
        const msg = event.data as {
          id: string;
          type: string;
          payload?: { text?: string; message?: string };
        };
        if (msg.id !== reqId) return;
        clearTimeout(timeout);
        signal?.removeEventListener('abort', onAbort);
        worker.removeEventListener('message', onMessage);
        if (msg.type === 'result') {
          resolve(msg.payload?.text ?? '');
        } else if (msg.type === 'error') {
          reject(new Error(msg.payload?.message ?? 'SLM generation error'));
        }
      };

      worker.addEventListener('message', onMessage);
      worker.postMessage({
        id: reqId,
        type: 'generate',
        payload: { systemPrompt, userPrompt, maxNewTokens },
      });
    });
  }

  /**
   * Summarizes text with 8k-char chunked map-reduce for longer documents.
   */
  async summarizeBeforeListening(
    text: string,
    length: 'short' | 'medium',
    signal?: AbortSignal,
  ): Promise<{ summary: string; aiGenerated: boolean }> {
    const trimmed = text.trim();
    if (!trimmed) return { summary: '', aiGenerated: false };

    if (!this.ready) {
      // Deterministic extractive fallback when SLM weights are not downloaded
      const sentences = trimmed.split(/(?<=[.!?])\s+/).filter(Boolean);
      const count = length === 'short' ? 3 : 6;
      return {
        summary: sentences.slice(0, count).join(' '),
        aiGenerated: false,
      };
    }

    const chunks = sliceByChars(trimmed, MAX_CHUNK_CHARS);
    const maxTokens = length === 'short' ? 140 : 280;

    if (chunks.length === 1) {
      const result = await this.runPrompt(
        'Summarize the passage clearly in plain language for a listener before audio playback. Do not invent facts.',
        `Length: ${length}\n\n${chunks[0]}`,
        maxTokens,
        signal,
      );
      return { summary: result, aiGenerated: true };
    }

    // Map-reduce across 8k chunks
    const partials: string[] = [];
    for (const chunk of chunks.slice(0, 6)) {
      const part = await this.runPrompt(
        'Extract the 2 most important points concisely in plain text.',
        chunk,
        120,
        signal,
      );
      partials.push(part);
    }

    const combined = await this.runPrompt(
      'Combine these section summaries into one coherent preview summary.',
      partials.join('\n\n'),
      maxTokens,
      signal,
    );
    return { summary: combined, aiGenerated: true };
  }

  /**
   * Expands numbers, dates, currencies, and abbreviations into spoken form.
   * Uses the downloaded SLM when active; otherwise falls back to deterministic rules.
   */
  async cleanForSpeech(
    text: string,
    signal?: AbortSignal,
  ): Promise<{ cleanedText: string; changes: SpeechCleanupChange[]; aiGenerated: boolean }> {
    const deterministic = deterministicCleanForSpeech(text);
    if (!this.ready) {
      return { ...deterministic, aiGenerated: false };
    }

    const slice = text.slice(0, MAX_CHUNK_CHARS);
    const aiCleaned = await this.runPrompt(
      'Rewrite the text for text-to-speech playback: expand abbreviations, currencies, dates, and numbers into natural spoken words, and remove UI boilerplate. Keep meaning identical and return only the cleaned text.',
      slice,
      Math.min(1200, Math.ceil(slice.length / 2)),
      signal,
    );

    const finalText = text.length > MAX_CHUNK_CHARS
      ? `${aiCleaned}\n\n${deterministicCleanForSpeech(text.slice(MAX_CHUNK_CHARS)).cleanedText}`
      : aiCleaned || deterministic.cleanedText;

    return {
      cleanedText: finalText,
      changes: deterministic.changes,
      aiGenerated: true,
    };
  }

  async explainParagraph(
    paragraph: string,
    signal?: AbortSignal,
  ): Promise<{ explanation: string; aiGenerated: boolean }> {
    const slice = paragraph.slice(0, MAX_CHUNK_CHARS).trim();
    if (!this.ready) {
      return {
        explanation:
          'Download the optional on-device language model in Voice Lab / AI Tools to generate plain-language paragraph explanations offline.',
        aiGenerated: false,
      };
    }

    const explanation = await this.runPrompt(
      'Explain the selected paragraph in 2-3 clear sentences using plain everyday words.',
      slice,
      180,
      signal,
    );
    return { explanation, aiGenerated: true };
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
  }
}

function sliceByChars(text: string, maxChars: number): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    out.push(text.slice(i, i + maxChars));
    i += maxChars;
  }
  return out;
}
