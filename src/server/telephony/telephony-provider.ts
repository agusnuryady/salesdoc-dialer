export type SimulatedOutcome = 'CONNECTED' | 'NO_ANSWER' | 'BUSY' | 'VOICEMAIL';

export interface DialOutcomeSchedule {
  providerCallId: string;
  outcome: SimulatedOutcome;
  /** Epoch ms at which this dial's outcome becomes known. */
  resolveAt: number;
  /** Present only when outcome === 'CONNECTED'; how long the talk phase lasts. */
  talkDurationMs?: number;
}

export interface TelephonyProvider {
  dial(params: { leadId: string; callId: string }): DialOutcomeSchedule;
  cancel(providerCallId: string): void;
}
