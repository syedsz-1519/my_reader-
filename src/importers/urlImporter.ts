export interface ExtractedArticle {
  title: string;
  byline: string;
  lang: string;
  text: string;
}

export async function extractArticleFromUrl(url: string): Promise<ExtractedArticle> {
  const res = await fetch('/api/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: url.trim() }),
  });

  const data = (await res.json().catch(() => ({}))) as Partial<ExtractedArticle> & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Could not extract article (HTTP ${res.status})`);
  }

  if (!data.text || !data.text.trim()) {
    throw new Error('No readable article text was found on that page. Try pasting the text instead.');
  }

  return {
    title: data.title || 'Web Article',
    byline: data.byline || '',
    lang: data.lang || 'en',
    text: data.text.trim(),
  };
}

/**
 * Generates a one-click bookmarklet href that passes selected text or article text
 * via URL #text= fragment directly into the local reader without server egress.
 */
export function buildReaderBookmarkletHref(appOrigin: string): string {
  const code = `javascript:(()=>{const s=String(window.getSelection()).trim()||document.body.innerText.slice(0,50000);const u='${appOrigin}/#text='+encodeURIComponent(s)+'&title='+encodeURIComponent(document.title);window.open(u,'_blank');})();`;
  return code;
}

export function readFragmentSharePayload(): { text?: string; title?: string } | null {
  if (typeof window === 'undefined') return null;

  // Check Web Share Target query params (?title=&text=&url=)
  const params = new URLSearchParams(window.location.search);
  const sharedText = params.get('text');
  const sharedTitle = params.get('title');
  const sharedUrl = params.get('url');
  if (sharedText || sharedUrl) {
    return {
      title: sharedTitle ?? undefined,
      text: [sharedText, sharedUrl].filter(Boolean).join('\n\n'),
    };
  }

  // Check bookmarklet #text=...&title=...
  const hash = window.location.hash;
  if (hash && hash.includes('text=')) {
    const hashParams = new URLSearchParams(hash.slice(1));
    const t = hashParams.get('text');
    if (t && t.trim()) {
      return {
        text: t,
        title: hashParams.get('title') ?? undefined,
      };
    }
  }

  return null;
}
