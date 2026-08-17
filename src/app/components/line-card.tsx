import type { SessionLineView } from '@/server/dto/session-view';
import { formatElapsed } from '../lib/format';
import { CrmSyncBadge } from './crm-sync-badge';

const STATUS_STYLES: Record<string, string> = {
  DIALING: 'bg-neutral-100 text-neutral-600',
  CONNECTED: 'bg-emerald-100 text-emerald-800',
  NO_ANSWER: 'bg-neutral-100 text-neutral-600',
  BUSY: 'bg-neutral-100 text-neutral-600',
  VOICEMAIL: 'bg-neutral-100 text-neutral-600',
  CANCELED_BY_DIALER: 'bg-amber-100 text-amber-800',
};

const STATUS_LABELS: Record<string, string> = {
  DIALING: 'Dialing…',
  CONNECTED: 'Connected',
  NO_ANSWER: 'No Answer',
  BUSY: 'Busy',
  VOICEMAIL: 'Voicemail',
  CANCELED_BY_DIALER: 'Canceled by Dialer',
};

export function LineCard({ line, now }: { line: SessionLineView; now: number }) {
  const elapsed = line.endedAt ? formatElapsed(line.startedAt, new Date(line.endedAt).getTime()) : formatElapsed(line.startedAt, now);

  return (
    <div
      className={`rounded-lg border bg-white px-4 py-3 ${
        line.isWinner ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-neutral-200'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-neutral-900">{line.lead.name}</p>
          <p className="truncate text-xs text-neutral-500">
            {line.lead.company} · {line.lead.phone}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[line.status]}`}>
          {STATUS_LABELS[line.status]}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-sm tabular-nums text-neutral-500">{elapsed}</p>
        <CrmSyncBadge crmSync={line.crmSync} />
      </div>
    </div>
  );
}
