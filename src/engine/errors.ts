import type { TtsError, TtsErrorCode } from './types';

const ERROR_MESSAGES: Record<TtsErrorCode, { message: string; recoverable: boolean }> = {
  'not-allowed': {
    message: 'Your browser blocked audio. Tap Start to continue.',
    recoverable: true,
  },
  interrupted: {
    message: 'Playback was interrupted by another audio source.',
    recoverable: true,
  },
  canceled: {
    message: 'Playback was stopped.',
    recoverable: true,
  },
  network: {
    message: 'A network voice failed to connect. Check your connection or pick a local voice.',
    recoverable: true,
  },
  'synthesis-failed': {
    message: 'Could not speak this passage with the selected voice. Try another voice or Retry.',
    recoverable: true,
  },
  'voice-unavailable': {
    message: 'The selected voice is not available on this device. Switching to another voice may help.',
    recoverable: true,
  },
  'audio-busy': {
    message: 'Audio output is currently busy. Tap Retry in a moment.',
    recoverable: true,
  },
  'language-unavailable': {
    message: 'No voice for this language is installed on your device.',
    recoverable: true,
  },
  'text-too-long': {
    message: 'Passage exceeded the speech chunk limit.',
    recoverable: true,
  },
  unsupported: {
    message: 'Speech playback is not supported in this browser. Try Chrome, Edge, or Safari.',
    recoverable: false,
  },
  'provider-failed': {
    message: 'The selected voice engine encountered a problem.',
    recoverable: true,
  },
  unknown: {
    message: 'Something went wrong during speech playback. Tap Retry to continue.',
    recoverable: true,
  },
};

export function mapSpeechError(rawCode: string | undefined, detail?: string): TtsError {
  const normalized = (rawCode ?? 'unknown').toLowerCase() as TtsErrorCode;
  const entry = ERROR_MESSAGES[normalized] ?? ERROR_MESSAGES.unknown;
  const code: TtsErrorCode = normalized in ERROR_MESSAGES ? normalized : 'unknown';

  return {
    code,
    message: entry.message,
    recoverable: entry.recoverable,
    detail,
  };
}

export function isBenignCancellation(rawCode: string | undefined): boolean {
  return rawCode === 'canceled' || rawCode === 'interrupted';
}
