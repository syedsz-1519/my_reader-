import { AudioScheduler } from './audioScheduler';
import { buildDocumentStructure } from './chunker';
import { mapSpeechError } from './errors';
import { findWordIndexAtCharOffset, PositionEstimator } from './estimator';
import { loadPersistedState, savePersistedState } from './storage';
import type {
  AudioChunk,
  BoundaryPosition,
  DocumentStructure,
  ProviderId,
  ProviderInitProgress,
  TextChunk,
  TtsEngineEvents,
  TtsEngineSnapshot,
  TtsError,
  TtsProvider,
  TtsState,
  TtsVoice,
} from './types';
import { WebSpeechProvider } from './webSpeechProvider';

type ListenerMap = {
  [K in keyof TtsEngineEvents]: Set<TtsEngineEvents[K]>;
};

export interface TtsEngineOptions {
  defaultProvider?: TtsProvider;
  persist?: boolean;
}

export class TtsEngine {
  private providers = new Map<ProviderId, TtsProvider>();
  private activeProvider: TtsProvider;
  private fallbackProvider: WebSpeechProvider;
  private scheduler = new AudioScheduler();
  private estimator = new PositionEstimator();
  private persistEnabled: boolean;

  private listeners: ListenerMap = {
    state: new Set(),
    chunk: new Set(),
    boundary: new Set(),
    voices: new Set(),
    error: new Set(),
    fallback: new Set(),
    autoplayBlocked: new Set(),
    complete: new Set(),
  };

  private doc: DocumentStructure = buildDocumentStructure('');
  private state: TtsState = 'idle';
  private providerId: ProviderId = 'webspeech';
  private activeChunkIndex = 0;
  private activeSentenceIndex = 0;
  private activeParagraphIndex = 0;
  private activeWordIndex = 0;
  private charOffset = 0;
  private voices: TtsVoice[] = [];
  private voicesLoading = true;
  private autoplayBlocked = false;
  private error: TtsError | null = null;

  private rate = 1.0;
  private pitch = 1.0;
  private volume = 1.0;
  private muted = false;
  private voiceId = '';
  private lang = 'en';

  private sessionId = 0;
  private currentAbort: AbortController | null = null;
  private boundaryTimer: ReturnType<typeof setInterval> | null = null;
  private settingsDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private prefetchCache = new Map<string, Promise<AudioChunk[]>>();
  private speechPreprocessor: ((text: string) => string) | null = null;
  private isActionBusy = false;
  private disposed = false;

  constructor(options: TtsEngineOptions = {}) {
    this.persistEnabled = options.persist ?? true;
    const saved = this.persistEnabled ? loadPersistedState() : null;

    this.fallbackProvider = new WebSpeechProvider();
    this.providers.set('webspeech', this.fallbackProvider);

    if (options.defaultProvider) {
      this.providers.set(options.defaultProvider.id, options.defaultProvider);
      this.activeProvider = options.defaultProvider;
      this.providerId = options.defaultProvider.id;
    } else {
      this.activeProvider = this.fallbackProvider;
      this.providerId = 'webspeech';
    }

    if (saved) {
      this.rate = saved.rate;
      this.pitch = saved.pitch;
      this.volume = saved.volume;
      this.muted = saved.muted;
      this.voiceId = saved.voiceId;
      this.activeChunkIndex = saved.chunkIndex;
      this.charOffset = saved.charOffset;
      this.setText(saved.lastText, { resetPosition: false });
    }

    this.scheduler.setVolume(this.muted ? 0 : this.volume);
    void this.refreshVoices();
  }

  registerProvider(provider: TtsProvider): void {
    this.providers.set(provider.id, provider);
  }

  setSpeechPreprocessor(fn: ((text: string) => string) | null): void {
    this.speechPreprocessor = fn;
    this.prefetchCache.clear();
  }

  getProvider(id: ProviderId): TtsProvider | undefined {
    return this.providers.get(id);
  }

