import { describe, expect, it } from 'vitest';
import { buildCueSheet, encodeAudioChunksToWav } from '../wavExporter';

describe('WAV Exporter', () => {
  it('produces a valid RIFF WAVE 16-bit mono header with 120ms silence between chunks', async () => {
    const pcm1 = new Float32Array(2400).fill(0.25); // 100ms at 24kHz
    const pcm2 = new Float32Array(2400).fill(-0.25); // 100ms at 24kHz

    const res = encodeAudioChunksToWav(
      [
        { text: 'First sentence.', chunks: [{ pcm: pcm1, sampleRate: 24000, text: 'First sentence.', durationSec: 0.1 }] },
        { text: 'Second sentence.', chunks: [{ pcm: pcm2, sampleRate: 24000, text: 'Second sentence.', durationSec: 0.1 }] },
      ],
      120,
    );

    const bytes = new Uint8Array(await res.wavBlob.arrayBuffer());
    const header = String.fromCharCode(...bytes.slice(0, 4));
    const wave = String.fromCharCode(...bytes.slice(8, 12));
    expect(header).toBe('RIFF');
    expect(wave).toBe('WAVE');

    // 100ms + 120ms silence + 100ms = 320ms at 24kHz = 7680 samples * 2 bytes + 44 header
    expect(bytes.length).toBe(44 + 7680 * 2);
    expect(res.markers).toHaveLength(2);
    expect(res.markers[0].startSec).toBe(0);
    expect(res.markers[1].startSec).toBeCloseTo(0.22, 2);

    const cue = buildCueSheet('Test Book', 'book.wav', res.markers);
    expect(cue).toContain('TITLE "Test Book"');
    expect(cue).toContain('TRACK 01 AUDIO');
    expect(cue).toContain('TRACK 02 AUDIO');
  });
});
