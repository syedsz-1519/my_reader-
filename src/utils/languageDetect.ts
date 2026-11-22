const ISO639_3_TO_BCP47: Record<string, string> = {
  eng: 'en',
  hin: 'hi',
  urd: 'ur',
  arb: 'ar',
  ara: 'ar',
  tel: 'te',
  spa: 'es',
  fra: 'fr',
  deu: 'de',
  ita: 'it',
  por: 'pt',
  rus: 'ru',
  jpn: 'ja',
  kor: 'ko',
  cmn: 'zh',
};

export function detectScriptLanguage(text: string): string | null {
  const sample = text.slice(0, 600);
  if (/[\u0600-\u06FF]/.test(sample)) {
    // Distinguish Urdu-specific glyphs (ٹ ڈ ڑ ں ے ہ) from Arabic
    return /[ٹڈڑںےھ]/.test(sample) ? 'ur' : 'ar';
  }
  if (/[\u0900-\u097F]/.test(sample)) return 'hi';
  if (/[\u0C00-\u0C7F]/.test(sample)) return 'te';
  if (/[\u4E00-\u9FFF]/.test(sample)) return 'zh';
  if (/[\u3040-\u30FF]/.test(sample)) return 'ja';
  if (/[\uAC00-\uD7AF]/.test(sample)) return 'ko';
  return null;
}

export async function detectDocumentLanguage(text: string): Promise<string> {
  const scriptMatch = detectScriptLanguage(text);
  if (scriptMatch) return scriptMatch;

  const fallback =
    typeof navigator !== 'undefined' && navigator.language
      ? navigator.language.split('-')[0].toLowerCase()
      : 'en';

  if (text.trim().length < 40) return fallback;

  try {
    const { franc } = await import('franc-min');
    const code3 = franc(text.slice(0, 2000), { minLength: 20 });
    if (code3 && code3 !== 'und' && ISO639_3_TO_BCP47[code3]) {
      return ISO639_3_TO_BCP47[code3];
    }
  } catch {
    // Fall back silently if lazy import fails
  }

  return fallback;
}