  getActiveProvider(): TtsProvider {
    return this.activeProvider;
  }

  getDocument(): DocumentStructure {
    return this.doc;
  }

  getSnapshot(): TtsEngineSnapshot {
    return {
      state: this.state,
      providerId: this.providerId,
      activeChunkIndex: this.activeChunkIndex,
      activeSentenceIndex: this.activeSentenceIndex,
      activeParagraphIndex: this.activeParagraphIndex,
      activeWordIndex: this.activeWordIndex,
      charOffset: this.charOffset,
      totalChunks: this.doc.chunks.length,
      totalSentences: this.doc.sentences.length,
      voices: this.voices,
      voicesLoading: this.voicesLoading,
      autoplayBlocked: this.autoplayBlocked,
      error: this.error,
      rate: this.rate,
      pitch: this.pitch,
      volume: this.volume,
      muted: this.muted,
      voiceId: this.voiceId,
      lang: this.lang,
    };
  }

  on<K extends keyof TtsEngineEvents>(event: K, fn: TtsEngineEvents[K]): () => void {
    this.listeners[event].add(fn);
    return () => {
      this.listeners[event].delete(fn);
    };
  }

  private emit<K extends keyof TtsEngineEvents>(
    event: K,
    ...args: Parameters<TtsEngineEvents[K]>
  ): void {
    for (const fn of this.listeners[event]) {
      (fn as (...a: Parameters<TtsEngineEvents[K]>) => void)(...args);
    }
  }

  private emitState(): void {
    this.emit('state', this.getSnapshot());
  }

  private setState(next: TtsState, error: TtsError | null = null): void {
    this.state = next;
    this.error = error;
    this.emitState();
  }

  async refreshVoices(onProgress?: (p: ProviderInitProgress) => void): Promise<TtsVoice[]> {
    this.voicesLoading = true;
    this.emitState();

    try {
      await this.activeProvider.init(onProgress);
      const list = await this.activeProvider.getVoices();
      this.voices = list;
      this.voicesLoading = false;

      if (list.length > 0 && !list.some((v) => v.id === this.voiceId)) {
        const preferred =
          list.find((v) => v.lang.toLowerCase().startsWith(this.lang.toLowerCase())) ??
          list.find((v) => v.isDefault) ??
          list[0];
        if (preferred) {
          this.voiceId = preferred.id;
        }
      }

      this.emit('voices', list);
      this.emitState();
      return list;
    } catch (err) {
      this.voicesLoading = false;
      const mapped = isTtsError(err) ? err : mapSpeechError('provider-failed', String(err));
      if (this.activeProvider.id !== 'webspeech') {
        await this.fallbackToWebSpeech(mapped.message);
        return this.voices;
      }
      this.setState('error', mapped);
      this.emit('error', mapped);
      return [];
    }
  }

  async switchProvider(
    nextId: ProviderId,
    onProgress?: (p: ProviderInitProgress) => void,
  ): Promise<boolean> {
    const target = this.providers.get(nextId);
    if (!target) return false;

    const wasPlaying = this.state === 'speaking' || this.state === 'loading';
    const resumeChunk = this.activeChunkIndex;

    this.cancelCurrentSpeech();
    this.prefetchCache.clear();
    this.activeProvider = target;
    this.providerId = nextId;

    try {
      await this.refreshVoices(onProgress);
      const stayedOnTarget = this.providerId === nextId;
      if (wasPlaying) {
        await this.play(resumeChunk);
      }
      return stayedOnTarget;
    } catch (err) {
      const reason = isTtsError(err) ? err.message : String(err);
      await this.fallbackToWebSpeech(reason);
      if (wasPlaying) {
        await this.play(resumeChunk);
      }
      return false;
    }
  }

