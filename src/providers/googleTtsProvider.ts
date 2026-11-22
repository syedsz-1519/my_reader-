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
import type { ExportProgress } from '../export/wavExporter';

export interface GoogleTtsConfig {
  consentGranted: boolean;
  languageCode: string;
  voice: string;
}

export const GOOGLE_CLOUD_VOICES: TtsVoice[] = [
  {
    id: 'en-US-Standard-C',
    name: 'English US Standard C (Female)',
    lang: 'en-US',
    localService: false,
    providerId: 'google',
    isDefault: true,
    badge: 'Cloud MP3',
  },
  {
    id: 'en-US-Standard-D',
    name: 'English US Standard D (Male)',
    lang: 'en-US',
    localService: false,
    providerId: 'google',
    badge: 'Cloud MP3',
  },
  {
    id: 'en-US-Neural2-F',
    name: 'English US Neural2 F (Female)',
    lang: 'en-US',
    localService: false,
    providerId: 'google',
    badge: 'Cloud MP3',
  },
  {
    id: 'en-US-Neural2-D',
    name: 'English US Neural2 D (Male)',
    lang: 'en-US',
    localService: false,
    providerId: 'google',
    badge: 'Cloud MP3',
  },
  {
    id: 'en-GB-Standard-A',
    name: 'English UK Standard A (Female)',
    lang: 'en-GB',
    localService: false,
    providerId: 'google',
    badge: 'Cloud MP3',
  },
  {
    id: 'en-GB-Neural2-B',
    name: 'English UK Neural2 B (Male)',
    lang: 'en-GB',
    localService: false,
    providerId: 'google',
    badge: 'Cloud MP3',
  },
  {
    id: 'hi-IN-Standard-A',
    name: 'Hindi Standard A',
    lang: 'hi-IN',
    localService: false,
    providerId: 'google',
    badge: 'Cloud MP3',
  },
  {
    id: 'hi-IN-Neural2-B',
    name: 'Hindi Neural2 B',
    lang: 'hi-IN',
    localService: false,
    providerId: 'google',
    badge: 'Cloud MP3',
  },
  {
    id: 'ur-PK-Standard-A',
    name: 'Urdu Pakistan Standard A',
    lang: 'ur-PK',
    localService: false,
    providerId: 'google',
    badge: 'Cloud MP3',
  },
  {
    id: 'ar-XA-Standard-A',
    name: 'Arabic Standard A',
    lang: 'ar-XA',
    localService: false,
    providerId: 'google',
    badge: 'Cloud MP3',
  },
  {
    id: 'es-ES-Standard-A',
    name: 'Spanish Standard A',
    lang: 'es-ES',
    localService: false,
    providerId: 'google',
    badge: 'Cloud MP3',
  },
  {
    id: 'fr-FR-Standard-A',
    name: 'French Standard A',
    lang: 'fr-FR',
    localService: false,
    providerId: 'google',
    badge: 'Cloud MP3',
  },
  {
    id: 'de-DE-Standard-A',
    name: 'German Standard A',
    lang: 'de-DE',
    localService: false,
    providerId: 'google',
    badge: 'Cloud MP3',
  },
];

export function mapRateToGoogleSpeakingRate(rate: number): number {
  if (!Number.isFinite(rate)) return 1.0;
  return Math.min(2.0, Math.max(0.25, Number(rate.toFixed(2))));
}

export function mapPitchToGoogleSemitones(pitch: number): number {
  if (!Number.isFinite(pitch)) return 0.0;
  const semitones = (pitch - 1.0) * 10;
  return Math.min(20.0, Math.max(-20.0, Number(semitones.toFixed(2))));
}

export function inferGoogleLanguageCode(voiceId: string, fallbackLang = 'en-US'): string {
  const match = /^([a-z]{2,3}-[A-Z]{2})-/.exec(voiceId.trim());
  if (match) return match[1];
  return fallbackLang.trim() || 'en-US';
}

