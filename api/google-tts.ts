import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  checkGoogleTtsRateLimit,
  synthesizeViaGoogleTts,
  type GoogleTtsRequestBody,
} from '../server/googleTtsHandler.js';

interface VercelRequest extends IncomingMessage {
  body?: unknown;
}

interface VercelResponse extends ServerResponse {
  status(code: number): VercelResponse;
  json(data: unknown): void;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }

  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : undefined) ||
    req.socket?.remoteAddress ||
    'unknown';

  if (!checkGoogleTtsRateLimit(ip)) {
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
}
