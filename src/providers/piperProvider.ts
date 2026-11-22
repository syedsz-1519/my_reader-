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

export const PIPER_LICENSE_NOTICE =
  'Maintained Piper (OHF-Voice/piper1-gpl) is GPL-3.0; archived rhasspy/piper is MIT. Individual voice models carry their own licenses (CC-BY / MIT / etc.).';

export class PiperProvider implements TtsProvider {
  readonly id = 'piper' as const;
  readonly name = 'Piper WASM (Optional)';
  readonly kind = 'wasm' as const;
  readonly capabilities: TtsProviderCapabilities = {
    wordBoundary: false,
    exportAudio: true,
    offline: true,
  };

  private worker: Worker | null = null;
  private cachedVoices: TtsVoice[] = [];
  private reqCounter = 0;

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('../workers/piper.worker.ts', import.meta.url), {
        type: 'module',
      });
    }
    return this.worker;
  }

  async init(onProgress?: (progress: ProviderInitProgress) => void): Promise<void> {
    onProgress?.({ progress: 20, status: 'Loading Piper voice catalog…' });
    await this.getVoices();
    onProgress?.({ progress: 100, status: 'Piper catalog ready' });
  }

  async getVoices(): Promise<TtsVoice[]> {
    if (this.cachedVoices.length > 0) return this.cachedVoices;
    const worker = this.ensureWorker();
    const reqId = `p_${++this.reqCounter}`;

    return new Promise<TtsVoice[]>((resolve, reject) => {
      const onMessage = (event: MessageEvent) => {
        const msg = event.data as {
          id: string;
          type: string;
          payload?: {
            voices?: Array<{
              key: string;
              name: string;
              quality: string;
              language?: { code?: string; name_english?: string };
            }>;
            message?: string;
          };
        };
        if (msg.id !== reqId) return;
        worker.removeEventListener('message', onMessage);
        if (msg.type === 'error') {
          reject(mapSpeechError('provider-failed', msg.payload?.message));
          return;
        }
        const list = (msg.payload?.voices ?? []).slice(0, 60).map((v) => ({
          id: v.key,
          name: `${v.name} (${v.quality})`,
          lang: (v.language?.code ?? 'en_US').replace('_', '-'),
          localService: true,
          providerId: 'piper' as const,
          badge: `Needs download`,
          license: 'Model-specific (see HuggingFace card) · GPL-3.0/MIT',
        }));
        this.cachedVoices = list;
        resolve(list);
      };
      worker.addEventListener('message', onMessage);
      worker.postMessage({ id: reqId, type: 'voices' });
    });
  }

  async *synthesize(
    chunk: TextChunk,
    opts: TtsSpeakOptions,
    signal?: AbortSignal,
  ): AsyncIterable<AudioChunk | void> {
    if (signal?.aborted) return;
    const worker = this.ensureWorker();
    const reqId = `p_${++this.reqCounter}`;

    const arrayBuf = await new Promise<ArrayBuffer>((resolve, reject) => {
      const onMessage = (event: MessageEvent) => {
        const msg = event.data as {
          id: string;
          type: string;
          payload?: { arrayBuf?: ArrayBuffer; message?: string };
        };
        if (msg.id !== reqId) return;
        if (msg.type === 'wav' && msg.payload?.arrayBuf) {
          worker.removeEventListener('message', onMessage);
          resolve(msg.payload.arrayBuf);
        } else if (msg.type === 'error') {
          worker.removeEventListener('message', onMessage);
          reject(mapSpeechError('provider-failed', msg.payload?.message));
        }
      };
      worker.addEventListener('message', onMessage);
      worker.postMessage({
        id: reqId,
        type: 'predict',
        payload: {
          voiceId: opts.voiceId || 'en_US-hfc_female-medium',
          text: chunk.text,
        },
      });
    });

    if (signal?.aborted) return;
    const ctx = new AudioContext();
    try {
      const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
      const pcm = new Float32Array(decoded.getChannelData(0));
      yield {
        pcm,
        sampleRate: decoded.sampleRate,
        text: chunk.text,
        durationSec: decoded.duration,
      };
    } finally {
      void ctx.close().catch(() => {});
    }
  }

  cancel(): void {
    // Handled by AudioScheduler
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
