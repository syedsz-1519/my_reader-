import type {
  DocumentStructure,
  ReaderParagraph,
  ReaderSentence,
  TextChunk,
  WordToken,
} from './types';

export interface ChunkerOptions {
  targetMinChars?: number;
  targetMaxChars?: number;
  hardMaxChars?: number;
  locale?: string;
}

const DEFAULT_MIN = 160;
const DEFAULT_MAX = 220;
const DEFAULT_HARD_MAX = 300;

// Common abbreviations that end with a period and should NOT terminate a sentence
const ABBREVIATION_RE =
  /\b(?:Dr|Mr|Mrs|Ms|Prof|Sr|Jr|Rev|St|Lt|Capt|Col|Gen|Sgt|Gov|Pres|Sen|Rep|Hon|Ph\.D|M\.D|B\.A|M\.A|e\.g|i\.e|etc|vs|Fig|Eq|Vol|No|approx|est|Inc|Ltd|Corp|Co|Jan|Feb|Mar|Apr|Aug|Sept|Oct|Nov|Dec|U\.S|U\.K|a\.m|p\.m)\.\s*$/i;

const RTL_CHAR_RE = /\p{Script=Arabic}|\p{Script=Hebrew}/u;
const LTR_CHAR_RE = /\p{Script=Latin}|\p{Script=Devanagari}|\p{Script=Telugu}/u;

export function detectParagraphDirection(text: string): 'ltr' | 'rtl' | 'auto' {
  for (const ch of text) {
    if (RTL_CHAR_RE.test(ch)) return 'rtl';
    if (LTR_CHAR_RE.test(ch)) return 'ltr';
  }
  return 'auto';
}

