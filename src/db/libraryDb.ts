import Dexie, { type Table } from 'dexie';
import type { ProviderId } from '../engine/types';

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink';

export interface LibraryChapter {
  id: string;
  title: string;
  text: string;
}

export interface LibraryDocument {
  id: string;
  title: string;
  author?: string;
  text: string;
  sourceType: 'paste' | 'txt' | 'md' | 'pdf' | 'docx' | 'epub' | 'ocr' | 'url' | 'sample';
  sourceUrl?: string;
  createdAt: number;
  updatedAt: number;
  progress: number; // 0..100
  chunkIndex: number;
  charOffset: number;
  totalWords: number;
  voiceId?: string;
  rate?: number;
  providerId?: ProviderId;
  chapters?: LibraryChapter[];
  activeChapterIndex?: number;
}

export interface TextHighlight {
  id: string;
  documentId: string;
  sentenceIndex: number;
  text: string;
  color: HighlightColor;
  note: string;
  createdAt: number;
}

export interface DailyStat {
  date: string; // YYYY-MM-DD
  secondsListened: number;
  documentsFinished: number;
  updatedAt: number;
}

export const MAX_LIBRARY_ITEMS = 50;

class ReaderDatabase extends Dexie {
  documents!: Table<LibraryDocument, string>;
  highlights!: Table<TextHighlight, string>;
  stats!: Table<DailyStat, string>;

  constructor() {
    super('tts_reader_db_v1');
    this.version(1).stores({
      documents: 'id, updatedAt, createdAt, title',
      highlights: 'id, documentId, sentenceIndex, createdAt',
      stats: 'date',
    });
  }
}

export const db = new ReaderDatabase();

export async function listLibraryDocuments(): Promise<LibraryDocument[]> {
  return db.documents.orderBy('updatedAt').reverse().toArray();
}

export async function saveLibraryDocument(doc: LibraryDocument): Promise<void> {
  await db.documents.put(doc);
  const all = await db.documents.orderBy('updatedAt').reverse().toArray();
  if (all.length > MAX_LIBRARY_ITEMS) {
    const excess = all.slice(MAX_LIBRARY_ITEMS);
    await db.documents.bulkDelete(excess.map((d) => d.id));
  }
}

export async function deleteLibraryDocument(id: string): Promise<void> {
  await db.transaction('rw', db.documents, db.highlights, async () => {
    await db.documents.delete(id);
    await db.highlights.where('documentId').equals(id).delete();
  });
}

export async function listHighlightsForDocument(documentId: string): Promise<TextHighlight[]> {
  return db.highlights.where('documentId').equals(documentId).sortBy('sentenceIndex');
}

export async function saveHighlight(highlight: TextHighlight): Promise<void> {
  await db.highlights.put(highlight);
}

export async function deleteHighlight(id: string): Promise<void> {
  await db.highlights.delete(id);
}

export function exportHighlightsMarkdown(docTitle: string, highlights: TextHighlight[]): string {
  const lines = [`# Highlights & Notes — ${docTitle}`, ''];
  for (const h of highlights) {
    lines.push(`> ${h.text}`);
    if (h.note.trim()) {
      lines.push(`- **Note (${h.color}):** ${h.note.trim()}`);
    } else {
      lines.push(`- *Color: ${h.color}*`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export async function recordListeningSeconds(seconds: number): Promise<void> {
  if (seconds <= 0) return;
  const today = new Date().toISOString().slice(0, 10);
  const existing = await db.stats.get(today);
  await db.stats.put({
    date: today,
    secondsListened: (existing?.secondsListened ?? 0) + seconds,
    documentsFinished: existing?.documentsFinished ?? 0,
    updatedAt: Date.now(),
  });
}

export async function recordDocumentCompleted(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const existing = await db.stats.get(today);
  await db.stats.put({
    date: today,
    secondsListened: existing?.secondsListened ?? 0,
    documentsFinished: (existing?.documentsFinished ?? 0) + 1,
    updatedAt: Date.now(),
  });
}

export interface ListeningSummary {
  totalMinutes: number;
  todayMinutes: number;
  totalFinished: number;
  streakDays: number;
}

export async function getListeningSummary(): Promise<ListeningSummary> {
  const rows = await db.stats.orderBy('date').reverse().toArray();
  const today = new Date().toISOString().slice(0, 10);
  let totalSeconds = 0;
  let todaySeconds = 0;
  let totalFinished = 0;

  const activeDates = new Set<string>();
  for (const row of rows) {
    totalSeconds += row.secondsListened;
    totalFinished += row.documentsFinished;
    if (row.date === today) todaySeconds = row.secondsListened;
    if (row.secondsListened >= 10) activeDates.add(row.date);
  }

  let streakDays = 0;
  const cursor = new Date();
  for (let i = 0; i < 365; i++) {
    const key = cursor.toISOString().slice(0, 10);
    if (activeDates.has(key)) {
      streakDays += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else if (i === 0) {
      // Allow streak to continue if user hasn't listened yet today
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  return {
    totalMinutes: Math.round(totalSeconds / 60),
    todayMinutes: Math.round(todaySeconds / 60),
    totalFinished,
    streakDays,
  };
}
