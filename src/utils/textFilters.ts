import type { PronunciationRule, TextFilterSettings } from '../engine/storage';

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>()]+/gi;
const EMOJI_RE = /\p{Extended_Pictographic}/gu;

const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bDr\./g, 'Doctor'],
  [/\bMr\./g, 'Mister'],
  [/\bMrs\./g, 'Missus'],
  [/\bMs\./g, 'Miss'],
  [/\bProf\./g, 'Professor'],
  [/\be\.g\./gi, 'for example'],
  [/\bi\.e\./gi, 'that is'],
  [/\betc\./gi, 'etcetera'],
  [/\bvs\./gi, 'versus'],
  [/\bapprox\./gi, 'approximately'],
  [/\bFig\./g, 'Figure'],
  [/\bNo\./g, 'Number'],
];

const MONTHS: Record<string, string> = {
  'Jan.': 'January',
  'Feb.': 'February',
  'Mar.': 'March',
  'Apr.': 'April',
  'Aug.': 'August',
  'Sept.': 'September',
  'Sep.': 'September',
  'Oct.': 'October',
  'Nov.': 'November',
  'Dec.': 'December',
};

const ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

export function integerToWords(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n > 999_999) return String(n);
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const r = n % 10;
    return r === 0 ? TENS[t] : `${TENS[t]}-${ONES[r]}`;
  }
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const r = n % 100;
    return r === 0 ? `${ONES[h]} hundred` : `${ONES[h]} hundred ${integerToWords(r)}`;
  }
  const k = Math.floor(n / 1000);
  const r = n % 1000;
  return r === 0 ? `${integerToWords(k)} thousand` : `${integerToWords(k)} thousand ${integerToWords(r)}`;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildRuleRegex(rule: PronunciationRule): RegExp | null {
  const pattern = rule.pattern.trim();
  if (!pattern) return null;
  const mode = rule.matchMode ?? (rule.caseSensitive ? 'exact' : 'case-insensitive');
  if (mode === 'regex') {
    return new RegExp(pattern, 'g');
  }
  const escaped = escapeRegExp(pattern);
  const source = rule.wholeWord ? `\\b${escaped}\\b` : escaped;
  const flags = mode === 'exact' ? 'g' : 'gi';
  return new RegExp(source, flags);
}

export interface PronunciationPreviewSegment {
  text: string;
  matched: boolean;
}

export function previewPronunciationRules(
  sample: string,
  rules: PronunciationRule[],
): { segments: PronunciationPreviewSegment[]; matchCount: number; rewritten: string } {
  let rewritten = sample;
  let matchCount = 0;
  const matchedTokens: string[] = [];

  for (const rule of rules) {
    try {
      const re = buildRuleRegex(rule);
      if (!re) continue;
      rewritten = rewritten.replace(re, () => {
        matchCount += 1;
        matchedTokens.push(rule.replacement);
        return `\uE001${rule.replacement}\uE002`;
      });
    } catch {
      // Skip invalid regex pattern safely
    }
  }

  const segments: PronunciationPreviewSegment[] = [];
  const parts = rewritten.split(/(\uE001[^\uE002]*\uE002)/g);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('\uE001') && part.endsWith('\uE002')) {
      segments.push({ text: part.slice(1, -1), matched: true });
    } else {
      segments.push({ text: part, matched: false });
    }
  }

  return {
    segments,
    matchCount,
    rewritten: rewritten.replace(/[\uE001\uE002]/g, ''),
  };
}

export function applyPronunciationAndFilters(
  text: string,
  rules: PronunciationRule[],
  filters: TextFilterSettings,
): string {
  let out = text;

  if (filters.skipUrls) {
    out = out.replace(URL_RE, ' ');
  }
  if (filters.skipEmojis) {
    out = out.replace(EMOJI_RE, ' ');
  }
  if (filters.skipMarkdown) {
    out = out
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/[*_~>]+/g, '');
  }

  if (filters.expandAbbreviations) {
    out = expandAbbreviationsText(out);
  }
  if (filters.normalizeNumbers) {
    out = normalizeNumbersAndCurrencies(out);
  }

  for (const rule of rules) {
    try {
      const re = buildRuleRegex(rule);
      if (!re) continue;
      out = out.replace(re, rule.replacement);
    } catch {
      // Skip invalid pattern safely
    }
  }

  return out.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export function expandAbbreviationsText(input: string): string {
  let out = input;
  for (const [abbr, full] of Object.entries(MONTHS)) {
    out = out.replace(new RegExp(`\\b${escapeRegExp(abbr)}`, 'g'), full);
  }
  for (const [re, replacement] of ABBREVIATIONS) {
    out = out.replace(re, replacement);
  }
  return out;
}

