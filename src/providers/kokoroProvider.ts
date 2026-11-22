import { mapSpeechError } from '../engine/errors';
import type {
  AudioChunk,
  ProviderInitProgress,
  TextChunk,
  TtsProvider,
  TtsProviderCapabilities,
  TtsSpeakOptions,
  TtsVoice,
} from '../engine/types';

export const KOKORO_APPROX_SIZE_MB = 86;

export class KokoroProvider implements TtsProvider {
  readonly id = 'kokoro' as const;
  readonly name = 'Kokoro Neural (Offline)';
  readonly kind = 'wasm' as const;
  readonly capabilities: TtsProviderCapabilities = {
    wordBoundary: false,
    exportAudio: true,
    offline: true,
  };

  private worker: Worker | null = null;
  private voices: TtsVoice[] = [];
  private ready = false;
  private preferredDevice: 'wasm' | 'webgpu' = 'wasm';
  private reqCounter = 0;

  constructor() {
    if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
      this.preferredDevice = 'webgpu';
    }
  }

  setDevicePreference(device: 'wasm' | 'webgpu'): void {
    if (this.preferredDevice !== device) {
      this.preferredDevice = device;
      this.ready = false;
    }
  }

  getDevicePreference(): 'wasm' | 'webgpu' {
    return this.preferredDevice;
  }

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('../workers/kokoro.worker.ts', import.meta.url), {
        type: 'module',
      });
    }
    return this.worker;
  }

  async init(onProgress?: (progress: ProviderInitProgress) => void): Promise<void> {
    if (this.ready && this.voices.length > 0) return;

    const worker = this.ensureWorker();
    const reqId = `k_${++this.reqCounter}`;
    const dtype = this.preferredDevice === 'webgpu' ? 'fp32' : 'q8';

    await new Promise<void>((resolve, reject) => {
      const onMessage = (event: MessageEvent) => {
        const msg = event.data as {
          id: string;
          type: string;
          payload?: {
            progress?: number;
            status?: string;
            file?: string;
            voices?: TtsVoice[];
            message?: string;
          };
        };
        if (msg.id !== reqId) return;

        if (msg.type === 'progress') {
          onProgress?.({
            progress: msg.payload?.progress ?? 0,
            status: msg.payload?.status ?? 'Loading Kokoro model…',
            file: msg.payload?.file,
          });
        } else if (msg.type === 'ready') {
          worker.removeEventListener('message', onMessage);
          this.voices = msg.payload?.voices ?? [];
          this.ready = true;
          onProgress?.({ progress: 100, status: 'Kokoro ready offline' });
          resolve();
        } else if (msg.type === 'error') {
          worker.removeEventListener('message', onMessage);
          reject(mapSpeechError('provider-failed', msg.payload?.message));
        }
      };

      worker.addEventListener('message', onMessage);
      worker.postMessage({
        id: reqId,
        type: 'init',
        payload: { device: this.preferredDevice, dtype },
      });
    });
  }

  async getVoices(): Promise<TtsVoice[]> {
    if (!this.ready) {
      await this.init();
    }
    return this.voices;
  }

  async *synthesize(
    chunk: TextChunk,
    opts: TtsSpeakOptions,
    signal?: AbortSignal,
  ): AsyncIterable<AudioChunk | void> {
    if (!this.ready) {
      await this.init();
    }
    if (signal?.aborted) return;

    const worker = this.ensureWorker();
    const reqId = `k_${++this.reqCounter}`;
    const queue: AudioChunk[] = [];
    let done = false;
    let failure: Error | null = null;
    let notify: (() => void) | null = null;

    const onMessage = (event: MessageEvent) => {
      const msg = event.data as {
        id: string;
        type: string;
        payload?: {
          pcm?: Float32Array;
          sampleRate?: number;
          text?: string;
          durationSec?: number;
          message?: string;
        };
      };
      if (msg.id !== reqId) return;

      if (msg.type === 'chunk' && msg.payload?.pcm) {
        queue.push({
          pcm: msg.payload.pcm,
          sampleRate: msg.payload.sampleRate ?? 24000,
          text: msg.payload.text ?? chunk.text,
          durationSec: msg.payload.durationSec ?? 0,
        });
        notify?.();
      } else if (msg.type === 'done') {
        done = true;
        notify?.();
      } else if (msg.type === 'error') {
        failure = new Error(msg.payload?.message ?? 'Kokoro synthesis error');
        done = true;
        notify?.();
      }
    };

    worker.addEventListener('message', onMessage);
    worker.postMessage({
      id: reqId,
      type: 'synthesize',
      payload: {
        text: chunk.text,
        voice: opts.voiceId || 'af_heart',
        speed: opts.rate,
      },
    });

    try {
      while (!done || queue.length > 0) {
        if (signal?.aborted) break;
        if (queue.length > 0) {
          const item = queue.shift();
          if (item) yield item;
        } else {
          await new Promise<void>((res) => {
            notify = res;
          });
          notify = null;
        }
      }
      if (failure) throw failure;
    } finally {
      worker.removeEventListener('message', onMessage);
    }
  }

  cancel(): void {
    // Web Audio scheduler handles immediate cancellation of active playback
  }

  dispose(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.ready = false;
  }
}

export async function getModelCacheUsageBytes(): Promise<number> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      return est.usage ?? 0;
    }
  } catch {
    // Ignore storage estimate failure
  }
  return 0;
}

export async function clearDownloadedVoiceCaches(): Promise<void> {
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.includes('transformers') || k.includes('kokoro') || k.includes('onnx'))
          .map((k) => caches.delete(k)),
      );
    }
    if (typeof navigator !== 'undefined' && navigator.storage?.getDirectory) {
      const root = await navigator.storage.getDirectory();
      const entries = (root as unknown as { keys?: () => AsyncIterable<string> }).keys?.();
      if (entries) {
        for await (const name of entries) {
          if (name.includes('piper') || name.includes('onnx') || name.includes('kokoro')) {
            await root.removeEntry(name, { recursive: true }).catch(() => {});
          }
        }
      }
    }
  } catch {
    // Ignore cache delete failure
  }
}
