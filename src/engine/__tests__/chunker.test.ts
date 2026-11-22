import { describe, expect, it } from 'vitest';
import {
  buildDocumentStructure,
  detectParagraphDirection,
  splitIntoSentences,
  splitLongSentence,
} from '../chunker';

describe('chunker', () => {
  it('keeps abbreviations, decimals, and URLs intact across sentence splitting', () => {
    const sample =
      'Dr. Patel measured 3.14 seconds at https://example.com/v1.0/docs yesterday. For example, e.g. neural audio worked cleanly!';
    const sentences = splitIntoSentences(sample);
    expect(sentences).toHaveLength(2);
    expect(sentences[0]).toContain('Dr. Patel');
    expect(sentences[0]).toContain('3.14');
    expect(sentences[0]).toContain('https://example.com/v1.0/docs');
    expect(sentences[1]).toContain('e.g. neural audio');
  });

  it('never splits mid-word and respects the 300-char hard limit on oversized sentences', () => {
    const words = Array.from({ length: 120 }, (_, i) => `word${i}`).join(' ');
    const parts = splitLongSentence(words, 200, 300);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(300);
      expect(part).not.toMatch(/^\w{1,2}\s|\s\w{1,2}$/);
    }
    expect(parts.join(' ')).toBe(words);
  });

  it('chunks a 50k-character document cleanly into target-sized chunks without losing words', () => {
    const sentence =
      'Neural text-to-speech synthesis turns structured prose into calm spoken audio with crisp timing. ';
    const longText = sentence.repeat(550); // ~52,800 chars
    const doc = buildDocumentStructure(longText);

    expect(doc.totalChars).toBeGreaterThan(50_000);
    expect(doc.chunks.length).toBeGreaterThan(150);
    for (const chunk of doc.chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(300);
      expect(chunk.text.length).toBeGreaterThan(0);
    }
  });

  it('detects RTL direction for Arabic and Urdu paragraphs', () => {
    expect(detectParagraphDirection('مرحبا بكم في القارئ الصوتي')).toBe('rtl');
    expect(detectParagraphDirection('یہ ایک اردو تحریر ہے۔')).toBe('rtl');
    expect(detectParagraphDirection('Hello world')).toBe('ltr');
  });
});
