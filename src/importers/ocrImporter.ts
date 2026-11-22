export type OcrLanguage = 'eng' | 'hin' | 'urd' | 'ara';

export interface OcrOptions {
  language: OcrLanguage;
  onProgress?: (pct: number, status: string) => void;
  signal?: AbortSignal;
}

/**
 * Runs on-device OCR using lazy-loaded tesseract.js on an image file or scanned PDF pages.
 */
export async function runOcrOnImageFile(file: File, options: OcrOptions): Promise<string> {
  if (options.signal?.aborted) {
    throw new DOMException('OCR canceled', 'AbortError');
  }

  options.onProgress?.(5, 'Loading on-device OCR engine…');
  const { createWorker } = await import('tesseract.js');

  const worker = await createWorker(options.language, 1, {
    logger: (m: { status?: string; progress?: number }) => {
      if (options.signal?.aborted) return;
      if (typeof m.progress === 'number') {
        options.onProgress?.(Math.round(m.progress * 100), m.status ?? 'Recognizing text…');
      }
    },
  });

  const onAbort = () => {
    void worker.terminate();
  };
  options.signal?.addEventListener('abort', onAbort, { once: true });

  try {
    if (options.signal?.aborted) {
      throw new DOMException('OCR canceled', 'AbortError');
    }
    const result = await worker.recognize(file);
    return result.data.text.trim();
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
    await worker.terminate();
  }
}

/**
 * Renders up to maxPages of a scanned PDF onto offscreen canvases and runs on-device OCR.
 */
export async function runOcrOnPdfFile(
  file: File,
  options: OcrOptions & { maxPages?: number },
): Promise<string> {
  const maxPages = options.maxPages ?? 15;
  options.onProgress?.(5, 'Rendering PDF pages for OCR…');

  const pdfjs = await import('pdfjs-dist');
  const workerModule = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const pagesToProcess = Math.min(doc.numPages, maxPages);

  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(options.language);

  const onAbort = () => {
    void worker.terminate();
  };
  options.signal?.addEventListener('abort', onAbort, { once: true });

  const extractedPages: string[] = [];
  try {
    for (let p = 1; p <= pagesToProcess; p++) {
      if (options.signal?.aborted) {
        throw new DOMException('OCR canceled', 'AbortError');
      }
      options.onProgress?.(
        Math.round(((p - 1) / pagesToProcess) * 90) + 5,
        `OCR scanning page ${p} of ${pagesToProcess}…`,
      );
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 1.75 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      const result = await worker.recognize(canvas);
      if (result.data.text.trim()) {
        extractedPages.push(result.data.text.trim());
      }
    }

    options.onProgress?.(100, 'OCR complete');
    return extractedPages.join('\n\n');
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
    await worker.terminate();
  }
}
