import { deterministicCleanForSpeech } from '../src/utils/textFilters';

const SAMPLES: string[] = [
  'Dr. Patel arrived at 3:15 p.m. on Oct. 24th, 2024.',
  'The subscription costs $19.99 per month, i.e. $239.88 annually.',
  'CPU usage jumped by 42.5% vs. yesterday.',
  'Cookie Policy\nAccept Cookies\nRead the full report in Fig. 4.',
  'Prof. Lin published 3.14159 notes in Vol. 12.',
  'Mr. and Mrs. Gomez visited Washington, D.C. in Jan. 2025.',
  'Memory dropped from 1024 MB to 512 MB, approx. 50% lower.',
  'See e.g. the 1999 study on neural acoustics.',
  'Revenue grew from $40 to $1250 in Q4.',
  'Ms. Roy checked No. 7 before Dec. 12.',
  'Subscribe Now\nSkip to Content\nDeep focus improves recall by 34%.',
  'The ratio was 0.75 vs. the expected 1.25 baseline.',
  'On Sept. 3, 2026, Dr. Kim spoke for 45 minutes.',
  'Total grant funding reached $9500 for 18 labs.',
  'Compare Fig. 2 and Fig. 3, etc., for full details.',
  'Battery reserve held at 99% after 2005 cycles.',
  'Nov. rainfall averaged 4.2 inches across the valley.',
  'Advertisement\nChapter 1: Quiet Reading Spaces.',
  'Feb. 2020 benchmarks showed 2.5x speedup.',
  'Ticket #14 cost $5.00 with 8% tax.',
];

process.stdout.write('=== Speech Normalizer Evaluation (20 Samples) ===\n\n');
SAMPLES.forEach((sample, idx) => {
  const { cleanedText, changes } = deterministicCleanForSpeech(sample);
  process.stdout.write(`[${String(idx + 1).padStart(2, '0')}] BEFORE: ${sample.replace(/\n/g, ' \\n ')}\n`);
  process.stdout.write(`     AFTER : ${cleanedText.replace(/\n/g, ' \\n ')}\n`);
  if (changes.length > 0) {
    process.stdout.write(`     RULES : ${changes.map((c) => `${c.category}: "${c.original}" -> "${c.cleaned}"`).join(' | ')}\n`);
  }
  process.stdout.write('\n');
});
