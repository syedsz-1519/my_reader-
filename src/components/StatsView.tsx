import * as React from 'react';
import { Award, BookCheck, Clock, ShieldCheck } from 'lucide-react';
import { getListeningSummary, type ListeningSummary } from '../db/libraryDb';

export interface StatsViewProps {
  refreshSignal: number;
}

export function StatsView({ refreshSignal }: StatsViewProps) {
  const [summary, setSummary] = React.useState<ListeningSummary>({
    totalMinutes: 0,
    todayMinutes: 0,
    totalFinished: 0,
    streakDays: 0,
  });

  React.useEffect(() => {
    let active = true;
    void getListeningSummary().then((res) => {
      if (active) setSummary(res);
    });
    return () => {
      active = false;
    };
  }, [refreshSignal]);

  return (
    <section
      aria-labelledby="stats-heading"
      className="max-w-[var(--read-measure)] mx-auto px-4 sm:px-6 py-10 pb-[calc(var(--player-h)+48px)] space-y-6"
    >
      <div className="space-y-1">
        <h1 id="stats-heading" className="text-[28px] leading-[34px] font-semibold text-[var(--text)]">
          Listening Stats
        </h1>
        <p className="text-[14px] text-[var(--text-soft)]">
          Recorded locally in your browser’s IndexedDB. Nothing is uploaded or tracked.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-[var(--r-md)] bg-[var(--surface)] border border-[var(--border)] shadow-[var(--shadow-1)] space-y-1.5">
          <div className="flex items-center gap-2 text-[var(--text-soft)] text-[13px] font-medium">
            <Clock className="w-4 h-4 text-[var(--accent)]" aria-hidden="true" />
            Time listened
          </div>
          <p className="text-[28px] font-semibold tabular-nums text-[var(--text)]">
            {summary.totalMinutes}m
          </p>
          <p className="text-[12px] text-[var(--text-soft)] tabular-nums">
            {summary.todayMinutes}m listened today
          </p>
        </div>

        <div className="p-5 rounded-[var(--r-md)] bg-[var(--surface)] border border-[var(--border)] shadow-[var(--shadow-1)] space-y-1.5">
          <div className="flex items-center gap-2 text-[var(--text-soft)] text-[13px] font-medium">
            <BookCheck className="w-4 h-4 text-[var(--accent)]" aria-hidden="true" />
            Documents finished
          </div>
          <p className="text-[28px] font-semibold tabular-nums text-[var(--text)]">
            {summary.totalFinished}
          </p>
          <p className="text-[12px] text-[var(--text-soft)]">Completed end-to-end</p>
        </div>

        <div className="p-5 rounded-[var(--r-md)] bg-[var(--surface)] border border-[var(--border)] shadow-[var(--shadow-1)] space-y-1.5">
          <div className="flex items-center gap-2 text-[var(--text-soft)] text-[13px] font-medium">
            <Award className="w-4 h-4 text-[var(--accent)]" aria-hidden="true" />
            Daily streak
          </div>
          <p className="text-[28px] font-semibold tabular-nums text-[var(--text)]">
            {summary.streakDays} {summary.streakDays === 1 ? 'day' : 'days'}
          </p>
          <p className="text-[12px] text-[var(--text-soft)]">Days with active listening</p>
        </div>
      </div>

      <div className="p-4 rounded-[var(--r-md)] bg-[var(--surface-2)] border border-[var(--border)] flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-[var(--success)] shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-[13px] leading-[20px] text-[var(--text-soft)]">
          Everything runs in your browser. No text leaves your device, and listening history stays inside local IndexedDB storage.
        </p>
      </div>
    </section>
  );
}
