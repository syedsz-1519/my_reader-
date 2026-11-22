import { describe, expect, it } from 'vitest';
import { buildDocumentStructure } from '../chunker';
import { findWordIndexAtCharOffset, PositionEstimator } from '../estimator';

describe('PositionEstimator', () => {
  it('estimates character progress using chars / (rate * 14) when boundary events do not fire', () => {
    const est = new PositionEstimator();
    est.start(1.0, 0, 1000);
    // 2 seconds at 1.0x => ~28 chars
    expect(est.getEstimatedCharOffset(200, 3000)).toBe(28);
    // 2 seconds at 2.0x => ~56 chars
    est.start(2.0, 0, 1000);
    expect(est.getEstimatedCharOffset(200, 3000)).toBe(56);
    expect(est.hasSeenRealBoundary()).toBe(false);
  });

  it('calibrates smoothly on real boundary events and never exceeds chunk length', () => {
    const est = new PositionEstimator();
    est.start(1.0, 0, 1000);
    const anchored = est.onRealBoundary(35, 3000);
    expect(anchored).toBe(35);
    expect(est.hasSeenRealBoundary()).toBe(true);
    expect(est.getEstimatedCharOffset(50, 10_000)).toBe(49);
  });

  it('maps character offsets to the exact word token index', () => {
    const doc = buildDocumentStructure('Alpha beta gamma delta.');
    const chunk = doc.chunks[0];
    expect(findWordIndexAtCharOffset(chunk, 0)).toBe(0);
    expect(findWordIndexAtCharOffset(chunk, 7)).toBe(1);
    expect(findWordIndexAtCharOffset(chunk, 18)).toBe(3);
  });
});
