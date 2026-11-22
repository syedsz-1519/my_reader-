import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { assertSafePublicUrl, SsrfError } from './ssrfGuard.js';

const MAX_REDIRECTS = 3;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const FETCH_TIMEOUT_MS = 8000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;

const rateMap = new Map<string, number[]>();

export function checkExtractRateLimit(ip: string, now = Date.now()): boolean {
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

export async function extractReadableArticle(rawUrl: string): Promise<{
  title: string;
  byline: string;
  lang: string;
  text: string;
}> {
  let currentUrl = await assertSafePublicUrl(rawUrl);
  let response: Response | null = null;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(currentUrl.toString(), {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': 'TTS-Reader-Extractor/1.0 (+https://github.com/syedsz-1519/tts-reader)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) {
        throw new Error('Redirect response missing Location header.');
      }
      if (hop === MAX_REDIRECTS) {
        throw new Error('Too many redirects (maximum 3).');
      }
      const nextRaw = new URL(location, currentUrl).toString();
      currentUrl = await assertSafePublicUrl(nextRaw);
      continue;
    }

    response = res;
    break;
  }

  if (!response) {
    throw new Error('Unable to fetch URL.');
  }
  if (!response.ok) {
    throw new Error(`Target site responded with HTTP ${response.status}.`);
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
    throw new SsrfError('URL must return an HTML page (text/html).');
  }

  const contentLengthHeader = Number(response.headers.get('content-length') || 0);
  if (contentLengthHeader > MAX_BYTES) {
    throw new Error('Page exceeds the 5 MB download limit.');
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Empty response body.');
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      totalBytes += value.byteLength;
      if (totalBytes > MAX_BYTES) {
        await reader.cancel();
        throw new Error('Page exceeds the 5 MB download limit.');
      }
      chunks.push(value);
    }
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }

  const html = new TextDecoder('utf-8', { fatal: false }).decode(merged);
  const { document } = parseHTML(html);

  const htmlLang = document.documentElement?.getAttribute('lang') || 'en';
  const readability = new Readability(document as unknown as Document);
  const article = readability.parse();

  const plainText = (article?.textContent || document.body?.textContent || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    title: sanitizePlain(article?.title || document.title || currentUrl.hostname),
    byline: sanitizePlain(article?.byline || ''),
    lang: sanitizePlain(article?.lang || htmlLang).slice(0, 16),
    text: plainText,
  };
}

function sanitizePlain(input: string): string {
  return input.replace(/<[^>]*>/g, '').trim();
}
