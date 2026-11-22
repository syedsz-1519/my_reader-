import { buildDocumentStructure } from '../engine/chunker';
import type { AudioChunk, TtsProvider } from '../engine/types';

export interface ExportProgress {
  completedChunks: number;
  totalChunks: number;
  percent: number;
}

export interface ChapterMarker {
  index: number;
  title: string;
  startSec: number;
}

/**
 * Stitches synthesized AudioChunks into a 16-bit PCM WAV Blob with 120ms silence
 * between sentences and 5ms edge fades to avoid any join clicking or clipping.
 */
export function encodeAudioChunksToWav(
  chunkGroups: Array<{ text: string; chunks: AudioChunk[] }>,
  silenceMs = 120,
): { wavBlob: Blob; markers: ChapterMarker[]; totalDurationSec: number } {
  const firstValid = chunkGroups.flatMap((g) => g.chunks).find((c) => c.pcm.length > 0);
  const sampleRate = firstValid?.sampleRate ?? 24000;
  const silenceSamples = Math.round((silenceMs / 1000) * sampleRate);
  const fadeSamples = Math.min(Math.round(0.005 * sampleRate), 120);

  let totalSamples = 0;
  const preparedGroups = chunkGroups.map((group) => {
    const groupSamples = group.chunks.reduce((acc, c) => acc + c.pcm.length, 0);
    totalSamples += groupSamples + silenceSamples;
    return group;
  });
  if (totalSamples > silenceSamples) {
    totalSamples -= silenceSamples;
  }

  const buffer = new ArrayBuffer(44 + totalSamples * 2);
  const view = new DataView(buffer);

  // RIFF header
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + totalSamples * 2, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // Byte rate
  view.setUint16(32, 2, true); // Block align
  view.setUint16(34, 16, true); // Bits per sample
  writeAscii(view, 36, 'data');
  view.setUint32(40, totalSamples * 2, true);

  const markers: ChapterMarker[] = [];
  let sampleCursor = 0;

  for (let gIdx = 0; gIdx < preparedGroups.length; gIdx++) {
    const group = preparedGroups[gIdx];
    markers.push({
      index: gIdx + 1,
      title: group.text.slice(0, 60),
      startSec: Number((sampleCursor / sampleRate).toFixed(3)),
    });

    // Combine inner AudioChunks of this sentence/chunk
    const groupLen = group.chunks.reduce((a, c) => a + c.pcm.length, 0);
    let groupSampleOffset = 0;

    for (const ac of group.chunks) {
      for (let i = 0; i < ac.pcm.length; i++) {
        let sample = ac.pcm[i];
        // Soften start and end edges of the sentence group to prevent clicks
        if (groupSampleOffset < fadeSamples) {
          sample *= groupSampleOffset / fadeSamples;
        } else if (groupSampleOffset > groupLen - fadeSamples) {
          sample *= Math.max(0, (groupLen - groupSampleOffset) / fadeSamples);
        }

        const clamped = Math.max(-1, Math.min(1, sample));
        const int16 = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
        view.setInt16(44 + sampleCursor * 2, int16, true);

        sampleCursor++;
        groupSampleOffset++;
      }
    }

    if (gIdx < preparedGroups.length - 1) {
      sampleCursor += silenceSamples; // ArrayBuffer is zero-initialized
    }
  }

  return {
    wavBlob: new Blob([buffer], { type: 'audio/wav' }),
    markers,
    totalDurationSec: totalSamples / sampleRate,
  };
}

export async function synthesizeDocumentToWav(
  text: string,
  provider: TtsProvider,
  opts: { voiceId?: string; lang?: string; rate: number; pitch: number; volume: number },
  onProgress?: (p: ExportProgress) => void,
  signal?: AbortSignal,
): Promise<{ wavBlob: Blob; markers: ChapterMarker[]; totalDurationSec: number }> {
  if (!provider.capabilities.exportAudio || !provider.synthesize) {
    throw new Error("Browsers can't export system voices. Switch to Kokoro or Remote Server.");
  }

  await provider.init();
  const doc = buildDocumentStructure(text, { locale: opts.lang });
  const totalChunks = doc.chunks.length;
  const groups: Array<{ text: string; chunks: AudioChunk[] }> = [];

  for (let i = 0; i < totalChunks; i++) {
    if (signal?.aborted) {
      throw new DOMException('Export canceled', 'AbortError');
    }
    const chunk = doc.chunks[i];
    const pieces: AudioChunk[] = [];
    for await (const piece of provider.synthesize(chunk, opts, signal)) {
      if (piece) pieces.push(piece);
    }
    groups.push({ text: chunk.text, chunks: pieces });
    onProgress?.({
      completedChunks: i + 1,
      totalChunks,
      percent: Math.round(((i + 1) / totalChunks) * 100),
    });
  }

  return encodeAudioChunksToWav(groups, 120);
}

export function buildCueSheet(title: string, filename: string, markers: ChapterMarker[]): string {
  const safeTitle = title.replace(/"/g, "'");
  const lines = [`TITLE "${safeTitle}"`, `FILE "${filename}" WAVE`];
  for (const m of markers) {
    const mins = Math.floor(m.startSec / 60);
    const secs = Math.floor(m.startSec % 60);
    const frames = Math.floor((m.startSec % 1) * 75);
    const mm = String(mins).padStart(2, '0');
    const ss = String(secs).padStart(2, '0');
    const ff = String(frames).padStart(2, '0');
    lines.push(`  TRACK ${String(m.index).padStart(2, '0')} AUDIO`);
    lines.push(`    TITLE "${m.title.replace(/"/g, "'")}"`);
    lines.push(`    INDEX 01 ${mm}:${ss}:${ff}`);
  }
  return lines.join('\n');
}

function writeAscii(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
