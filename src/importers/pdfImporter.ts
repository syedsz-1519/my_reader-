export interface PdfImportResult {
  text: string;
  pageCount: number;
  isLikelyScanned: boolean;
  charsPerPage: number;
}

/**
 * Cleans raw extracted PDF page strings:
 * - Removes repeating headers and footers appearing on >= 40% of pages
 * - Removes standalone page numbers
 * - Joins hyphenated line breaks ("architec-\nture" -> "architecture")
 * - Preserves paragraph boundaries
 */
export function cleanExtractedPdfPages(pages: string[]): string {
  if (pages.length === 0) return '';

  const firstLines = new Map<string, number>();
  const lastLines = new Map<string, number>();

  const pageLineLists = pages.map((page) =>
    page
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean),
  );

  for (const lines of pageLineLists) {
    if (lines.length === 0) continue;
    const first = lines[0];
    const last = lines[lines.length - 1];
    if (first.length < 90) firstLines.set(first, (firstLines.get(first) ?? 0) + 1);
    if (last.length < 90) lastLines.set(last, (lastLines.get(last) ?? 0) + 1);
  }

  const repeatThreshold = Math.max(2, Math.ceil(pages.length * 0.4));

  const cleanedPages = pageLineLists.map((lines) => {
    const kept = lines.filter((line, idx) => {
      if (/^(?:page\s*)?\d{1,4}(?:\s*\/\s*\d{1,4})?$/i.test(line)) return false;
      if (idx === 0 && (firstLines.get(line) ?? 0) >= repeatThreshold) return false;
      if (idx === lines.length - 1 && (lastLines.get(line) ?? 0) >= repeatThreshold) return false;
      return true;
    });

    // Join lines cleanly while respecting hyphenation and sentence-ending paragraphs
    const outLines: string[] = [];
    for (const line of kept) {
      if (outLines.length === 0) {
        outLines.push(line);
        continue;
      }
      const prev = outLines[outLines.length - 1];
      if (/[a-zA-Z]-$/.test(prev) && /^[a-zA-Z]/.test(line)) {
        outLines[outLines.length - 1] = prev.slice(0, -1) + line;
      } else if (/[.!?:"”)]$/.test(prev) && /^[A-Z0-9"“]/.test(line) && prev.length < 75) {
        outLines.push('\n' + line);
      } else {
        outLines[outLines.length - 1] = `${prev} ${line}`;
      }
    }

    return outLines.join('\n');
  });

  return cleanedPages
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function importPdfFile(
  file: File,
  onProgress?: (pct: number, status: string) => void,
): Promise<PdfImportResult> {
  onProgress?.(5, 'Loading PDF engine…');
  const pdfjs = await import('pdfjs-dist');
  const workerModule = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const pageCount = doc.numPages;
  const pages: string[] = [];

  for (let p = 1; p <= pageCount; p++) {
    onProgress?.(Math.round((p / pageCount) * 90), `Reading page ${p} of ${pageCount}…`);
    const page = await doc.getPage(p);
    const content = await page.getTextContent();

    // Group items by Y coordinate to preserve line breaks accurately
    const lines: string[] = [];
    let currentLine = '';
    let lastY: number | null = null;

    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = Array.isArray(item.transform) ? Math.round(item.transform[5]) : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) {
        if (currentLine.trim()) lines.push(currentLine.trim());
        currentLine = item.str;
      } else {
        currentLine += (currentLine && !currentLine.endsWith(' ') && !item.str.startsWith(' ') ? ' ' : '') + item.str;
      }
      if (y !== null) lastY = y;
    }
    if (currentLine.trim()) lines.push(currentLine.trim());
    pages.push(lines.join('\n'));
  }

  const cleaned = cleanExtractedPdfPages(pages);
  const charsPerPage = pageCount > 0 ? Math.round(cleaned.length / pageCount) : 0;
  const isLikelyScanned = pageCount > 0 && charsPerPage < 25;

  onProgress?.(100, 'PDF extracted');
  return {
    text: cleaned,
    pageCount,
    isLikelyScanned,
    charsPerPage,
  };
}