  private async fallbackToWebSpeech(reason: string): Promise<void> {
    const failedFrom = this.providerId;
    this.cancelCurrentSpeech();
    this.prefetchCache.clear();
    this.activeProvider = this.fallbackProvider;
    this.providerId = 'webspeech';
    this.emit('fallback', { from: failedFrom, to: 'webspeech', reason });
    try {
      await this.fallbackProvider.init();
      this.voices = await this.fallbackProvider.getVoices();
      const firstMatch =
        this.voices.find((v) => v.lang.toLowerCase().startsWith(this.lang.toLowerCase())) ??
        this.voices[0];
      if (firstMatch) this.voiceId = firstMatch.id;
      this.voicesLoading = false;
      this.emit('voices', this.voices);
      this.emitState();
    } catch {
      this.voicesLoading = false;
      this.emitState();
    }
  }

  setText(rawText: string, opts: { resetPosition?: boolean; locale?: string } = {}): DocumentStructure {
    const resetPosition = opts.resetPosition ?? true;
    if (resetPosition) {
      this.stop();
    }

    if (opts.locale) {
      this.lang = opts.locale;
    }

    this.doc = buildDocumentStructure(rawText, { locale: this.lang });
    this.prefetchCache.clear();

    if (resetPosition || this.activeChunkIndex >= this.doc.chunks.length) {
      this.activeChunkIndex = 0;
      this.activeSentenceIndex = 0;
      this.activeParagraphIndex = 0;
      this.activeWordIndex = 0;
      this.charOffset = 0;
    } else {
      const chunk = this.doc.chunks[this.activeChunkIndex];
      if (chunk) {
        this.activeSentenceIndex = chunk.sentenceIndex;
        this.activeParagraphIndex = chunk.paragraphIndex;
        this.activeWordIndex = findWordIndexAtCharOffset(chunk, this.charOffset);
      }
    }

    this.persistPosition(rawText);
    this.emitState();
    return this.doc;
  }

  async play(startChunkIndex?: number): Promise<void> {
    if (this.disposed || this.isActionBusy) return;
    if (this.doc.chunks.length === 0) return;

    this.isActionBusy = true;
    this.autoplayBlocked = false;
    this.emit('autoplayBlocked', false);

    try {
      if (typeof startChunkIndex === 'number') {
        this.activeChunkIndex = Math.max(0, Math.min(startChunkIndex, this.doc.chunks.length - 1));
        this.charOffset = 0;
        this.activeWordIndex = 0;
      }

      this.sessionId += 1;
      const mySession = this.sessionId;
      this.cancelCurrentSpeech(false);
      this.setState('loading', null);

      try {
        await this.activeProvider.init();
      } catch (err) {
        if (mySession !== this.sessionId) return;
        const mapped = isTtsError(err) ? err : mapSpeechError('provider-failed', String(err));
        if (this.activeProvider.id !== 'webspeech') {
          await this.fallbackToWebSpeech(mapped.message);
        } else {
          this.setState('error', mapped);
          this.emit('error', mapped);
          return;
        }
      }

      if (mySession !== this.sessionId) return;
      this.isActionBusy = false;
      void this.runChunkLoop(this.activeChunkIndex, mySession);
    } finally {
      this.isActionBusy = false;
    }
  }

