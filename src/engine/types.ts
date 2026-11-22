export type TtsState = 'idle' | 'loading' | 'speaking' | 'paused' | 'error';

export type ProviderId = 'webspeech' | 'kokoro' | 'piper' | 'remote' | 'google';

export type TtsErrorCode =
  | 'not-allowed'
  | 'interrupted'
  | 'canceled'
  | 'network'
  | 'synthesis-failed'
  | 'voice-unavailable'
  | 'audio-busy'
  | 'language-unavailable'
  | 'text-too-long'
  | 'unsupported'
  | 'provider-failed'
  | 'unknown';

export interface TtsError {
  code: TtsErrorCode;
  message: string;
  recoverable: boolean;
  detail?: string;
}

export interface WordToken {
  index: number;
  text: string;
  start: number; // Relative to chunk text
  end: number;   // Relative to chunk text
}

export interface TextChunk {
  index: number;
  paragraphIndex: number;
  sentenceIndex: number;
  text: string;
  startOffset: number; // Global offset in document text
  endOffset: number;   // Global offset in document text
  words: WordToken[];
}

export interface ReaderSentence {
  index: number;
  paragraphIndex: number;
  text: string;
  startOffset: number;
  endOffset: number;
  firstChunkIndex: number;
  lastChunkIndex: number;
}

export interface ReaderParagraph {
  index: number;
  text: string;
  dir: 'ltr' | 'rtl' | 'auto';
  isHeading?: boolean;
  headingLevel?: number;
  sentences: ReaderSentence[];
}

export interface DocumentStructure {
  paragraphs: ReaderParagraph[];
  sentences: ReaderSentence[];
  chunks: TextChunk[];
  totalChars: number;
  totalWords: number;
}

export interface TtsVoice {
  id: string;
  name: string;
  lang: string;
  localService: boolean;
  providerId: ProviderId;
  isDefault?: boolean;
  badge?: string;
  license?: string;
  sizeLabel?: string;
}

export interface AudioChunk {
  pcm: Float32Array;
  sampleRate: number;
  text: string;
  durationSec: number;
}

export interface TtsProviderCapabilities {
  wordBoundary: boolean;
  exportAudio: boolean;
  offline: boolean;
}

export interface TtsSpeakOptions {
  voiceId?: string;
  lang?: string;
  rate: number;
  pitch: number;
  volume: number;
  onStart?: () => void;
  onBoundary?: (charIndex: number, charLength?: number) => void;
}

export interface ProviderInitProgress {
  progress: number; // 0..100
  status: string;
  file?: string;
}

export interface TtsProvider {
  readonly id: ProviderId;
  readonly name: string;
  readonly kind: 'native' | 'wasm' | 'remote';
  readonly capabilities: TtsProviderCapabilities;
  init(onProgress?: (progress: ProviderInitProgress) => void): Promise<void>;
  getVoices(): Promise<TtsVoice[]>;
  speak?(chunk: TextChunk, opts: TtsSpeakOptions, signal: AbortSignal): Promise<void>;
  synthesize?(
    chunk: TextChunk,
    opts: TtsSpeakOptions,
    signal?: AbortSignal,
  ): AsyncIterable<AudioChunk | void>;
  preview?(voiceId: string, sampleText: string, opts: Pick<TtsSpeakOptions, 'rate' | 'pitch' | 'volume'>): Promise<void>;
  pause?(): void;
  resume?(): void;
  cancel(): void;
  dispose(): void;
}

export interface BoundaryPosition {
  chunkIndex: number;
  sentenceIndex: number;
  paragraphIndex: number;
  charOffset: number;       // Offset within chunk
  globalCharOffset: number; // Offset within full document
  wordIndex: number;        // Index within chunk words
  estimated: boolean;
}

export interface TtsEngineSnapshot {
  state: TtsState;
  providerId: ProviderId;
  activeChunkIndex: number;
  activeSentenceIndex: number;
  activeParagraphIndex: number;
  activeWordIndex: number;
  charOffset: number;
  totalChunks: number;
  totalSentences: number;
  voices: TtsVoice[];
  voicesLoading: boolean;
  autoplayBlocked: boolean;
  error: TtsError | null;
  rate: number;
  pitch: number;
  volume: number;
  muted: boolean;
  voiceId: string;
  lang: string;
}

export interface TtsEngineEvents {
  state: (snapshot: TtsEngineSnapshot) => void;
  chunk: (chunk: TextChunk) => void;
  boundary: (pos: BoundaryPosition) => void;
  voices: (voices: TtsVoice[]) => void;
  error: (error: TtsError) => void;
  fallback: (info: { from: ProviderId; to: ProviderId; reason: string }) => void;
  autoplayBlocked: (blocked: boolean) => void;
  complete: () => void;
}