export function decodeBase64ToUint8Array(base64: string): Uint8Array {
  const cleaned = base64.replace(/^data:audio\/[^;]+;base64,/, '').trim();
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function concatUint8Arrays(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

export function splitTextForGoogleTts(text: string, maxChars = 3800): string[] {
  const normalized = text.trim();
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const segments: string[] = [];
  let cursor = 0;
  while (cursor < normalized.length) {
    if (normalized.length - cursor <= maxChars) {
      segments.push(normalized.slice(cursor).trim());
      break;
    }

    const window = normalized.slice(cursor, cursor + maxChars);
    const sentenceBreak = Math.max(
      window.lastIndexOf('. '),
      window.lastIndexOf('! '),
      window.lastIndexOf('? '),
      window.lastIndexOf('\n'),
    );
    const splitAt =
      sentenceBreak > Math.floor(maxChars * 0.45)
        ? sentenceBreak + 1
        : Math.max(window.lastIndexOf(' '), maxChars);

    const piece = normalized.slice(cursor, cursor + splitAt).trim();
    if (piece) segments.push(piece);
    cursor += splitAt;
    while (cursor < normalized.length && /\s/.test(normalized[cursor])) {
      cursor += 1;
    }
  }
  return segments;
}

export class GoogleCloudTtsProvider implements TtsProvider {
  readonly id = 'google' as const;
  readonly name = 'Google Cloud Text-to-Speech';
  readonly kind = 'remote' as const;
  readonly capabilities: TtsProviderCapabilities = {
    wordBoundary: false,
    exportAudio: true,
    offline: false,
  };

  private config: GoogleTtsConfig = {
    consentGranted: false,
    languageCode: 'en-US',
    voice: 'en-US-Standard-C',
  };

  configure(next: Partial<GoogleTtsConfig>): void {
    this.config = { ...this.config, ...next };
  }

  getConfig(): GoogleTtsConfig {
    return { ...this.config };
  }

  async init(onProgress?: (progress: ProviderInitProgress) => void): Promise<void> {
    if (!this.config.consentGranted) {
      throw mapSpeechError(
        'not-allowed',
        'Enable privacy opt-in consent for Google Cloud Text-to-Speech in Voice Lab first.',
      );
    }
    onProgress?.({ progress: 50, status: 'Preparing Google Cloud voices…' });
    onProgress?.({ progress: 100, status: 'Google Cloud TTS ready' });
  }

  async getVoices(): Promise<TtsVoice[]> {
    return GOOGLE_CLOUD_VOICES;
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    if (!this.config.consentGranted) {
      return {
        ok: false,
        message: 'Check the privacy opt-in consent box before testing Google Cloud TTS.',
      };
    }

    try {
      const voice = this.config.voice || 'en-US-Standard-C';
      const languageCode = inferGoogleLanguageCode(voice, this.config.languageCode);
      const res = await fetch('/api/google-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          text: 'Connection test.',
          languageCode,
          voice,
          speakingRate: 1.0,
          pitch: 0.0,
          consentGranted: true,
        }),
      });

      const payload = (await res.json().catch(() => ({}))) as {
        audioContent?: string;
        error?: string;
      };
      if (!res.ok) {
        return {
          ok: false,
          message: payload.error || `Server returned HTTP ${res.status}`,
        };
      }
      if (!payload.audioContent) {
        return { ok: false, message: 'Server returned empty MP3 payload.' };
      }
      return { ok: true, message: 'Connected! Google Cloud MP3 audio received.' };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'Unable to reach /api/google-tts.',
      };
    }
  }

  async requestMp3Bytes(
    text: string,
    opts: Pick<TtsSpeakOptions, 'voiceId' | 'lang' | 'rate' | 'pitch'>,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    if (!this.config.consentGranted) {
      throw mapSpeechError(
        'not-allowed',
        'Opt-in consent is required before sending text to Google Cloud Text-to-Speech.',
      );
    }

    const voice = opts.voiceId || this.config.voice || 'en-US-Standard-C';
    const languageCode = inferGoogleLanguageCode(voice, opts.lang || this.config.languageCode);

    const res = await fetch('/api/google-tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        text: text.slice(0, 4000),
        languageCode,
        voice,
        speakingRate: mapRateToGoogleSpeakingRate(opts.rate),
        pitch: mapPitchToGoogleSemitones(opts.pitch),
        consentGranted: true,
      }),
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as { error?: string };
      throw mapSpeechError(
        res.status === 501 || res.status === 400 ? 'provider-failed' : 'network',
        errBody.error || `Google Cloud TTS HTTP ${res.status}`,
      );
    }

    const data = (await res.json()) as { audioContent?: unknown };
    if (typeof data.audioContent !== 'string' || !data.audioContent) {
      throw mapSpeechError('synthesis-failed', 'Google Cloud TTS returned empty audio.');
    }

    return decodeBase64ToUint8Array(data.audioContent);
  }

  async fetchDocumentMp3(
    text: string,
    opts: Pick<TtsSpeakOptions, 'voiceId' | 'lang' | 'rate' | 'pitch'>,
    onProgress?: (progress: ExportProgress) => void,
    signal?: AbortSignal,
  ): Promise<Blob> {
    const segments = splitTextForGoogleTts(text, 3800);
    if (segments.length === 0) {
      throw new Error('Nothing to export.');
    }

    const parts: Uint8Array[] = [];
    for (let i = 0; i < segments.length; i++) {
      if (signal?.aborted) {
        throw new DOMException('Export canceled', 'AbortError');
      }
      const bytes = await this.requestMp3Bytes(segments[i], opts, signal);
      parts.push(bytes);
      onProgress?.({
        completedChunks: i + 1,
        totalChunks: segments.length,
        percent: Math.round(((i + 1) / segments.length) * 100),
      });
    }

    const combined = concatUint8Arrays(parts);
    return new Blob([combined.slice().buffer], { type: 'audio/mpeg' });
  }

  async *synthesize(
    chunk: TextChunk,
    opts: TtsSpeakOptions,
    signal?: AbortSignal,
  ): AsyncIterable<AudioChunk | void> {
    if (signal?.aborted) return;

    const mp3Bytes = await this.requestMp3Bytes(chunk.text, opts, signal);
    if (signal?.aborted) return;

    const ctx = new AudioContext();
    try {
      const decoded = await ctx.decodeAudioData(mp3Bytes.slice().buffer);
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

  cancel(): void {}
  dispose(): void {}
}