  private async runChunkLoop(startIdx: number, session: number): Promise<void> {
    for (let idx = startIdx; idx < this.doc.chunks.length; idx++) {
      if (this.disposed || session !== this.sessionId) return;

      const chunk = this.doc.chunks[idx];
      this.activeChunkIndex = idx;
      this.activeSentenceIndex = chunk.sentenceIndex;
      this.activeParagraphIndex = chunk.paragraphIndex;
      this.activeWordIndex = 0;
      this.charOffset = 0;

      this.emit('chunk', chunk);
      this.emitBoundary(chunk, 0, true);
      this.persistPosition();

      const abort = new AbortController();
      this.currentAbort = abort;

      try {
        if (this.activeProvider.speak) {
          await this.speakNativeChunk(chunk, abort.signal, session);
        } else if (this.activeProvider.synthesize) {
          await this.playSynthesizedChunk(idx, chunk, abort.signal, session);
        }
      } catch (err) {
        this.stopBoundaryTimer();
        if (this.disposed || session !== this.sessionId || abort.signal.aborted) {
          return;
        }
        const mapped = isTtsError(err) ? err : mapSpeechError('synthesis-failed', String(err));

        if (mapped.code === 'not-allowed') {
          this.autoplayBlocked = true;
          this.emit('autoplayBlocked', true);
          this.setState('paused', mapped);
          this.emit('error', mapped);
          return;
        }

        if (this.activeProvider.id !== 'webspeech') {
          await this.fallbackToWebSpeech(mapped.message);
          void this.runChunkLoop(idx, session);
          return;
        }

        this.setState('error', mapped);
        this.emit('error', mapped);
        return;
      }

      this.stopBoundaryTimer();
      if (this.disposed || session !== this.sessionId || abort.signal.aborted) {
        return;
      }
    }

    if (session === this.sessionId && !this.disposed) {
      this.activeChunkIndex = Math.max(0, this.doc.chunks.length - 1);
      this.charOffset = 0;
      this.setState('idle', null);
      this.persistPosition();
      this.emit('complete');
    }
  }

  private async speakNativeChunk(
    chunk: TextChunk,
    signal: AbortSignal,
    session: number,
  ): Promise<void> {
    if (!this.activeProvider.speak) return;

    this.startBoundaryEstimator(chunk, session);

    const spokenText = this.speechPreprocessor ? this.speechPreprocessor(chunk.text) : chunk.text;
    const speakChunk = spokenText === chunk.text ? chunk : { ...chunk, text: spokenText };

    await this.activeProvider.speak(
      speakChunk,
      {
        voiceId: this.voiceId || undefined,
        lang: this.lang,
        rate: this.rate,
        pitch: this.pitch,
        volume: this.muted ? 0 : this.volume,
        onStart: () => {
          if (session !== this.sessionId) return;
          this.estimator.start(this.rate, 0);
          this.setState('speaking', null);
        },
        onBoundary: (charIndex) => {
          if (session !== this.sessionId || this.state !== 'speaking') return;
          const calibrated = this.estimator.onRealBoundary(charIndex);
          this.emitBoundary(chunk, calibrated, false);
        },
      },
      signal,
    );
  }

  private async playSynthesizedChunk(
    chunkIdx: number,
    chunk: TextChunk,
    signal: AbortSignal,
    session: number,
  ): Promise<void> {
    const audioChunks = await this.getOrPrefetchAudio(chunkIdx);
    if (signal.aborted || session !== this.sessionId) return;

    // Prefetch next chunk gaplessly while current chunk plays
    if (chunkIdx + 1 < this.doc.chunks.length) {
      void this.getOrPrefetchAudio(chunkIdx + 1).catch(() => {});
    }

    await this.scheduler.playChunk(audioChunks, signal, {
      onStart: () => {
        if (session !== this.sessionId) return;
        this.estimator.start(this.rate, 0);
        this.setState('speaking', null);
      },
      onProgress: (elapsedSec, durationSec) => {
        if (session !== this.sessionId || this.state !== 'speaking') return;
        const ratio = durationSec > 0 ? elapsedSec / durationSec : 0;
        const estChar = Math.min(
          Math.floor(ratio * chunk.text.length),
          Math.max(0, chunk.text.length - 1),
        );
        this.emitBoundary(chunk, estChar, true);
      },
    });
  }

