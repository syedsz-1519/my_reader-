import type { AudioChunk } from './types';

export interface ScheduledPlaybackHooks {
  onStart?: () => void;
  onProgress?: (elapsedSec: number, durationSec: number) => void;
}

/**
 * Web Audio API scheduler for buffer-producing TTS providers (Kokoro, Piper, Remote).
 * Uses AudioBufferSourceNode + GainNode to provide seamless playback, instant pause/resume,
 * and live volume adjustments without popping.
 */
export class AudioScheduler {
  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private activeSource: AudioBufferSourceNode | null = null;
  private progressTimer: ReturnType<typeof setInterval> | null = null;
  private volume = 1.0;

  private ensureContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.value = this.volume;
      this.gainNode.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    if (this.gainNode && this.ctx) {
      this.gainNode.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.015);
    }
  }

  async playChunk(
    chunks: AudioChunk[],
    signal: AbortSignal,
    hooks?: ScheduledPlaybackHooks,
  ): Promise<void> {
    if (chunks.length === 0 || signal.aborted) return;

    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const totalSamples = chunks.reduce((acc, c) => acc + c.pcm.length, 0);
    if (totalSamples === 0) return;

    const sampleRate = chunks[0].sampleRate;
    const buffer = ctx.createBuffer(1, totalSamples, sampleRate);
    const channel = buffer.getChannelData(0);

    let offset = 0;
    for (const c of chunks) {
      channel.set(c.pcm, offset);
      offset += c.pcm.length;
    }

    const totalDuration = buffer.duration;

    return new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        resolve();
        return;
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      if (this.gainNode) {
        source.connect(this.gainNode);
      } else {
        source.connect(ctx.destination);
      }

      this.activeSource = source;
      let settled = false;
      const startedAtCtxTime = ctx.currentTime + 0.01;

      const cleanup = () => {
        if (this.progressTimer !== null) {
          clearInterval(this.progressTimer);
          this.progressTimer = null;
        }
        signal.removeEventListener('abort', onAbort);
        if (this.activeSource === source) {
          this.activeSource = null;
        }
      };

      const onAbort = () => {
        if (settled) return;
        settled = true;
        cleanup();
        try {
          source.stop();
          source.disconnect();
        } catch {
          // Source already stopped
        }
        resolve();
      };

      signal.addEventListener('abort', onAbort, { once: true });

      source.onended = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };

      try {
        source.start(startedAtCtxTime);
        hooks?.onStart?.();
        this.progressTimer = setInterval(() => {
          if (settled || signal.aborted) return;
          if (ctx.state === 'running') {
            const elapsed = Math.max(0, ctx.currentTime - startedAtCtxTime);
            hooks?.onProgress?.(Math.min(elapsed, totalDuration), totalDuration);
          }
        }, 50);
      } catch (err) {
        settled = true;
        cleanup();
        reject(err);
      }
    });
  }

  async pause(): Promise<void> {
    if (this.ctx && this.ctx.state === 'running') {
      await this.ctx.suspend();
    }
  }

  async resume(): Promise<void> {
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  stop(): void {
    if (this.progressTimer !== null) {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
    if (this.activeSource) {
      try {
        this.activeSource.stop();
        this.activeSource.disconnect();
      } catch {
        // Ignore already stopped source
      }
      this.activeSource = null;
    }
  }

  dispose(): void {
    this.stop();
    if (this.ctx && this.ctx.state !== 'closed') {
      void this.ctx.close().catch(() => {});
    }
    this.ctx = null;
    this.gainNode = null;
  }
}
