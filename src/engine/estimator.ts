import type { TextChunk } from './types';

export const BASE_CHARS_PER_SECOND = 14;

/**
 * Estimates character and word position within an active chunk based on elapsed
 * speaking duration (chars / (rate * 14 chars/sec)), recalibrating whenever
 * a real browser onboundary word event arrives.
 */
export class PositionEstimator {
  private startTimeMs = 0;
  private rate = 1.0;
  private anchorCharOffset = 0;
  private anchorTimeMs = 0;
  private estimatedRateScale = 1.0;
  private lastReportedChar = 0;
  private seenRealBoundary = false;

  start(rate: number, initialCharOffset = 0, nowMs = Date.now()): void {
    this.rate = Math.max(0.25, rate);
    this.startTimeMs = nowMs;
    this.anchorTimeMs = nowMs;
    this.anchorCharOffset = Math.max(0, initialCharOffset);
    this.lastReportedChar = this.anchorCharOffset;
    this.estimatedRateScale = 1.0;
    this.seenRealBoundary = false;
  }

  onRealBoundary(charIndex: number, nowMs = Date.now()): number {
    const clamped = Math.max(0, charIndex);
    const elapsedSec = Math.max(0.05, (nowMs - this.startTimeMs) / 1000);
    if (clamped > 4) {
      const observedCps = clamped / elapsedSec;
      const expectedCps = this.rate * BASE_CHARS_PER_SECOND;
      const ratio = observedCps / expectedCps;
      // Clamp adaptive calibration within sensible speaking speed variance
      this.estimatedRateScale = Math.min(1.6, Math.max(0.6, ratio));
    }
    this.anchorCharOffset = clamped;
    this.anchorTimeMs = nowMs;
    this.lastReportedChar = clamped;
    this.seenRealBoundary = true;
    return clamped;
  }

  getEstimatedCharOffset(chunkTextLength: number, nowMs = Date.now()): number {
    if (chunkTextLength <= 0) return 0;
    const elapsedSec = Math.max(0, (nowMs - this.anchorTimeMs) / 1000);
    const cps = this.rate * BASE_CHARS_PER_SECOND * this.estimatedRateScale;
    const raw = Math.floor(this.anchorCharOffset + elapsedSec * cps);
    const clamped = Math.min(Math.max(0, raw), Math.max(0, chunkTextLength - 1));
    // Never move backwards during estimation
    this.lastReportedChar = Math.max(this.lastReportedChar, clamped);
    return Math.min(this.lastReportedChar, Math.max(0, chunkTextLength - 1));
  }

  hasSeenRealBoundary(): boolean {
    return this.seenRealBoundary;
  }
}

export function findWordIndexAtCharOffset(chunk: TextChunk, charOffset: number): number {
  if (chunk.words.length === 0) return 0;
  for (let i = 0; i < chunk.words.length; i++) {
    const w = chunk.words[i];
    if (charOffset >= w.start && charOffset <= w.end) {
      return i;
    }
    if (charOffset < w.start) {
      return Math.max(0, i - 1);
    }
  }
  return chunk.words.length - 1;
}
