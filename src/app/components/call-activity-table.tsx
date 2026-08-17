import type { SessionLineView } from '@/server/dto/session-view';
import { CrmSyncBadge } from './crm-sync-badge';

const OUTCOME_LABELS: Record<string, string> = {
  DIALING: 'Dialing…',
  CONNECTED: 'Connected',
  NO_ANSWER: 'No Answer',
  BUSY: 'Busy',
  VOICEMAIL: 'Voicemail',
  CANCELED_BY_DIALER: 'Canceled by Dialer',
};

export function CallActivityTable({ calls }: { calls: SessionLineView[] }) {
  const ordered = [...calls].reverse();

  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        Call activity &amp; CRM sync
      </h2>
      <div className="mt-3 overflow-hidden rounded-lg border border-neutral-200 bg-white">
        {ordered.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-neutral-400">No calls yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Lead</th>
                <th className="px-4 py-2 font-medium">Outcome</th>
                <th className="px-4 py-2 font-medium">CRM sync</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {ordered.map((call) => (
                <tr key={call.callId} className={call.isWinner ? 'bg-emerald-50/60' : undefined}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-neutral-900">{call.lead.name}</p>
                    <p className="text-xs text-neutral-500">{call.lead.company}</p>
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{OUTCOME_LABELS[call.status]}</td>
                  <td className="px-4 py-3">
                    <CrmSyncBadge crmSync={call.crmSync} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
