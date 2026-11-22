const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const MAX_SUMMARY_CHARS = 10_000;
const rateMap = new Map<string, number[]>();

export function checkSummarizeRateLimit(ip: string, now = Date.now()): boolean {
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

export async function summarizeViaClaude(body: {
  text?: string;
  consentGranted?: boolean;
}): Promise<{ status: number; summary?: string; error?: string }> {
  if (!body.consentGranted) {
    return { status: 400, error: 'Explicit user consent is required before sending text.' };
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      status: 501,
      error: 'Cloud AI summary is disabled (ANTHROPIC_API_KEY not configured).',
    };
  }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return { status: 400, error: 'Missing text to summarize.' };
  }
  if (text.length > MAX_SUMMARY_CHARS) {
    return { status: 400, error: `Text exceeds ${MAX_SUMMARY_CHARS}-character limit.` };
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: AbortSignal.timeout(15_000),
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-latest',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `Summarize the following text in 3-5 concise sentences for a listener before audio playback:\n\n${text}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    return { status: res.status, error: `Claude API returned HTTP ${res.status}` };
  }
  const data = (await res.json()) as { content?: Array<{ text?: string }> };
  return { status: 200, summary: data.content?.[0]?.text ?? '' };
}
