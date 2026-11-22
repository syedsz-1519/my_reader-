import type { LibraryChapter } from '../db/libraryDb';

export interface EpubImportResult {
  title: string;
  author: string;
  chapters: LibraryChapter[];
}

export async function importEpubFile(
  file: File,
  onProgress?: (pct: number, status: string) => void,
): Promise<EpubImportResult> {
  onProgress?.(10, 'Loading EPUB reader…');
  const epubMod = await import('epubjs');
  const ePub = epubMod.default;

  const buffer = await file.arrayBuffer();
  const book = ePub(buffer);
  await book.ready;

  const metadata = await book.loaded.metadata;
  const navigation = await book.loaded.navigation;
  const spineItems = (book.spine as unknown as { spineItems?: Array<{ href: string; idref: string; load: (req: unknown) => Promise<Document> }> }).spineItems ?? [];

  const tocTitles = new Map<string, string>();
  for (const item of navigation.toc ?? []) {
    if (item.href) {
      tocTitles.set(item.href.split('#')[0], item.label.trim());
    }
  }

  const chapters: LibraryChapter[] = [];
  const total = spineItems.length || 1;

  for (let i = 0; i < spineItems.length; i++) {
    const spineItem = spineItems[i];
    onProgress?.(Math.round(((i + 1) / total) * 90), `Extracting chapter ${i + 1} of ${total}…`);
    try {
      const doc = await spineItem.load(book.load.bind(book));
      const bodyText = (doc?.body?.textContent ?? '').replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      if (bodyText.length < 15) continue;

      const hrefKey = spineItem.href.split('#')[0];
      const title = tocTitles.get(hrefKey) || `Chapter ${chapters.length + 1}`;
      chapters.push({
        id: spineItem.idref || `ch-${i + 1}`,
        title,
        text: bodyText,
      });
    } catch {
      // Skip unreadable spine sections cleanly
    }
  }

  onProgress?.(100, 'EPUB extracted');
  book.destroy();

  return {
    title: metadata.title || file.name.replace(/\.epub$/i, ''),
    author: metadata.creator || '',
    chapters,
  };
}