export function normalizeNumbersAndCurrencies(input: string): string {
  let out = input;

  // Currencies like $12.50 or $40
  out = out.replace(/\$(\d{1,6})(?:\.(\d{2}))?\b/g, (_, dollarsStr: string, centsStr?: string) => {
    const dollars = Number(dollarsStr);
    const dollarWord = dollars === 1 ? 'dollar' : 'dollars';
    if (centsStr) {
      const cents = Number(centsStr);
      const centWord = cents === 1 ? 'cent' : 'cents';
      return cents > 0
        ? `${integerToWords(dollars)} ${dollarWord} and ${integerToWords(cents)} ${centWord}`
        : `${integerToWords(dollars)} ${dollarWord}`;
    }
    return `${integerToWords(dollars)} ${dollarWord}`;
  });

  // Percentages like 98% or 12.5%
  out = out.replace(/\b(\d{1,3}(?:\.\d+)?)\s*%/g, '$1 percent');

  // Years / decimals / standalone integers <= 9999
  out = out.replace(/\b(\d+)\.(\d+)\b/g, (_, whole: string, frac: string) => {
    const wholeWords = integerToWords(Number(whole));
    const fracWords = frac
      .split('')
      .map((d) => ONES[Number(d)] ?? d)
      .join(' ');
    return `${wholeWords} point ${fracWords}`;
  });

  out = out.replace(/\b(\d{1,4})\b/g, (match, numStr: string) => {
    const n = Number(numStr);
    if (n >= 1900 && n <= 2099) {
      const hi = Math.floor(n / 100);
      const lo = n % 100;
      if (lo === 0) return `${integerToWords(hi)} hundred`;
      if (lo < 10) return `${integerToWords(hi)} oh ${integerToWords(lo)}`;
      return `${integerToWords(hi)} ${integerToWords(lo)}`;
    }
    return integerToWords(n) || match;
  });

  return out;
}

export interface SpeechCleanupChange {
  original: string;
  cleaned: string;
  category: string;
}

/**
 * Deterministic rule-based "Clean for speech" fallback when no on-device SLM is downloaded.
 */
export function deterministicCleanForSpeech(input: string): {
  cleanedText: string;
  changes: SpeechCleanupChange[];
} {
  const changes: SpeechCleanupChange[] = [];
  let text = input;

  // Strip common web boilerplate lines
  const lines = text.split('\n');
  const filteredLines = lines.filter((line) => {
    const t = line.trim();
    if (/^(cookie policy|accept cookies|subscribe now|sign up for our newsletter|skip to content|advertisement)$/i.test(t)) {
      changes.push({ original: t, cleaned: '(removed boilerplate)', category: 'Boilerplate' });
      return false;
    }
    return true;
  });
  text = filteredLines.join('\n');

  // Record concrete diff previews for abbreviations, currencies, decimals
  const sampleMatches = new Set<string>();
  const recordReplacements = (re: RegExp, transform: (m: string) => string, category: string) => {
    text = text.replace(re, (match) => {
      const next = transform(match);
      if (next !== match && !sampleMatches.has(match) && changes.length < 20) {
        sampleMatches.add(match);
        changes.push({ original: match, cleaned: next, category });
      }
      return next;
    });
  };

  recordReplacements(/\b(?:Jan|Feb|Mar|Apr|Aug|Sept?|Oct|Nov|Dec)\./g, (m) => MONTHS[m] ?? m, 'Date / Month');
  recordReplacements(/\$\d{1,6}(?:\.\d{2})?\b/g, (m) => normalizeNumbersAndCurrencies(m), 'Currency');
  recordReplacements(/\b\d+\.\d+\b/g, (m) => normalizeNumbersAndCurrencies(m), 'Number / Decimal');
  recordReplacements(/\b(?:Dr|Mr|Mrs|Ms|Prof|e\.g|i\.e|etc|vs|Fig|No)\./gi, (m) => expandAbbreviationsText(m), 'Abbreviation');
  recordReplacements(/\b\d{1,3}(?:\.\d+)?%/g, (m) => normalizeNumbersAndCurrencies(m), 'Percentage');

  // Clean stray markdown/symbols
  text = text.replace(/[*_~`]+/g, '').replace(/\s{2,}/g, ' ').trim();

  return { cleanedText: text, changes };
}
