import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  decodeBase64ToUint8Array,
  GoogleCloudTtsProvider,
  inferGoogleLanguageCode,
  mapPitchToGoogleSemitones,
  mapRateToGoogleSpeakingRate,
  splitTextForGoogleTts,
} from '../../providers/googleTtsProvider';
import { synthesizeViaGoogleTts } from '../../../server/googleTtsHandler';

describe('GoogleCloudTtsProvider & /api/google-tts handler', () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GOOGLE_TTS_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) {
      delete process.env.GOOGLE_TTS_KEY;
    } else {
      process.env.GOOGLE_TTS_KEY = originalKey;
    }
  });

  it('requires opt-in consent before initializing or requesting synthesis', async () => {
    const provider = new GoogleCloudTtsProvider();
    await expect(provider.init()).rejects.toMatchObject({ code: 'not-allowed' });
    await expect(
      provider.requestMp3Bytes('Hello world', {
        voiceId: 'en-US-Standard-C',
        lang: 'en-US',
        rate: 1,
        pitch: 1,
      }),
    ).rejects.toMatchObject({ code: 'not-allowed' });
  });

  it('clamps speakingRate and maps pitch semitones accurately', () => {
    expect(mapRateToGoogleSpeakingRate(3.0)).toBe(2.0);
    expect(mapRateToGoogleSpeakingRate(0.1)).toBe(0.25);
    expect(mapRateToGoogleSpeakingRate(1.25)).toBe(1.25);

    expect(mapPitchToGoogleSemitones(1.0)).toBe(0);
    expect(mapPitchToGoogleSemitones(0.5)).toBe(-5);
    expect(mapPitchToGoogleSemitones(2.0)).toBe(10);

    expect(inferGoogleLanguageCode('hi-IN-Neural2-B')).toBe('hi-IN');
    expect(inferGoogleLanguageCode('ur-PK-Standard-A')).toBe('ur-PK');
  });

  it('splits long documents under 3800 chars without mid-word breaks', () => {
    const longText = `${'Sentence one ends here. '.repeat(200)}End.`;
    const parts = splitTextForGoogleTts(longText, 3800);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(3800);
    }
  });

  it('decodes base64 MP3 payloads cleanly', () => {
    const sample = btoa('ID3test');
    const bytes = decodeBase64ToUint8Array(sample);
    expect(Array.from(bytes.slice(0, 3))).toEqual([73, 68, 51]);
  });

  it('validates consent, text length, and missing GOOGLE_TTS_KEY on the server handler', async () => {
    delete process.env.GOOGLE_TTS_KEY;
    const noConsent = await synthesizeViaGoogleTts({
      text: 'Hello',
      consentGranted: false,
    });
    expect(noConsent.status).toBe(400);

    const tooLong = await synthesizeViaGoogleTts({
      text: 'x'.repeat(4001),
      consentGranted: true,
    });
    expect(tooLong.status).toBe(400);

    const missingKey = await synthesizeViaGoogleTts({
      text: 'Hello',
      consentGranted: true,
    });
    expect(missingKey.status).toBe(501);
  });

  it('calls Google Cloud Text-to-Speech v1 and returns base64 audioContent when configured', async () => {
    process.env.GOOGLE_TTS_KEY = 'test-secret-key';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ audioContent: 'SUQzAAAA' }),
    }) as unknown as typeof fetch;

    const okRes = await synthesizeViaGoogleTts({
      text: 'Hello world',
      languageCode: 'en-US',
      voice: 'en-US-Standard-C',
      speakingRate: 1.5,
      pitch: 2,
      consentGranted: true,
    });

    expect(okRes.status).toBe(200);
    expect(okRes.audioContent).toBe('SUQzAAAA');
  });
});