export function tokenizeWords(text: string): WordToken[] {
  const tokens: WordToken[] = [];
  const wordRe = /\S+/g;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = wordRe.exec(text)) !== null) {
    tokens.push({
      index: idx++,
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return tokens;
}

/**
 * Splits a paragraph into sentences using Intl.Segmenter when available,
 * then merges any false breaks caused by abbreviations or decimal numbers.
 */
export function splitIntoSentences(paragraph: string, locale = 'en'): string[] {
  const trimmed = paragraph.trim();
  if (!trimmed) return [];

  // Mask URLs so dots inside domains/paths never trigger false sentence breaks
  const urlPlaceholders: string[] = [];
  const masked = trimmed.replace(/\b(?:https?:\/\/|www\.)[^\s<>()]+/gi, (match) => {
    const token = `__TTS_URL_${urlPlaceholders.length}__`;
    urlPlaceholders.push(match);
    return token;
  });

  const restoreUrls = (text: string): string =>
    text.replace(/__TTS_URL_(\d+)__/g, (_, idx) => urlPlaceholders[Number(idx)] ?? '');

  let rawSegments: string[] = [];

  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    try {
      const segmenter = new Intl.Segmenter(locale, { granularity: 'sentence' });
      for (const part of segmenter.segment(masked)) {
        const s = part.segment.trim();
        if (s) rawSegments.push(s);
      }
    } catch {
      rawSegments = regexSentenceSplit(masked);
    }
  } else {
    rawSegments = regexSentenceSplit(masked);
  }

  if (rawSegments.length <= 1) {
    const single = rawSegments.length === 1 ? restoreUrls(rawSegments[0]) : trimmed;
    return [single];
  }

  // Re-stitch false splits at known abbreviations or single initials (e.g. "J. R. R.")
  const merged: string[] = [];
  for (const seg of rawSegments) {
    if (merged.length > 0) {
      const prev = merged[merged.length - 1];
      const endsWithAbbrev = ABBREVIATION_RE.test(prev) || /\b[A-Z]\.$/.test(prev);
      const startsLowerOrDigit = /^[a-z0-9(["']/.test(seg);
      const prevEndsDecimal = /\d\.$/.test(prev) && /^\d/.test(seg);

      if (prevEndsDecimal || (endsWithAbbrev && (startsLowerOrDigit || /^[A-Z]/.test(seg)))) {
        merged[merged.length - 1] = `${prev} ${seg}`;
        continue;
      }
    }
    merged.push(seg);
  }

  return merged.map(restoreUrls);
}

function regexSentenceSplit(text: string): string[] {
  const result: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '.' || ch === '!' || ch === '?' || ch === '۔' || ch === '؟' || ch === '।') {
      const slice = text.slice(start, i + 1);
      const nextChar = text[i + 1];
      // Skip decimals like 3.14 or abbreviations
      if (ch === '.' && /\d/.test(text[i - 1] ?? '') && /\d/.test(nextChar ?? '')) {
        continue;
      }
      if (ch === '.' && ABBREVIATION_RE.test(slice)) {
        continue;
      }
      if (!nextChar || /\s|["')\]”’]/.test(nextChar)) {
        // Consume trailing closing quotes/brackets
        let end = i + 1;
        while (end < text.length && /["')\]”’]/.test(text[end])) {
          end++;
        }
        const sentence = text.slice(start, end).trim();
        if (sentence) result.push(sentence);
        start = end;
        while (start < text.length && /\s/.test(text[start])) start++;
        i = start - 1;
      }
    }
  }
  const tail = text.slice(start).trim();
  if (tail) result.push(tail);
  return result;
}

/**
 * Splits a single oversized sentence (> hardMaxChars) at clause punctuation or whitespace,
 * NEVER splitting mid-word.
 */
export function splitLongSentence(
  sentence: string,
  targetMaxChars = DEFAULT_MAX,
  hardMaxChars = DEFAULT_HARD_MAX,
): string[] {
  const text = sentence.trim();
  if (text.length <= hardMaxChars) return [text];

  const parts: string[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const remaining = text.length - cursor;
    if (remaining <= hardMaxChars) {
      parts.push(text.slice(cursor).trim());
      break;
    }

    const windowEnd = Math.min(cursor + hardMaxChars, text.length);
    const preferredEnd = Math.min(cursor + targetMaxChars, text.length);
    const slice = text.slice(cursor, windowEnd);

    // 1. Prefer clause punctuation (; : — – ,) near targetMaxChars..hardMaxChars
    let splitAt = -1;
    for (let i = slice.length - 1; i >= Math.min(80, preferredEnd - cursor); i--) {
      if (/[;:,—–]/.test(slice[i]) && (i + 1 >= slice.length || /\s/.test(slice[i + 1]))) {
        splitAt = i + 1;
        break;
      }
    }

    // 2. Fall back to last whitespace inside window
    if (splitAt <= 0) {
      const wsIdx = slice.lastIndexOf(' ');
      if (wsIdx > 0) {
        splitAt = wsIdx;
      }
    }

    // 3. Only if a single unbroken token exceeds hardMaxChars, search forward for whitespace
    // so we never split mid-word unless no whitespace exists at all
    if (splitAt <= 0) {
      const nextSpace = text.indexOf(' ', cursor + 1);
      if (nextSpace !== -1) {
        splitAt = nextSpace - cursor;
      } else {
        splitAt = slice.length;
      }
    }

    const piece = text.slice(cursor, cursor + splitAt).trim();
    if (piece) parts.push(piece);
    cursor += splitAt;
    while (cursor < text.length && /\s/.test(text[cursor])) cursor++;
  }

  return parts;
}

/**
 * Builds the complete document structure: paragraphs -> sentences -> TTS chunks.
 * Sentences are packed into chunks aiming for 160-220 chars and never exceeding 300 chars.
 */
export function buildDocumentStructure(
  rawText: string,
  options: ChunkerOptions = {},
): DocumentStructure {
  const minChars = options.targetMinChars ?? DEFAULT_MIN;
  const maxChars = options.targetMaxChars ?? DEFAULT_MAX;
  const hardMax = options.hardMaxChars ?? DEFAULT_HARD_MAX;
  const locale = options.locale ?? 'en';

  const normalized = rawText.replace(/\r\n?/g, '\n').trim();
  if (!normalized) {
    return {
      paragraphs: [],
      sentences: [],
      chunks: [],
      totalChars: 0,
      totalWords: 0,
    };
  }

  const rawParagraphs = normalized
    .split(/\n{2,}|\n(?=#+\s)/)
    .map((p) => p.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean);

  const paragraphs: ReaderParagraph[] = [];
  const allSentences: ReaderSentence[] = [];
  const chunks: TextChunk[] = [];

  let globalOffset = 0;
  let totalWords = 0;

  for (let pIdx = 0; pIdx < rawParagraphs.length; pIdx++) {
    let pText = rawParagraphs[pIdx];
    let isHeading = false;
    let headingLevel: number | undefined;

    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(pText);
    if (headingMatch) {
      isHeading = true;
      headingLevel = headingMatch[1].length;
      pText = headingMatch[2].trim();
    }

    const sentenceStrings = splitIntoSentences(pText, locale);
    const pSentences: ReaderSentence[] = [];
    const dir = detectParagraphDirection(pText);

    // Pack sentences within the same paragraph into chunks (160-220 target, 300 hard max)
    let bufferParts: Array<{ text: string; sentenceIndex: number; startOffset: number; endOffset: number }> = [];
    let bufferLen = 0;

    const flushBuffer = () => {
      if (bufferParts.length === 0) return;
      const combinedText = bufferParts.map((b) => b.text).join(' ');
      const chunkStart = bufferParts[0].startOffset;
      const chunkEnd = bufferParts[bufferParts.length - 1].endOffset;
      const chunkIndex = chunks.length;

      chunks.push({
        index: chunkIndex,
        paragraphIndex: pIdx,
        sentenceIndex: bufferParts[0].sentenceIndex,
        text: combinedText,
        startOffset: chunkStart,
        endOffset: chunkEnd,
        words: tokenizeWords(combinedText),
      });

      for (const b of bufferParts) {
        const sObj = allSentences[b.sentenceIndex];
        if (sObj) {
          if (sObj.firstChunkIndex === -1) sObj.firstChunkIndex = chunkIndex;
          sObj.lastChunkIndex = chunkIndex;
        }
      }

      bufferParts = [];
      bufferLen = 0;
    };

    for (const sRaw of sentenceStrings) {
      const sIndex = allSentences.length;
      const sStart = globalOffset;
      const sEnd = sStart + sRaw.length;
      globalOffset = sEnd + 1;
      totalWords += tokenizeWords(sRaw).length;

      const sentenceObj: ReaderSentence = {
        index: sIndex,
        paragraphIndex: pIdx,
        text: sRaw,
        startOffset: sStart,
        endOffset: sEnd,
        firstChunkIndex: -1,
        lastChunkIndex: -1,
      };
      allSentences.push(sentenceObj);
      pSentences.push(sentenceObj);

      if (sRaw.length > hardMax) {
        flushBuffer();
        const subParts = splitLongSentence(sRaw, maxChars, hardMax);
        let subCursor = sStart;
        for (const sub of subParts) {
          const chunkIndex = chunks.length;
          const subEnd = subCursor + sub.length;
          chunks.push({
            index: chunkIndex,
            paragraphIndex: pIdx,
            sentenceIndex: sIndex,
            text: sub,
            startOffset: subCursor,
            endOffset: subEnd,
            words: tokenizeWords(sub),
          });
          if (sentenceObj.firstChunkIndex === -1) sentenceObj.firstChunkIndex = chunkIndex;
          sentenceObj.lastChunkIndex = chunkIndex;
          subCursor = subEnd + 1;
        }
        continue;
      }

      const candidateLen = bufferLen === 0 ? sRaw.length : bufferLen + 1 + sRaw.length;
      if (bufferLen > 0 && (candidateLen > hardMax || (bufferLen >= minChars && candidateLen > maxChars))) {
        flushBuffer();
      }

      bufferParts.push({
        text: sRaw,
        sentenceIndex: sIndex,
        startOffset: sStart,
        endOffset: sEnd,
      });
      bufferLen = bufferLen === 0 ? sRaw.length : bufferLen + 1 + sRaw.length;

      if (bufferLen >= minChars) {
        flushBuffer();
      }
    }

    flushBuffer();

    paragraphs.push({
      index: pIdx,
      text: pText,
      dir,
      isHeading,
      headingLevel,
      sentences: pSentences,
    });

    globalOffset += 1; // paragraph break
  }

  return {
    paragraphs,
    sentences: allSentences,
    chunks,
    totalChars: normalized.length,
    totalWords,
  };
}
