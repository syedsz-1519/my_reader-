import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkExtractRateLimit, extractReadableArticle } from './server/extractHandler.js';
import { SsrfError } from './server/ssrfGuard.js';
import { checkSummarizeRateLimit, summarizeViaClaude } from './server/summarizeHandler.js';
import { checkTtsProxyRateLimit, proxyTtsRequest } from './server/ttsProxyHandler.js';
import {
  checkGoogleTtsRateLimit,
  synthesizeViaGoogleTts,
  type GoogleTtsRequestBody,
} from './server/googleTtsHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

const CSP_HEADER = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://huggingface.co https://*.huggingface.co https://*.hf.co https://cdn-lfs.huggingface.co https://cdn-lfs-us-1.huggingface.co https://cdn-lfs.hf.co http://localhost:* http://127.0.0.1:*",
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
].join('; ');

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

async function startServer(): Promise<void> {
  const app = express();
  app.disable('x-powered-by');

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (IS_PROD) {
      res.setHeader('Content-Security-Policy', CSP_HEADER);
    }
    next();
  });

  app.use('/api', express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.post('/api/extract', async (req: Request, res: Response) => {
    if (!checkExtractRateLimit(getClientIp(req))) {
      res.status(429).json({ error: 'Rate limit exceeded. Please wait a minute and try again.' });
      return;
    }

    const body = (req.body ?? {}) as { url?: unknown };
    const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';
    if (!rawUrl) {
      res.status(400).json({ error: 'Please provide a valid URL.' });
      return;
    }

    try {
      const article = await extractReadableArticle(rawUrl);
      res.status(200).json(article);
    } catch (err) {
      if (err instanceof SsrfError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      const message = err instanceof Error ? err.message : 'Unable to extract article.';
      res.status(502).json({ error: message });
    }
  });

  app.post('/api/tts', async (req: Request, res: Response) => {
    if (!checkTtsProxyRateLimit(getClientIp(req))) {
      res.status(429).json({ error: 'TTS proxy rate limit exceeded.' });
      return;
    }

    const body = (req.body ?? {}) as {
      model?: string;
      input?: string;
      voice?: string;
      response_format?: string;
      speed?: number;
    };

    try {
      const result = await proxyTtsRequest(body);
      if (result.error || !result.buffer) {
        res.status(result.status).json({ error: result.error ?? 'TTS proxy error' });
        return;
      }
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
      res.status(200).send(Buffer.from(result.buffer));
    } catch {
      res.status(502).json({ error: 'Could not reach upstream TTS server.' });
    }
  });

  app.post('/api/google-tts', async (req: Request, res: Response) => {
    if (!checkGoogleTtsRateLimit(getClientIp(req))) {
      res.status(429).json({ error: 'Google TTS rate limit exceeded.' });
      return;
    }

    const body = (req.body ?? {}) as GoogleTtsRequestBody;
    try {
      const result = await synthesizeViaGoogleTts(body);
      if (result.error || !result.audioContent) {
        res.status(result.status).json({ error: result.error ?? 'TTS provider error' });
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
      res.status(200).json({ audioContent: result.audioContent });
    } catch {
      res.status(502).json({ error: 'TTS provider error' });
    }
  });

  app.post('/api/summarize', async (req: Request, res: Response) => {
    if (!checkSummarizeRateLimit(getClientIp(req))) {
      res.status(429).json({ error: 'Summarize rate limit exceeded.' });
      return;
    }

    const body = (req.body ?? {}) as { text?: string; consentGranted?: boolean };
    try {
      const result = await summarizeViaClaude(body);
      if (result.error) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.status(200).json({ summary: result.summary ?? '' });
    } catch {
      res.status(502).json({ error: 'Failed to reach summary service.' });
    }
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir, { index: false }));
    app.use((_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.warn(`TTS Reader server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
