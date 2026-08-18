export interface Lead {
  id: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  crmExternalId?: string;
}

export type CallStatus =
  | 'CONNECTED'
  | 'NO_ANSWER'
  | 'BUSY'
  | 'VOICEMAIL'
  | 'CANCELED_BY_DIALER';

export interface Call {
  id: string;
  leadId: string;
  sessionId: string;
  /**
   * Undefined while the line is still ringing / in progress. Only ever set to
   * one of the five terminal CallStatus values once an outcome is known — see
   * PLAN.md §0.1 for why this deviates from a plain required CallStatus.
   */
  status?: CallStatus;
  startedAt: string;
  endedAt?: string;
  providerCallId: string;
}

export type DialerSessionStatus = 'RUNNING' | 'STOPPED';

export interface DialerSessionMetrics {
  attempted: number;
  connected: number;
  failed: number;
  canceled: number;
}

export interface DialerSession {
  id: string;
  agentId: string;
  leadQueue: string[];
  /**
   * Fixed at 2 by the Part 1 brief — a literal constant, not a capacity or
   * pacing setting. Not evidence toward V2's capacity-aware dialing
   * capability: see NOTES.md "How this maps to V2".
   */
  concurrency: 2;
  activeCallIds: string[];
  winnerCallId: string | null;
  status: DialerSessionStatus;
  metrics: DialerSessionMetrics;
}

export type CrmActivityType = 'CALL';

export interface CRMActivity {
  id: string;
  leadId: string;
  crmExternalId: string;
  type: CrmActivityType;
  callId: string;
  disposition: string;
  notes: string;
  createdAt: string;
}
