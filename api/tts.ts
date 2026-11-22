import type { IncomingMessage, ServerResponse } from 'node:http';
import { checkTtsProxyRateLimit, proxyTtsRequest } from '../server/ttsProxyHandler.js';

interface VercelRequest extends IncomingMessage {
  body?: unknown;
}

interface VercelResponse extends ServerResponse {
  status(code: number): VercelResponse;
  json(data: unknown): void;
  send(body: Buffer): void;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : undefined) ||
    req.socket?.remoteAddress ||
    'unknown';

  if (!checkTtsProxyRateLimit(ip)) {
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
}
