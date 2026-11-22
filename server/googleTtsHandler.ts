const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const MAX_GOOGLE_TTS_CHARS = 4000;
const rateMap = new Map<string, number[]>();

export interface GoogleTtsRequestBody {
  text?: unknown;
  languageCode?: unknown;
  voice?: unknown;
  speakingRate?: unknown;
  pitch?: unknown;
  consentGranted?: unknown;
}

export interface GoogleTtsHandlerResult {
  status: number;
  audioContent?: string;
  error?: string;
}

export function checkGoogleTtsRateLimit(ip: string, now = Date.now()): boolean {
  const key = ip || 'unknown';
  const prev = rateMap.get(key) ?? [];
  const fresh = prev.filter((ts) => now - ts < RATE_WINDOW_MS);
  if (fresh.length >= RATE_LIMIT_MAX) {
    rateMap.set(key, fresh);
    return false;
  }
  fresh.push(now);
  rateMap.set(key, fresh);
  return true;
}

export function clampGoogleSpeakingRate(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 1.0;
  return Math.min(2.0, Math.max(0.25, Number(n.toFixed(2))));
}

export function clampGooglePitch(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0.0;
  return Math.min(20.0, Math.max(-20.0, Number(n.toFixed(2))));
}

export async function synthesizeViaGoogleTts(
  body: GoogleTtsRequestBody,
): Promise<GoogleTtsHandlerResult> {
  if (body.consentGranted !== true) {
    return {
      status: 400,
      error: 'Explicit privacy consent is required before sending text to Google Cloud Text-to-Speech.',
    };
  }

  const rawText = typeof body.text === 'string' ? body.text : '';
  if (!rawText.trim() || rawText.length > MAX_GOOGLE_TTS_CHARS) {
    return {
      status: 400,
      error: `Text required, max ${MAX_GOOGLE_TTS_CHARS} chars`,
    };
  }

  const apiKey = process.env.GOOGLE_TTS_KEY?.trim();
  if (!apiKey) {
    return {
      status: 501,
      error: 'GOOGLE_TTS_KEY is not configured on the server.',
    };
  }

  const languageCode =
    typeof body.languageCode === 'string' && body.languageCode.trim()
      ? body.languageCode.trim()
      : 'en-US';
  const voiceName =
    typeof body.voice === 'string' && body.voice.trim()
      ? body.voice.trim()
      : 'en-US-Standard-C';

  const speakingRate = clampGoogleSpeakingRate(body.speakingRate);
  const pitch = clampGooglePitch(body.pitch);

  // Never log rawText to preserve user privacy
  const upstream = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        input: { text: rawText },
        voice: { languageCode, name: voiceName },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate,
          pitch,
        },
      }),
    },
  );

  if (!upstream.ok) {
    return {
      status: 502,
      error: 'TTS provider error',
    };
  }

  const data = (await upstream.json()) as { audioContent?: unknown };
  if (typeof data.audioContent !== 'string' || !data.audioContent) {
    return {
      status: 502,
      error: 'Google Cloud TTS returned empty audio content.',
    };
  }

  return {
    status: 200,
    audioContent: data.audioContent,
  };
}
