import type { SimulatedOutcome } from '../telephony/telephony-provider';

/**
 * Per-line scheduling bookkeeping. Deliberately NOT part of the persisted
 * domain model (PLAN.md §1) — it only exists while a line is active and is
 * thrown away once the line goes terminal.
 */
export interface LineState {
  callId: string;
  leadId: string;
  providerCallId: string;
  resolveAt: number;
  outcome: SimulatedOutcome;
  talkDurationMs?: number;
  /** Set once the line's outcome is applied as CONNECTED; the winner's hang-up time. */
  talkEndAt?: number;
}

export interface EngineSessionState {
  sessionId: string;
  lines: Map<string, LineState>;
  /** How many times each lead has been requeued after a preemption, this session. */
  requeueCounts: Map<string, number>;
}

export function createEngineSessionState(sessionId: string): EngineSessionState {
  return { sessionId, lines: new Map(), requeueCounts: new Map() };
}
