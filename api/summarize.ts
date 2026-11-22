import type { IncomingMessage, ServerResponse } from 'node:http';
import { checkSummarizeRateLimit, summarizeViaClaude } from '../server/summarizeHandler.js';

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

  if (!checkSummarizeRateLimit(ip)) {
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
}
