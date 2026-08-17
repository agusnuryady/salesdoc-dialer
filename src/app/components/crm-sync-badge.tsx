import type { CrmSyncState } from '@/server/dialer/crm-sync-service';
import type { SessionLineView } from '@/server/dto/session-view';

const STYLES: Record<CrmSyncState, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  SYNCED: 'bg-emerald-100 text-emerald-800',
  FAILED: 'bg-red-100 text-red-800',
  SKIPPED: 'bg-neutral-100 text-neutral-600',
};

const DOT_STYLES: Record<CrmSyncState, string> = {
  PENDING: 'bg-amber-500 animate-pulse',
  SYNCED: 'bg-emerald-500',
  FAILED: 'bg-red-500',
  SKIPPED: 'bg-neutral-400',
};

const LABELS: Record<CrmSyncState, string> = {
  PENDING: 'CRM sync pending',
  SYNCED: 'CRM synced',
  FAILED: 'CRM sync failed',
  SKIPPED: 'CRM sync skipped',
};

export function CrmSyncBadge({ crmSync }: { crmSync: SessionLineView['crmSync'] }) {
  if (!crmSync) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-400">
        <span className="h-1.5 w-1.5 rounded-full bg-neutral-300" />
        No CRM sync yet
      </span>
    );
  }

  return (
    <div className="flex flex-col items-start gap-0.5">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${STYLES[crmSync.state]}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${DOT_STYLES[crmSync.state]}`} />
        {LABELS[crmSync.state]}
      </span>
      {crmSync.activityId && (
        <span className="pl-1 font-mono text-[11px] leading-tight text-neutral-400">{crmSync.activityId}</span>
      )}
    </div>
  );
}
