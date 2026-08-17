import type { DialOutcomeSchedule, SimulatedOutcome, TelephonyProvider } from '../telephony/telephony-provider';

export interface ScriptedDialEntry {
  outcome: SimulatedOutcome;
  /** Delay from the moment `dial()` is called, not an absolute timestamp — keeps entries valid regardless of tick granularity. */
  relativeDelayMs: number;
  talkDurationMs?: number;
}

/**
 * A hand-scripted TelephonyProvider for tests that need to force an exact
 * sequence of outcomes/timings (e.g. two lines resolving CONNECTED in the
 * same tick) — the kind of precise control SimulatedProvider's weighted RNG
 * can't reliably guarantee via seed selection alone.
 */
export class ScriptedProvider implements TelephonyProvider {
  private index = 0;
  readonly canceledProviderCallIds = new Set<string>();

  constructor(private readonly schedule: ScriptedDialEntry[]) {}

  dial({ callId }: { leadId: string; callId: string }): DialOutcomeSchedule {
    const entry = this.schedule[this.index];
    if (!entry) {
      throw new Error(`ScriptedProvider: no schedule entry for dial #${this.index} (callId=${callId})`);
    }
    this.index++;
    return {
      providerCallId: `scripted_${callId}`,
      outcome: entry.outcome,
      resolveAt: Date.now() + entry.relativeDelayMs,
      talkDurationMs: entry.talkDurationMs,
    };
  }

  cancel(providerCallId: string): void {
    this.canceledProviderCallIds.add(providerCallId);
  }
}
