import { describe, expect, it } from 'vitest';
import { DEFAULT_PERSISTED_STATE } from '../../engine/storage';
import {
  applyPronunciationAndFilters,
  deterministicCleanForSpeech,
  previewPronunciationRules,
} from '../textFilters';

describe('Text filters and pronunciation rules', () => {
  it('strips URLs, emojis, markdown, and applies regex/exact/case-insensitive pronunciation rules', () => {
    const input = 'Check **Kokoro** at https://example.com and SLM 3.14159 🚀';
    const out = applyPronunciationAndFilters(
      input,
      [
        { id: '1', pattern: 'Kokoro', replacement: 'koh-koh-roh', matchMode: 'case-insensitive' },
        { id: '2', pattern: 'SLM', replacement: 'small language model', matchMode: 'exact' },
        { id: '3', pattern: '\\b3\\.14159\\b', replacement: 'pi approx', matchMode: 'regex' },
      ],
      {
        ...DEFAULT_PERSISTED_STATE.filters,
        skipUrls: true,
        skipEmojis: true,
        skipMarkdown: true,
      },
    );

    expect(out).toBe('Check koh-koh-roh at and small language model pi approx');
  });

  it('runs deterministicCleanForSpeech fallback cleanly with change diffs', () => {
    const input = 'Cookie Policy\nDr. Hinton paid $12.50 on Jan. 5 for 98% accuracy.';
    const res = deterministicCleanForSpeech(input);
    expect(res.cleanedText).toContain('Doctor Hinton');
    expect(res.cleanedText).toContain('twelve dollars and fifty cents');
    expect(res.cleanedText).toContain('January');
    expect(res.cleanedText).toContain('ninety-eight percent');
    expect(res.cleanedText).not.toContain('Cookie Policy');
    expect(res.changes.length).toBeGreaterThanOrEqual(4);
  });

  it('highlights matched rules in scratchpad preview', () => {
    const preview = previewPronunciationRules('SLM on Kokoro', [
      { id: 'a', pattern: 'SLM', replacement: 'small language model', matchMode: 'exact' },
      { id: 'b', pattern: 'kokoro', replacement: 'koh-koh-roh', matchMode: 'case-insensitive' },
    ]);
    expect(preview.matchCount).toBe(2);
    expect(preview.rewritten).toBe('small language model on koh-koh-roh');
  });
});