  private getOrPrefetchAudio(chunkIdx: number): Promise<AudioChunk[]> {
    const chunk = this.doc.chunks[chunkIdx];
    const spokenText = this.speechPreprocessor ? this.speechPreprocessor(chunk.text) : chunk.text;
    const synthChunk = spokenText === chunk.text ? chunk : { ...chunk, text: spokenText };
    const cacheKey = `${this.providerId}:${this.voiceId}:${this.rate}:${chunkIdx}:${synthChunk.text}`;
    const existing = this.prefetchCache.get(cacheKey);
    if (existing) return existing;

    const promise = (async () => {
      if (!this.activeProvider.synthesize) return [];
      const collected: AudioChunk[] = [];
      for await (const piece of this.activeProvider.synthesize(synthChunk, {
        voiceId: this.voiceId || undefined,
        lang: this.lang,
        rate: this.rate,
        pitch: this.pitch,
        volume: this.muted ? 0 : this.volume,
      })) {
        if (piece) collected.push(piece);
      }
      return collected;
    })();

    // Bound prefetch cache size
    if (this.prefetchCache.size > 6) {
      const oldestKey = this.prefetchCache.keys().next().value;
      if (oldestKey) this.prefetchCache.delete(oldestKey);
    }
    this.prefetchCache.set(cacheKey, promise);
    return promise;
  }

  private startBoundaryEstimator(chunk: TextChunk, session: number): void {
    this.stopBoundaryTimer();
    this.estimator.start(this.rate, 0);
    this.boundaryTimer = setInterval(() => {
      if (session !== this.sessionId || this.state !== 'speaking') return;
      const estimatedOffset = this.estimator.getEstimatedCharOffset(chunk.text.length);
      this.emitBoundary(chunk, estimatedOffset, !this.estimator.hasSeenRealBoundary());
    }, 60);
  }

  private stopBoundaryTimer(): void {
    if (this.boundaryTimer !== null) {
      clearInterval(this.boundaryTimer);
      this.boundaryTimer = null;
    }
  }

  private emitBoundary(chunk: TextChunk, charOffset: number, estimated: boolean): void {
    const clampedChar = Math.max(0, Math.min(charOffset, Math.max(0, chunk.text.length - 1)));
    const wordIdx = findWordIndexAtCharOffset(chunk, clampedChar);
    this.charOffset = clampedChar;
    this.activeWordIndex = wordIdx;

    const pos: BoundaryPosition = {
      chunkIndex: chunk.index,
      sentenceIndex: chunk.sentenceIndex,
      paragraphIndex: chunk.paragraphIndex,
      charOffset: clampedChar,
      globalCharOffset: chunk.startOffset + clampedChar,
      wordIndex: wordIdx,
      estimated,
    };
    this.emit('boundary', pos);
  }

  pause(): void {
    if (this.state !== 'speaking' && this.state !== 'loading') return;
    this.stopBoundaryTimer();
    if (this.activeProvider.speak) {
      this.activeProvider.pause?.();
    } else {
      void this.scheduler.pause();
    }
    this.setState('paused', null);
    this.persistPosition();
  }

  resume(): void {
    if (this.state !== 'paused') return;
    if (this.autoplayBlocked) {
      void this.play(this.activeChunkIndex);
      return;
    }
    if (this.activeProvider.speak) {
      this.activeProvider.resume?.();
      const chunk = this.doc.chunks[this.activeChunkIndex];
      if (chunk) this.startBoundaryEstimator(chunk, this.sessionId);
      this.setState('speaking', null);
    } else {
      void this.scheduler.resume();
      this.setState('speaking', null);
    }
  }

  togglePlay(): void {
    if (this.state === 'speaking' || this.state === 'loading') {
      this.pause();
    } else if (this.state === 'paused') {
      this.resume();
    } else {
      void this.play(this.activeChunkIndex);
    }
  }

  stop(): void {
    this.sessionId += 1;
    this.cancelCurrentSpeech(false);
    this.activeChunkIndex = 0;
    this.activeSentenceIndex = 0;
    this.activeParagraphIndex = 0;
    this.activeWordIndex = 0;
    this.charOffset = 0;
    this.autoplayBlocked = false;
    this.setState('idle', null);
    this.persistPosition();
  }

