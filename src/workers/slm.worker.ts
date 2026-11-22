/// <reference lib="webworker" />

interface TextGenPipeline {
  (
    messages: Array<{ role: 'system' | 'user'; content: string }>,
    options?: { max_new_tokens?: number; temperature?: number; do_sample?: boolean },
  ): Promise<Array<{ generated_text?: Array<{ role: string; content: string }> | string }>>;
}

let generator: TextGenPipeline | null = null;
let loadedModelId = '';

self.onmessage = async (event: MessageEvent) => {
  const { id, type, payload } = event.data as {
    id: string;
    type: 'init' | 'generate' | 'dispose';
    payload?: {
      modelId?: string;
      device?: 'webgpu' | 'wasm';
      dtype?: 'q4' | 'q4f16';
      systemPrompt?: string;
      userPrompt?: string;
      maxNewTokens?: number;
    };
  };

  try {
    if (type === 'init') {
      const modelId = payload?.modelId ?? 'onnx-community/SmolLM2-360M-Instruct-ONNX';
      const device = payload?.device ?? 'wasm';
      const dtype = payload?.dtype ?? (device === 'webgpu' ? 'q4f16' : 'q4');

      if (!generator || loadedModelId !== modelId) {
        const { pipeline } = await import('@huggingface/transformers');
        const created = await pipeline('text-generation', modelId, {
          device,
          dtype,
          progress_callback: (info: { status?: string; progress?: number; file?: string }) => {
            self.postMessage({
              id,
              type: 'progress',
              payload: {
                progress: typeof info.progress === 'number' ? Math.round(info.progress) : 0,
                status: info.status ?? 'Downloading on-device language model…',
                file: info.file,
              },
            });
          },
        });
        generator = created as unknown as TextGenPipeline;
        loadedModelId = modelId;
      }

      self.postMessage({ id, type: 'ready', payload: { modelId: loadedModelId } });
      return;
    }

    if (type === 'generate') {
      if (!generator) {
        throw new Error('On-device language model is not loaded');
      }
      const systemPrompt = payload?.systemPrompt ?? 'You are a concise, accurate reading assistant.';
      const userPrompt = payload?.userPrompt ?? '';
      const maxNewTokens = payload?.maxNewTokens ?? 220;

      const output = await generator(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        {
          max_new_tokens: maxNewTokens,
          temperature: 0.2,
          do_sample: false,
        },
      );

      const first = output[0]?.generated_text;
      let text = '';
      if (Array.isArray(first)) {
        const last = first[first.length - 1];
        text = last?.content ?? '';
      } else if (typeof first === 'string') {
        text = first;
      }

      self.postMessage({ id, type: 'result', payload: { text: text.trim() } });
      return;
    }

    if (type === 'dispose') {
      generator = null;
      loadedModelId = '';
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
