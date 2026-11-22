import { useEffect, useState } from 'react';
import { TtsEngine } from '../engine/TtsEngine';
import type { BoundaryPosition, DocumentStructure, TtsEngineSnapshot, TtsError } from '../engine/types';

let sharedEngine: TtsEngine | null = null;

export function getSharedTtsEngine(): TtsEngine {
  if (!sharedEngine) {
    sharedEngine = new TtsEngine();
  }
  return sharedEngine;
}

export interface UseTtsResult {
  engine: TtsEngine;
  snapshot: TtsEngineSnapshot;
  document: DocumentStructure;
  boundary: BoundaryPosition | null;
  lastFallback: { from: string; to: string; reason: string } | null;
  clearFallback: () => void;
}

/**
 * Thin React hook subscribing to the framework-free TtsEngine.
 * Uses a stable state-held singleton guarded against React StrictMode double-effect unmounts
 * so active speech is never aborted during dev StrictMode remount cycles.
 */
export function useTts(customEngine?: TtsEngine): UseTtsResult {
  const [engine] = useState<TtsEngine>(() => customEngine ?? getSharedTtsEngine());

  const [snapshot, setSnapshot] = useState<TtsEngineSnapshot>(() => engine.getSnapshot());
  const [document, setDocument] = useState<DocumentStructure>(() => engine.getDocument());
  const [boundary, setBoundary] = useState<BoundaryPosition | null>(null);
  const [lastFallback, setLastFallback] = useState<{ from: string; to: string; reason: string } | null>(
    null,
  );

  useEffect(() => {
    const offState = engine.on('state', (next) => {
      setSnapshot(next);
      setDocument(engine.getDocument());
    });
    const offBoundary = engine.on('boundary', (pos) => {
      setBoundary(pos);
    });
    const offFallback = engine.on('fallback', (info) => {
      setLastFallback(info);
    });
    const offError = engine.on('error', (_err: TtsError) => {
      setSnapshot(engine.getSnapshot());
    });

    return () => {
      offState();
      offBoundary();
      offFallback();
      offError();
    };
  }, [engine]);

  return {
    engine,
    snapshot,
    document,
    boundary,
    lastFallback,
    clearFallback: () => setLastFallback(null),
  };
}
