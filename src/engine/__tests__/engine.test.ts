import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TtsEngine } from '../TtsEngine';
import type { TextChunk, TtsProvider, TtsSpeakOptions, TtsVoice } from '../types';

function createMockSpeechProvider(options: { failWith?: string; voices?: TtsVoice[] } = {}) {
  let activeResolve: (() => void) | null = null;
  let activeReject: ((err: unknown) => void) | null = null;
  const spokenChunks: Array<{ chunk: TextChunk; opts: TtsSpeakOptions }> = [];
  const cancelMock = vi.fn(() => {
    activeResolve?.();
    activeResolve = null;
  });

  const provider: TtsProvider = {
    id: 'webspeech',
    name: 'Mock WebSpeech',
    kind: 'native',
    capabilities: { wordBoundary: true, exportAudio: false, offline: true },
    init: vi.fn(async () => {}),
    getVoices: vi.fn(async (): Promise<TtsVoice[]> =>
      options.voices ?? [
        {
          id: 'v1',
          name: 'English Local',
          lang: 'en-US',
          localService: true,
          providerId: 'webspeech' as const,
          isDefault: true,
        },
      ],
    ),
    speak: vi.fn((chunk: TextChunk, opts: TtsSpeakOptions, signal: AbortSignal) => {
      spokenChunks.push({ chunk, opts });
      return new Promise<void>((resolve, reject) => {
        activeResolve = resolve;
        activeReject = reject;
        opts.onStart?.();
        if (options.failWith) {
          queueMicrotask(() => {
            reject({ code: options.failWith, message: 'Blocked', recoverable: true });
          });
          return;
        }
        signal.addEventListener('abort', () => resolve(), { once: true });
      });
    }),
    pause: vi.fn(),
    resume: vi.fn(),
    cancel: cancelMock,
    dispose: vi.fn(),
  };

  return {
    provider,
    spokenChunks,
    cancelMock,
    finishCurrent: () => {
      const r = activeResolve;
      activeResolve = null;
      r?.();
    },
    rejectCurrent: (err: unknown) => {
      const rj = activeReject;
      activeReject = null;
      rj?.(err);
    },
  };
}

describe('TtsEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('transitions through idle -> loading -> speaking -> paused -> speaking -> idle', async () => {
    const mock = createMockSpeechProvider();
    const engine = new TtsEngine({ defaultProvider: mock.provider, persist: false });
    await vi.runAllTimersAsync();

    engine.setText('First sentence is short. Second sentence follows here.');
    expect(engine.getSnapshot().state).toBe('idle');

    const playPromise = engine.play(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(engine.getSnapshot().state).toBe('speaking');

    engine.pause();
    expect(engine.getSnapshot().state).toBe('paused');

    engine.resume();
    expect(engine.getSnapshot().state).toBe('speaking');

    mock.finishCurrent();
    await vi.runAllTimersAsync();
    await playPromise;
    expect(engine.getSnapshot().state).toBe('idle');
    engine.dispose();
  });

  it('debounces mid-speech rate changes (250ms) and restarts from the current chunk', async () => {
    const mock = createMockSpeechProvider();
    const engine = new TtsEngine({ defaultProvider: mock.provider, persist: false });
    await vi.runAllTimersAsync();

    const p1 = 'First paragraph has enough words to comfortably form chunk zero on its own without combining further.';
    const p2 = 'Second paragraph forms chunk one so seeking to it proves restart stays at chunk one.';
    engine.setText(`${p1}\n\n${p2}`);

    await engine.play(1);
    await Promise.resolve();
    expect(engine.getSnapshot().activeChunkIndex).toBe(1);

    engine.updateSettings({ rate: 1.4 });
    engine.updateSettings({ rate: 1.6 });
    expect(mock.spokenChunks).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(260);
    expect(mock.spokenChunks).toHaveLength(2);
    expect(mock.spokenChunks[1].chunk.index).toBe(1);
    expect(mock.spokenChunks[1].opts.rate).toBe(1.6);
    engine.dispose();
  });

  it('sets autoplayBlocked on not-allowed errors and recovers on retry', async () => {
    const mock = createMockSpeechProvider({ failWith: 'not-allowed' });
    const engine = new TtsEngine({ defaultProvider: mock.provider, persist: false });
    await vi.runAllTimersAsync();

    engine.setText('Tap to start test.');
    await engine.play(0);
    await Promise.resolve();
    await Promise.resolve();

    expect(engine.getSnapshot().autoplayBlocked).toBe(true);
    expect(engine.getSnapshot().state).toBe('paused');
    expect(engine.getSnapshot().error?.code).toBe('not-allowed');
    engine.dispose();
  });

  it('falls back to WebSpeechProvider when a non-native provider fails during init', async () => {
    const mockWeb = createMockSpeechProvider();
    const failingKokoro: TtsProvider = {
      id: 'kokoro',
      name: 'Kokoro',
      kind: 'wasm',
      capabilities: { wordBoundary: false, exportAudio: true, offline: true },
      init: vi.fn(async () => {
        throw new Error('WASM load failed');
      }),
      getVoices: vi.fn(async () => []),
      cancel: vi.fn(),
      dispose: vi.fn(),
    };

    const engine = new TtsEngine({ defaultProvider: mockWeb.provider, persist: false });
    engine.registerProvider(failingKokoro);
    const fallbacks: Array<{ from: string; to: string }> = [];
    engine.on('fallback', (f) => fallbacks.push(f));

    await engine.switchProvider('kokoro');
    expect(fallbacks.length).toBeGreaterThan(0);
    expect(engine.getSnapshot().providerId).toBe('webspeech');
    engine.dispose();
  });
});
