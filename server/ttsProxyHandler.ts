const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const MAX_TTS_CHARS = 4000;
const rateMap = new Map<string, number[]>();

export function checkTtsProxyRateLimit(ip: string, now = Date.now()): boolean {
  const key = ip || 'unknown';
  const prev = rateMap.get(key) ?? [];
  const fresh = prev.filter((ts) => now - ts < RATE_WINDOW_MS);
  if (fresh.length >= RATE_LIMIT_MAX) {
    rateMap.set(key, fresh);
    return false;
  }
  fresh.push(now);
  rateMap.set(key, fresh);
  return true;
}

export async function proxyTtsRequest(body: {
  model?: string;
  input?: string;
  voice?: string;
  response_format?: string;
  speed?: number;
}): Promise<{ status: number; contentType: string; buffer?: ArrayBuffer; error?: string }> {
  const baseUrl = process.env.TTS_BASE_URL;
  if (!baseUrl) {
    return {
      status: 501,
      contentType: 'application/json',
      error: 'TTS_BASE_URL is not configured on the server.',
    };
  }

  const input = typeof body.input === 'string' ? body.input.trim() : '';
  if (!input) {
    return { status: 400, contentType: 'application/json', error: 'Missing input text.' };
  }
  if (input.length > MAX_TTS_CHARS) {
    return {
      status: 400,
      contentType: 'application/json',
      error: `Input exceeds maximum ${MAX_TTS_CHARS} characters per request.`,
    };
  }

  const target = `${baseUrl.replace(/\/+$/, '')}/v1/audio/speech`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.TTS_API_KEY) {
    headers.Authorization = `Bearer ${process.env.TTS_API_KEY}`;
  }

  // Note: intentionally never log body.input to protect user text privacy
  const upstream = await fetch(target, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      model: body.model || 'kokoro',
      input,
      voice: body.voice || 'af_heart',
      response_format: body.response_format || 'wav',
      speed: typeof body.speed === 'number' ? Math.min(3.0, Math.max(0.5, body.speed)) : 1.0,
    }),
  });

  if (!upstream.ok) {
    return {
      status: upstream.status,
      contentType: 'application/json',
      error: `Upstream TTS server returned HTTP ${upstream.status}`,
    };
  }

  const buffer = await upstream.arrayBuffer();
  return {
    status: 200,
    contentType: upstream.headers.get('content-type') || 'audio/wav',
    buffer,
  };
}