  retry(): void {
    this.error = null;
    void this.play(this.activeChunkIndex);
  }

  seekToChunk(chunkIndex: number): void {
    if (this.doc.chunks.length === 0) return;
    const clamped = Math.max(0, Math.min(chunkIndex, this.doc.chunks.length - 1));
    const chunk = this.doc.chunks[clamped];
    this.activeChunkIndex = clamped;
    this.activeSentenceIndex = chunk.sentenceIndex;
    this.activeParagraphIndex = chunk.paragraphIndex;
    this.activeWordIndex = 0;
    this.charOffset = 0;
    this.persistPosition();

    if (this.state === 'speaking' || this.state === 'loading') {
      void this.play(clamped);
    } else {
      this.emit('chunk', chunk);
      this.emitBoundary(chunk, 0, true);
      this.emitState();
    }
  }

  seekToSentence(sentenceIndex: number): void {
    const sentence = this.doc.sentences[sentenceIndex];
    if (!sentence) return;
    const targetChunk = sentence.firstChunkIndex >= 0 ? sentence.firstChunkIndex : 0;
    this.activeSentenceIndex = sentenceIndex;
    this.activeParagraphIndex = sentence.paragraphIndex;
    this.seekToChunk(targetChunk);
  }

  nextSentence(): void {
    if (this.doc.sentences.length === 0) return;
    const next = Math.min(this.activeSentenceIndex + 1, this.doc.sentences.length - 1);
    this.seekToSentence(next);
  }

  prevSentence(): void {
    if (this.doc.sentences.length === 0) return;
    const prev = Math.max(0, this.activeSentenceIndex - 1);
    this.seekToSentence(prev);
  }

  nextParagraph(): void {
    if (this.doc.paragraphs.length === 0) return;
    const nextP = Math.min(this.activeParagraphIndex + 1, this.doc.paragraphs.length - 1);
    const firstSentence = this.doc.paragraphs[nextP]?.sentences[0];
    if (firstSentence) {
      this.seekToSentence(firstSentence.index);
    }
  }

  prevParagraph(): void {
    if (this.doc.paragraphs.length === 0) return;
    const prevP = Math.max(0, this.activeParagraphIndex - 1);
    const firstSentence = this.doc.paragraphs[prevP]?.sentences[0];
    if (firstSentence) {
      this.seekToSentence(firstSentence.index);
    }
  }

  skipBySeconds(deltaSeconds: number): void {
    if (this.doc.chunks.length === 0) return;
    const deltaChars = Math.round(deltaSeconds * this.rate * 14);
    const currentChunk = this.doc.chunks[this.activeChunkIndex];
    if (!currentChunk) return;

    const targetGlobalOffset = Math.max(
      0,
      Math.min(this.doc.totalChars, currentChunk.startOffset + this.charOffset + deltaChars),
    );

    const found = this.doc.chunks.findIndex(
      (c) => targetGlobalOffset >= c.startOffset && targetGlobalOffset <= c.endOffset,
    );
    const targetIdx =
      found >= 0
        ? found
        : targetGlobalOffset >= this.doc.totalChars
          ? this.doc.chunks.length - 1
          : 0;
    this.seekToChunk(targetIdx);
  }

