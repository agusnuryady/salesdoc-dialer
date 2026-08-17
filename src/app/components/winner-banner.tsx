import type { SessionLineView } from '@/server/dto/session-view';
import { formatElapsed } from '../lib/format';

export function WinnerBanner({ line, now }: { line: SessionLineView | null; now: number }) {
  if (!line) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 px-5 py-4 text-sm text-neutral-400">
        No live winner right now.
      </div>
    );
  }

  return (
    <div className="rounded-lg border-2 border-emerald-500 bg-emerald-50 px-5 py-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Winner — live now</p>
      <div className="mt-2 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-neutral-900">{line.lead.name}</p>
          <p className="truncate text-sm text-neutral-600">
            {line.lead.company} · {line.lead.phone}
          </p>
        </div>
        <p className="shrink-0 text-2xl font-semibold tabular-nums text-emerald-700">
          {formatElapsed(line.startedAt, now)}
        </p>
      </div>
    </div>
  );
}
