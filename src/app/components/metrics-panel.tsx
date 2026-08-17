import type { DialerSessionMetrics } from '@/server/domain/types';

const TILES: { key: keyof DialerSessionMetrics; label: string; accent: string }[] = [
  { key: 'attempted', label: 'Attempted', accent: 'text-neutral-900' },
  { key: 'connected', label: 'Connected', accent: 'text-emerald-600' },
  { key: 'failed', label: 'Failed', accent: 'text-red-600' },
  { key: 'canceled', label: 'Canceled', accent: 'text-amber-600' },
];

export function MetricsPanel({ metrics }: { metrics: DialerSessionMetrics }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {TILES.map((tile) => (
        <div key={tile.key} className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{tile.label}</p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${tile.accent}`}>{metrics[tile.key]}</p>
        </div>
      ))}
    </div>
  );
}
