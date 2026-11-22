/// <reference lib="webworker" />

interface KokoroVoiceMeta {
  name: string;
  language: string;
  gender: string;
  traits?: string;
  targetQuality?: string;
  overallGrade?: string;
}

interface KokoroInstance {
  voices: Record<string, KokoroVoiceMeta>;
  list_voices?: () => void;
  stream: (
    text: unknown,
    options?: { voice?: string; speed?: number },
  ) => AsyncGenerator<{ text: string; phonemes: string; audio: { audio: Float32Array; sampling_rate: number } }>;
}

let ttsInstance: KokoroInstance | null = null;
let splitterClass: (new () => { push: (t: string) => void; close: () => void }) | null = null;
let loadedDevice: 'wasm' | 'webgpu' = 'wasm';
let loadedDtype: 'q8' | 'fp32' = 'q8';

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';

self.onmessage = async (event: MessageEvent) => {
  const { id, type, payload } = event.data as {
    id: string;
    type: 'init' | 'listVoices' | 'synthesize' | 'dispose';
    payload?: {
      device?: 'wasm' | 'webgpu';
      dtype?: 'q8' | 'fp32';
      text?: string;
      voice?: string;
      speed?: number;
    };
  };

  try {
    if (type === 'init') {
      const targetDevice = payload?.device ?? 'wasm';
      const targetDtype = payload?.dtype ?? (targetDevice === 'webgpu' ? 'fp32' : 'q8');

      if (!ttsInstance || targetDevice !== loadedDevice || targetDtype !== loadedDtype) {
        const mod = await import('kokoro-js');
        splitterClass = mod.TextSplitterStream as unknown as typeof splitterClass;
        const instance = await mod.KokoroTTS.from_pretrained(MODEL_ID, {
          dtype: targetDtype,
          device: targetDevice,
          progress_callback: (info: { status?: string; progress?: number; file?: string }) => {
            self.postMessage({
              id,
              type: 'progress',
              payload: {
                progress: typeof info.progress === 'number' ? Math.round(info.progress) : 0,
                status: info.status ?? 'Downloading Kokoro-82M model…',
                file: info.file,
              },
            });
          },
        });
        ttsInstance = instance as unknown as KokoroInstance;
        loadedDevice = targetDevice;
        loadedDtype = targetDtype;
      }

      const voices = extractVoices(ttsInstance);
      self.postMessage({ id, type: 'ready', payload: { voices, device: loadedDevice, dtype: loadedDtype } });
      return;
    }

    if (type === 'listVoices') {
      const voices = ttsInstance ? extractVoices(ttsInstance) : [];
      self.postMessage({ id, type: 'voices', payload: { voices } });
      return;
    }

    if (type === 'synthesize') {
      if (!ttsInstance || !splitterClass) {
        throw new Error('Kokoro model is not initialized');
      }
      const text = payload?.text ?? '';
      const voice = payload?.voice ?? 'af_heart';
      const speed = payload?.speed ?? 1.0;

      const splitter = new splitterClass();
      const stream = ttsInstance.stream(splitter, { voice, speed });
      splitter.push(text);
      splitter.close();

      for await (const chunk of stream) {
        const pcm = chunk.audio.audio;
        const sampleRate = chunk.audio.sampling_rate || 24000;
        const copy = new Float32Array(pcm);
        self.postMessage(
          {
            id,
            type: 'chunk',
            payload: {
              pcm: copy,
              sampleRate,
              text: chunk.text,
              durationSec: copy.length / sampleRate,
            },
          },
          [copy.buffer],
        );
      }

      self.postMessage({ id, type: 'done' });
      return;
    }

    if (type === 'dispose') {
      ttsInstance = null;
      self.postMessage({ id, type: 'disposed' });
    }
  } catch (err) {
    self.postMessage({
      id,
      type: 'error',
      payload: { message: err instanceof Error ? err.message : String(err) },
    });
  }
};

function extractVoices(instance: KokoroInstance) {
  return Object.entries(instance.voices ?? {}).map(([key, meta]) => ({
    id: key,
    name: `${meta.name} (${meta.gender === 'Female' ? 'F' : 'M'})`,
    lang: meta.language ?? 'en-us',
    localService: true,
    providerId: 'kokoro' as const,
    badge: `Neural · ${meta.overallGrade ?? 'A'}`,
    license: 'Apache-2.0',
  }));
}
