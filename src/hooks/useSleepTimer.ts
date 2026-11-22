import { useEffect, useState } from 'react';
import type { TtsEngine } from '../engine/TtsEngine';

export type SleepTimerMode = 'off' | '10' | '20' | '30' | '60' | 'end_of_text';

export function useSleepTimer(engine: TtsEngine, isPlaying: boolean) {
  const [mode, setMode] = useState<SleepTimerMode>('off');
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);

  const selectTimer = (next: SleepTimerMode) => {
    setMode(next);
    if (next === 'off' || next === 'end_of_text') {
      setRemainingSeconds(0);
    } else {
      setRemainingSeconds(Number(next) * 60);
    }
  };

  useEffect(() => {
    if (mode === 'off') return;

    if (mode === 'end_of_text') {
      const off = engine.on('complete', () => {
        setMode('off');
      });
      return off;
    }

    if (!isPlaying || remainingSeconds <= 0) return;

    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          engine.pause();
          setMode('off');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [engine, isPlaying, mode, remainingSeconds]);

  return {
    mode,
    remainingSeconds,
    selectTimer,
  };
}
