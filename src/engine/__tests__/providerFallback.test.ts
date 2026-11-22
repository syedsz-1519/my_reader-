import { describe, expect, it, vi } from 'vitest';
import { TtsEngine } from '../TtsEngine';
import type { TtsProvider } from '../types';

describe('Provider fallback', () => {
  it('falls back cleanly to webspeech and emits fallback event when active provider fails init', async () => {
    const failingKokoro: TtsProvider = {
      id: 'kokoro',
      name: 'Failing Kokoro',
      kind: 'wasm',
      capabilities: { wordBoundary: false, exportAudio: true, offline: true },
      init: vi.fn().mockRejectedValue(new Error('WASM load failed')),
      getVoices: vi.fn().mockResolvedValue([]),
      cancel: vi.fn(),
      dispose: vi.fn(),
    };

    const engine = new TtsEngine({ persist: false });
    engine.registerProvider(failingKokoro);

    const fallbackEvents: Array<{ from: string; to: string }> = [];
    engine.on('fallback', (info) => fallbackEvents.push({ from: info.from, to: info.to }));

    const ok = await engine.switchProvider('kokoro');
    expect(ok).toBe(false);
    expect(engine.getSnapshot().providerId).toBe('webspeech');
    expect(fallbackEvents).toHaveLength(1);
    expect(fallbackEvents[0]).toEqual({ from: 'kokoro', to: 'webspeech' });
  });
});
