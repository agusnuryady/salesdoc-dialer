import type { CallStatus, DialerSessionMetrics, DialerSessionStatus } from '../domain/types';
import type { CrmSyncState } from '../dialer/crm-sync-service';

export interface SessionLineView {
  callId: string;
  lead: { id: string; name: string; phone: string; company: string };
  status: CallStatus | 'DIALING';
  startedAt: string;
  endedAt: string | null;
  isWinner: boolean;
  /** null while the line hasn't reached a terminal outcome yet — sync hasn't been attempted. */
  crmSync: { state: CrmSyncState; activityId: string | null } | null;
}

export interface SessionView {
  id: string;
  agentId: string;
  status: DialerSessionStatus;
  metrics: DialerSessionMetrics;
  winnerCallId: string | null;
  queueRemaining: number;
  /** The 0-2 currently active line slots — for the "two lines side by side" view. */
  lines: SessionLineView[];
  /**
   * Every call made in this session so far, oldest first, including ones no
   * longer active. `lines` is a snapshot that a terminated call disappears
   * from within one tick; this is what makes each call's CRM sync outcome
   * stay visible for the life of the session instead of flashing by.
   */
  calls: SessionLineView[];
}
