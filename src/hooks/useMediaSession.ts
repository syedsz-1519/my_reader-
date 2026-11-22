import { useEffect } from 'react';
import type { TtsEngine } from '../engine/TtsEngine';
import type { TtsState } from '../engine/types';

export function useMediaSession(
  engine: TtsEngine,
  title: string,
  state: TtsState,
  activeSentence: number,
  totalSentences: number,
): void {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    const ms = navigator.mediaSession;
    if (typeof MediaMetadata !== 'undefined') {
      ms.metadata = new MediaMetadata({
        title: title || 'TTS Reader',
        artist: totalSentences > 0 ? `Sentence ${activeSentence + 1} of ${totalSentences}` : 'Local Reader',
        album: 'TTS Reader',
        artwork: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      });
    }

    ms.playbackState = state === 'speaking' ? 'playing' : state === 'paused' ? 'paused' : 'none';
  }, [title, state, activeSentence, totalSentences]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;

    const safeSet = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        // Unsupported MediaSession action on this platform
      }
    };

    safeSet('play', () => engine.resume());
    safeSet('pause', () => engine.pause());
    safeSet('stop', () => engine.stop());
    safeSet('previoustrack', () => engine.prevSentence());
    safeSet('nexttrack', () => engine.nextSentence());
    safeSet('seekbackward', () => engine.skipBySeconds(-10));
    safeSet('seekforward', () => engine.skipBySeconds(10));

    return () => {
      safeSet('play', null);
      safeSet('pause', null);
      safeSet('stop', null);
      safeSet('previoustrack', null);
      safeSet('nexttrack', null);
      safeSet('seekbackward', null);
      safeSet('seekforward', null);
    };
  }, [engine]);
}
