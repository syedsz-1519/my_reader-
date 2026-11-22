import { describe, expect, it } from 'vitest';
import { cleanExtractedPdfPages } from '../../importers/pdfImporter';

describe('PDF page cleaner', () => {
  it('removes repeating headers, footers, standalone page numbers, and de-hyphenates line breaks', () => {
    const pages = [
      'Journal of Quiet Interfaces\n1\nModern software relies on architec-\nture that respects reading.\nCopyright 2026',
      'Journal of Quiet Interfaces\n2\nUsers prefer calm spaces.\nCopyright 2026',
      'Journal of Quiet Interfaces\n3\nSentence tracking works reliably.\nCopyright 2026',
    ];

    const cleaned = cleanExtractedPdfPages(pages);
    expect(cleaned).not.toContain('Journal of Quiet Interfaces');
    expect(cleaned).not.toContain('Copyright 2026');
    expect(cleaned).toContain('architecture that respects reading.');
    expect(cleaned).not.toMatch(/^\s*[123]\s*$/m);
  });
});
