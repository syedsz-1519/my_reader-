import { isBenignCancellation, mapSpeechError } from './errors';
import type {
  ProviderInitProgress,
  TextChunk,
  TtsProvider,
  TtsProviderCapabilities,
  TtsSpeakOptions,
  TtsVoice,
} from './types';

const VOICE_POLL_INTERVAL_MS = 150;
const VOICE_POLL_MAX_MS = 3000;
const CHROME_KEEPALIVE_MS = 10_000;

export class WebSpeechProvider implements TtsProvider {
  readonly id = 'webspeech' as const;
  readonly name = 'Browser Speech';
  readonly kind = 'native' as const;
  readonly capabilities: TtsProviderCapabilities = {
    wordBoundary: true,
    exportAudio: false,
    offline: true,
  };

  private rawVoices: SpeechSynthesisVoice[] = [];
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;
  private disposed = false;

  private get synth(): SpeechSynthesis | null {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return null;
    }
    return window.speechSynthesis;
  }

  isSupported(): boolean {
    return this.synth !== null && typeof SpeechSynthesisUtterance !== 'undefined';
  }

  async init(onProgress?: (progress: ProviderInitProgress) => void): Promise<void> {
    if (!this.isSupported()) {
      throw mapSpeechError('unsupported');
    }
    if (this.initialized && this.rawVoices.length > 0) return;

    onProgress?.({ progress: 25, status: 'Checking device voices…' });
    await this.loadVoicesWithPolling();
    this.initialized = true;
    onProgress?.({ progress: 100, status: 'Browser voices ready' });
  }

  private async loadVoicesWithPolling(): Promise<SpeechSynthesisVoice[]> {
    const synth = this.synth;
    if (!synth) return [];

    const immediate = synth.getVoices();
    if (immediate.length > 0) {
      this.rawVoices = immediate;
      return immediate;
    }

    return new Promise<SpeechSynthesisVoice[]>((resolve) => {
      let settled = false;
      const startTime = Date.now();
      let pollId: ReturnType<typeof setInterval> | null = null;

      const finish = (found: SpeechSynthesisVoice[]) => {
        if (settled) return;
        settled = true;
        if (pollId !== null) clearInterval(pollId);
        synth.removeEventListener?.('voiceschanged', onVoicesChanged);
        this.rawVoices = found;
        resolve(found);
      };

      const check = () => {
        if (this.disposed) {
          finish(this.rawVoices);
          return;
        }
        const list = synth.getVoices();
        if (list.length > 0 || Date.now() - startTime >= VOICE_POLL_MAX_MS) {
          finish(list);
        }
      };

      const onVoicesChanged = () => {
        const list = synth.getVoices();
        if (list.length > 0) {
          finish(list);
        }
      };

      synth.addEventListener?.('voiceschanged', onVoicesChanged);
      pollId = setInterval(check, VOICE_POLL_INTERVAL_MS);
    });
  }

  async getVoices(): Promise<TtsVoice[]> {
    const synth = this.synth;
    if (!synth) return [];

    const current = synth.getVoices();
    const list = current.length > 0 ? current : this.rawVoices.length > 0 ? this.rawVoices : await this.loadVoicesWithPolling();
    this.rawVoices = list;

    return list.map((v) => ({
      id: v.voiceURI,
      name: v.name,
      lang: v.lang.replace('_', '-'),
      localService: Boolean(v.localService),
      providerId: 'webspeech',
      isDefault: v.default,
      badge: v.localService ? 'Local' : 'Network',
    }));
  }

  async speak(chunk: TextChunk, opts: TtsSpeakOptions, signal: AbortSignal): Promise<void> {
    const synth = this.synth;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
      throw mapSpeechError('unsupported');
    }
    if (signal.aborted) return;

    const voices = synth.getVoices();
    const allVoices = voices.length > 0 ? voices : this.rawVoices;
    const selectedVoice = opts.voiceId
      ? allVoices.find((v) => v.voiceURI === opts.voiceId)
      : undefined;

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const utterance = new SpeechSynthesisUtterance(chunk.text);
      utterance.rate = Math.min(3.0, Math.max(0.5, opts.rate));
      utterance.pitch = Math.min(2.0, Math.max(0.5, opts.pitch));
      utterance.volume = Math.min(1.0, Math.max(0, opts.volume));

      if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang;
      } else if (opts.lang) {
        utterance.lang = opts.lang;
      }

      const cleanup = () => {
        this.clearKeepAlive();
        signal.removeEventListener('abort', onAbort);
      };

      const onAbort = () => {
        if (settled) return;
        settled = true;
        cleanup();
        synth.cancel();
        resolve();
      };

      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });

      utterance.onstart = () => {
        if (settled || signal.aborted) return;
        opts.onStart?.();
        // Apply Chrome 10s pause/resume keep-alive ONLY for non-local voices
        const isLocal = selectedVoice ? Boolean(selectedVoice.localService) : false;
        if (!isLocal) {
          this.startKeepAlive(synth);
        }
      };

      utterance.onboundary = (event: SpeechSynthesisEvent) => {
        if (settled || signal.aborted) return;
        if (event.name === 'word' || event.name === undefined) {
          opts.onBoundary?.(event.charIndex, event.charLength);
        }
      };

      utterance.onend = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };

      utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (signal.aborted || isBenignCancellation(event.error)) {
          resolve();
          return;
        }
        reject(mapSpeechError(event.error, `SpeechSynthesis error: ${event.error}`));
      };

      try {
        synth.speak(utterance);
      } catch (err) {
        settled = true;
        cleanup();
        reject(mapSpeechError('synthesis-failed', String(err)));
      }
    });
  }

  async preview(
    voiceId: string,
    sampleText: string,
    opts: Pick<TtsSpeakOptions, 'rate' | 'pitch' | 'volume'>,
  ): Promise<void> {
    const synth = this.synth;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;

    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(sampleText);
    const voice = synth.getVoices().find((v) => v.voiceURI === voiceId);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    utterance.rate = Math.min(3.0, Math.max(0.5, opts.rate));
    utterance.pitch = Math.min(2.0, Math.max(0.5, opts.pitch));
    utterance.volume = Math.min(1.0, Math.max(0, opts.volume));

    return new Promise<void>((resolve) => {
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      synth.speak(utterance);
    });
  }

  pause(): void {
    this.clearKeepAlive();
    this.synth?.pause();
  }

  resume(): void {
    this.synth?.resume();
  }

  cancel(): void {
    this.clearKeepAlive();
    this.synth?.cancel();
  }

  dispose(): void {
    this.disposed = true;
    this.cancel();
  }

  private startKeepAlive(synth: SpeechSynthesis): void {
    this.clearKeepAlive();
    this.keepAliveTimer = setInterval(() => {
      if (synth.speaking && !synth.paused) {
        synth.pause();
        synth.resume();
      }
    }, CHROME_KEEPALIVE_MS);
  }

  private clearKeepAlive(): void {
    if (this.keepAliveTimer !== null) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }
}
