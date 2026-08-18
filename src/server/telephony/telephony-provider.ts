export type SimulatedOutcome = 'CONNECTED' | 'NO_ANSWER' | 'BUSY' | 'VOICEMAIL';

export interface DialOutcomeSchedule {
  providerCallId: string;
  outcome: SimulatedOutcome;
  /** Epoch ms at which this dial's outcome becomes known. */
  resolveAt: number;
  /** Present only when outcome === 'CONNECTED'; how long the talk phase lasts. */
  talkDurationMs?: number;
}

/**
 * Scope note (see NOTES.md "How this maps to V2" for the fuller mapping):
 * this interface proves the dialer engine's orchestration logic can be
 * decoupled from how a call actually connects — a real seam, since a
 * different implementation only has to satisfy dial()/cancel(). It proves
 * nothing about live in-call behavior: dial() returns one precomputed
 * outcome, not an event stream, so there is no vocabulary here for mid-call
 * state, external media injection, or gatekeeper/IVR navigation. A telephony
 * core with that vocabulary is a new interface, not an extension of this one.
 */
export interface TelephonyProvider {
  dial(params: { leadId: string; callId: string }): DialOutcomeSchedule;
  cancel(providerCallId: string): void;
}
