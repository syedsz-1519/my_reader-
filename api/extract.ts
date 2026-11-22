import type { IncomingMessage, ServerResponse } from 'node:http';
import { checkExtractRateLimit, extractReadableArticle } from '../server/extractHandler.js';
import { SsrfError } from '../server/ssrfGuard.js';

interface VercelRequest extends IncomingMessage {
  body?: unknown;
}

interface VercelResponse extends ServerResponse {
  status(code: number): VercelResponse;
  json(data: unknown): void;
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

  if (!checkExtractRateLimit(ip)) {
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
}
