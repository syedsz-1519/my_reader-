/// <reference lib="webworker" />

self.onmessage = async (event: MessageEvent) => {
  const { id, type, payload } = event.data as {
    id: string;
    type: 'voices' | 'download' | 'predict';
    payload?: { voiceId?: string; text?: string };
  };

  try {
    const piper = await import('@mintplex-labs/piper-tts-web');

    if (type === 'voices') {
      const all = await piper.voices();
      self.postMessage({ id, type: 'voices', payload: { voices: all } });
      return;
    }

    if (type === 'download') {
      const voiceId = payload?.voiceId ?? 'en_US-hfc_female-medium';
      await piper.download(voiceId, (prog) => {
        const pct = prog.total > 0 ? Math.round((prog.loaded / prog.total) * 100) : 0;
        self.postMessage({
          id,
          type: 'progress',
          payload: { progress: pct, status: `Downloading ${voiceId}…`, file: prog.url },
        });
      });
      self.postMessage({ id, type: 'downloaded', payload: { voiceId } });
      return;
    }

    if (type === 'predict') {
      const voiceId = payload?.voiceId ?? 'en_US-hfc_female-medium';
      const text = payload?.text ?? '';
      const wavBlob = await piper.predict({ text, voiceId }, (prog) => {
        const pct = prog.total > 0 ? Math.round((prog.loaded / prog.total) * 100) : 0;
        self.postMessage({
          id,
          type: 'progress',
          payload: { progress: pct, status: 'Synthesizing Piper speech…' },
        });
      });
      const arrayBuf = await wavBlob.arrayBuffer();
      self.postMessage({ id, type: 'wav', payload: { arrayBuf } }, [arrayBuf]);
    }
  } catch (err) {
    self.postMessage({
      id,
      type: 'error',
      payload: { message: err instanceof Error ? err.message : String(err) },
    });
  }
};
