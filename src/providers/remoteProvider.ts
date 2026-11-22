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

export interface RemoteTtsConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
  voice: string;
  format: 'mp3' | 'wav' | 'opus' | 'flac';
  useProxy: boolean;
}

const DEFAULT_REMOTE_VOICES: TtsVoice[] = [
  { id: 'af_heart', name: 'Heart (Remote)', lang: 'en-US', localService: false, providerId: 'remote', badge: 'Needs server' },
  { id: 'af_bella', name: 'Bella (Remote)', lang: 'en-US', localService: false, providerId: 'remote', badge: 'Needs server' },
  { id: 'am_adam', name: 'Adam (Remote)', lang: 'en-US', localService: false, providerId: 'remote', badge: 'Needs server' },
  { id: 'hf_alpha', name: 'Hindi Alpha (Remote)', lang: 'hi-IN', localService: false, providerId: 'remote', badge: 'Needs server' },
  { id: 'alloy', name: 'Alloy (OpenAI-compat)', lang: 'en-US', localService: false, providerId: 'remote', badge: 'Needs server' },
  { id: 'nova', name: 'Nova (OpenAI-compat)', lang: 'en-US', localService: false, providerId: 'remote', badge: 'Needs server' },
];

export class RemoteOpenAIProvider implements TtsProvider {
  readonly id = 'remote' as const;
  readonly name = 'Remote Server (OpenAI / Kokoro-FastAPI)';
  readonly kind = 'remote' as const;
  readonly capabilities: TtsProviderCapabilities = {
    wordBoundary: false,
    exportAudio: true,
    offline: false,
  };

  private config: RemoteTtsConfig = {
    baseUrl: 'http://localhost:8880',
    model: 'kokoro',
    voice: 'af_heart',
    format: 'wav',
    useProxy: false,
  };

  private voices: TtsVoice[] = DEFAULT_REMOTE_VOICES;

  configure(next: Partial<RemoteTtsConfig>): void {
    this.config = { ...this.config, ...next };
  }

  getConfig(): RemoteTtsConfig {
    return { ...this.config };
  }

  private endpointUrl(): string {
    if (this.config.useProxy) {
      return '/api/tts';
    }
    const base = this.config.baseUrl.replace(/\/+$/, '');
    return `${base}/v1/audio/speech`;
  }

  async init(onProgress?: (progress: ProviderInitProgress) => void): Promise<void> {
    onProgress?.({ progress: 30, status: 'Checking remote voice list…' });
    await this.getVoices();
    onProgress?.({ progress: 100, status: 'Remote TTS ready' });
  }

  async getVoices(): Promise<TtsVoice[]> {
    if (this.config.useProxy) return this.voices;

    const base = this.config.baseUrl.replace(/\/+$/, '');
    try {
      const res = await fetch(`${base}/v1/audio/voices`, {
        signal: AbortSignal.timeout(2500),
      });
      if (res.ok) {
        const data = (await res.json()) as { voices?: string[] };
        if (Array.isArray(data.voices) && data.voices.length > 0) {
          this.voices = data.voices.map((v) => ({
            id: v,
            name: v,
            lang: inferLangFromVoiceId(v),
            localService: false,
            providerId: 'remote' as const,
            badge: 'Needs server',
          }));
        }
      }
    } catch {
      // Server may not expose /v1/audio/voices or CORS may block GET; fall back to defaults
    }
    return this.voices;
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await fetch(this.endpointUrl(), {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model: this.config.model,
          input: 'Connection test.',
          voice: this.config.voice,
          response_format: this.config.format,
          speed: 1.0,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        return {
          ok: false,
          message: `Server returned HTTP ${res.status}${txt ? `: ${txt.slice(0, 120)}` : ''}`,
        };
      }
      return { ok: true, message: 'Connected! Audio response received.' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('failed to fetch') || msg.toLowerCase().includes('network')) {
        return {
          ok: false,
          message:
            'Network or CORS error. Enable CORS on your TTS server (e.g. CORS_ORIGINS=*) or route through /api/tts proxy.',
        };
      }
      return { ok: false, message: msg };
    }
  }

  async fetchEncodedAudio(text: string, opts: Pick<TtsSpeakOptions, 'voiceId' | 'rate'>): Promise<Blob> {
    const res = await fetch(this.endpointUrl(), {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({
        model: this.config.model,
        input: text,
        voice: opts.voiceId || this.config.voice,
        response_format: this.config.format,
        speed: Math.min(3.0, Math.max(0.5, opts.rate)),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw mapSpeechError('network', `Remote TTS HTTP ${res.status}: ${detail.slice(0, 120)}`);
    }

    return res.blob();
  }

  async *synthesize(
    chunk: TextChunk,
    opts: TtsSpeakOptions,
    signal?: AbortSignal,
  ): AsyncIterable<AudioChunk | void> {
    if (signal?.aborted) return;

    const res = await fetch(this.endpointUrl(), {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({
        model: this.config.model,
        input: chunk.text,
        voice: opts.voiceId || this.config.voice,
        response_format: this.config.format,
        speed: Math.min(3.0, Math.max(0.5, opts.rate)),
      }),
      signal,
    });

    if (!res.ok) {
      throw mapSpeechError('network', `Remote server error (${res.status})`);
    }

    const arrayBuf = await res.arrayBuffer();
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

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.apiKey && !this.config.useProxy) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }
    return headers;
  }

  cancel(): void {}
  dispose(): void {}
}

function inferLangFromVoiceId(voiceId: string): string {
  if (voiceId.startsWith('hf_') || voiceId.startsWith('hm_')) return 'hi-IN';
  if (voiceId.startsWith('bf_') || voiceId.startsWith('bm_')) return 'en-GB';
  if (voiceId.startsWith('ef_') || voiceId.startsWith('em_')) return 'es-ES';
  if (voiceId.startsWith('ff_')) return 'fr-FR';
  return 'en-US';
}