  /**
   * Updates rate, pitch, volume, mute, or voice.
   * Mid-speech rate/pitch/voice changes are debounced 250ms and restart from the CURRENT chunk.
   */
  updateSettings(
    next: Partial<Pick<TtsEngineSnapshot, 'rate' | 'pitch' | 'volume' | 'muted' | 'voiceId' | 'lang'>>,
  ): void {
    let requiresRestart = false;

    if (typeof next.rate === 'number') {
      const clamped = Math.min(3.0, Math.max(0.5, Number(next.rate.toFixed(2))));
      if (clamped !== this.rate) {
        this.rate = clamped;
        requiresRestart = true;
      }
    }

    if (typeof next.pitch === 'number') {
      const clamped = Math.min(2.0, Math.max(0.5, Number(next.pitch.toFixed(2))));
      if (clamped !== this.pitch) {
        this.pitch = clamped;
        requiresRestart = true;
      }
    }

    if (typeof next.voiceId === 'string' && next.voiceId !== this.voiceId) {
      this.voiceId = next.voiceId;
      requiresRestart = true;
    }

    if (typeof next.lang === 'string' && next.lang !== this.lang) {
      this.lang = next.lang;
    }

    if (typeof next.volume === 'number') {
      this.volume = Math.min(1, Math.max(0, next.volume));
      this.scheduler.setVolume(this.muted ? 0 : this.volume);
      if (this.activeProvider.speak && (this.state === 'speaking' || this.state === 'loading')) {
        requiresRestart = true;
      }
    }

    if (typeof next.muted === 'boolean') {
      this.muted = next.muted;
      this.scheduler.setVolume(this.muted ? 0 : this.volume);
      if (this.activeProvider.speak && (this.state === 'speaking' || this.state === 'loading')) {
        requiresRestart = true;
      }
    }

    this.persistPosition();
    this.emitState();

    if (requiresRestart && (this.state === 'speaking' || this.state === 'loading')) {
      const targetChunk = this.activeChunkIndex;
      if (this.settingsDebounceTimer !== null) {
        clearTimeout(this.settingsDebounceTimer);
      }
      this.settingsDebounceTimer = setTimeout(() => {
        this.settingsDebounceTimer = null;
        if (!this.disposed && (this.state === 'speaking' || this.state === 'loading')) {
          void this.play(targetChunk);
        }
      }, 250);
    }
  }

  async previewVoice(voiceId: string, sampleText = 'This is how your voice sounds while reading.'): Promise<void> {
    if (this.activeProvider.preview) {
      await this.activeProvider.preview(voiceId, sampleText, {
        rate: this.rate,
        pitch: this.pitch,
        volume: this.muted ? 0 : this.volume,
      });
      return;
    }
    if (this.activeProvider.synthesize) {
      const dummyChunk: TextChunk = {
        index: 0,
        paragraphIndex: 0,
        sentenceIndex: 0,
        text: sampleText,
        startOffset: 0,
        endOffset: sampleText.length,
        words: [],
      };
      const abort = new AbortController();
      const pieces: AudioChunk[] = [];
      for await (const p of this.activeProvider.synthesize(dummyChunk, {
        voiceId,
        lang: this.lang,
        rate: this.rate,
        pitch: this.pitch,
        volume: this.muted ? 0 : this.volume,
      })) {
        if (p) pieces.push(p);
      }
      await this.scheduler.playChunk(pieces, abort.signal);
    }
  }

  private cancelCurrentSpeech(resetSession = true): void {
    if (resetSession) this.sessionId += 1;
    this.stopBoundaryTimer();
    if (this.settingsDebounceTimer !== null) {
      clearTimeout(this.settingsDebounceTimer);
      this.settingsDebounceTimer = null;
    }
    this.currentAbort?.abort();
    this.currentAbort = null;
    this.activeProvider.cancel();
    this.scheduler.stop();
  }

  private persistPosition(lastText?: string): void {
    if (!this.persistEnabled) return;
    savePersistedState({
      ...(lastText !== undefined ? { lastText } : {}),
      providerId: this.providerId,
      voiceId: this.voiceId,
      rate: this.rate,
      pitch: this.pitch,
      volume: this.volume,
      muted: this.muted,
      chunkIndex: this.activeChunkIndex,
      charOffset: this.charOffset,
    });
  }

  dispose(): void {
    this.disposed = true;
    this.cancelCurrentSpeech(true);
    for (const provider of this.providers.values()) {
      provider.dispose();
    }
    this.scheduler.dispose();
  }
}

function isTtsError(err: unknown): err is TtsError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    'message' in err &&
    'recoverable' in err
  );
}
