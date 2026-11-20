import type { ProviderId } from './types';

export const STORAGE_KEY = 'tts_v1';

export type ThemeMode = 'light' | 'dark' | 'sepia' | 'system';
export type ReaderFont = 'literata' | 'inter' | 'opendyslexic';

export interface PronunciationRule {
  id: string;
  pattern: string;
  replacement: string;
  caseSensitive?: boolean;
  wholeWord?: boolean;
}

export interface TextFilterSettings {
  skipUrls: boolean;
  skipEmojis: boolean;
  skipMarkdown: boolean;
  normalizeNumbers: boolean;
  expandAbbreviations: boolean;
}

export interface PersistedReaderState {
  version: 1;
  lastText: string;
  activeDocumentId: string | null;
  providerId: ProviderId;
  voiceId: string;
  perLanguageVoices: Record<string, string>;
  rate: number;
  pitch: number;
  volume: number;
  muted: boolean;
  chunkIndex: number;
  charOffset: number;
  theme: ThemeMode;
  readerFont: ReaderFont;
  readSize: number;
  readMeasure: number;
  followAlong: boolean;
  focusMode: boolean;
  readingRuler: boolean;
  pronunciationRules: PronunciationRule[];
  filters: TextFilterSettings;
  tourCompleted: boolean;
  remoteBaseUrl: string;
  remoteModel: string;
  remoteVoice: string;
  remoteFormat: 'mp3' | 'wav' | 'opus' | 'flac';
  remoteRememberKey: boolean;
  remoteApiKey: string;
}

export const DEFAULT_SAMPLE_TEXT = `Welcome to your calm reading space. Everything runs in your browser, so no text leaves your device unless you choose an external voice server or web importer.

Deep learning is a subset of machine learning that uses neural networks with many layers. For example, Dr. Hinton's work helped show how layered representations capture patterns from pixels to prose.

Click any sentence to jump straight there, adjust your reading speed from 0.5x to 3.0x, or switch between Light, Dark, and Sepia themes at any time.`;

export const DEFAULT_PERSISTED_STATE: PersistedReaderState = {
  version: 1,
  lastText: DEFAULT_SAMPLE_TEXT,
  activeDocumentId: null,
  providerId: 'webspeech',
  voiceId: '',
  perLanguageVoices: {},
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
  muted: false,
  chunkIndex: 0,
  charOffset: 0,
  theme: 'system',
  readerFont: 'literata',
  readSize: 20,
  readMeasure: 68,
  followAlong: true,
  focusMode: false,
  readingRuler: false,
  pronunciationRules: [],
  filters: {
    skipUrls: true,
    skipEmojis: false,
    skipMarkdown: true,
    normalizeNumbers: false,
    expandAbbreviations: false,
  },
  tourCompleted: false,
  remoteBaseUrl: 'http://localhost:8880',
  remoteModel: 'kokoro',
  remoteVoice: 'af_heart',
  remoteFormat: 'wav',
  remoteRememberKey: false,
  remoteApiKey: '',
};

export function loadPersistedState(): PersistedReaderState {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { ...DEFAULT_PERSISTED_STATE };
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PERSISTED_STATE };

    const parsed = JSON.parse(raw) as Partial<PersistedReaderState> | null;
    if (!parsed || parsed.version !== 1) {
      return { ...DEFAULT_PERSISTED_STATE };
    }

    return {
      ...DEFAULT_PERSISTED_STATE,
      ...parsed,
      rate: clampNumber(parsed.rate, 0.5, 3.0, 1.0),
      pitch: clampNumber(parsed.pitch, 0.5, 2.0, 1.0),
      volume: clampNumber(parsed.volume, 0, 1, 1.0),
      readSize: clampNumber(parsed.readSize, 16, 32, 20),
      readMeasure: clampNumber(parsed.readMeasure, 62, 72, 68),
      chunkIndex: Math.max(0, Math.floor(Number(parsed.chunkIndex) || 0)),
      charOffset: Math.max(0, Math.floor(Number(parsed.charOffset) || 0)),
      perLanguageVoices:
        parsed.perLanguageVoices && typeof parsed.perLanguageVoices === 'object'
          ? parsed.perLanguageVoices
          : {},
      pronunciationRules: Array.isArray(parsed.pronunciationRules) ? parsed.pronunciationRules : [],
      filters: {
        ...DEFAULT_PERSISTED_STATE.filters,
        ...(parsed.filters ?? {}),
      },
      // Never retain remote API key unless user opted into remembering it
      remoteApiKey: parsed.remoteRememberKey && typeof parsed.remoteApiKey === 'string'
        ? parsed.remoteApiKey
        : '',
    };
  } catch {
    return { ...DEFAULT_PERSISTED_STATE };
  }
}

export function savePersistedState(partial: Partial<PersistedReaderState>): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const current = loadPersistedState();
    const next: PersistedReaderState = {
      ...current,
      ...partial,
      version: 1,
    };
    if (!next.remoteRememberKey) {
      next.remoteApiKey = '';
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota / private browsing errors cleanly
  }
}

function clampNumber(val: unknown, min: number, max: number, fallback: number): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
