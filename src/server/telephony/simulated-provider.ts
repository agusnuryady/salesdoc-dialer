import { createRng, randomInRange, weightedPick, type Rng } from './rng';
import type { DialOutcomeSchedule, SimulatedOutcome, TelephonyProvider } from './telephony-provider';

export interface SimulatedProviderConfig {
  seed: number;
  ringDelayMsRange: [number, number];
  talkDurationMsRange: [number, number];
  outcomeWeights: Record<SimulatedOutcome, number>;
  /** 0-based dial index (per provider instance) that is always forced to CONNECTED. */
  guaranteedConnectOnDialIndex?: number;
  guaranteedConnectDelayMs?: number;
}

export class SimulatedProvider implements TelephonyProvider {
  private readonly rng: Rng;
  private dialCount = 0;

  constructor(private readonly config: SimulatedProviderConfig) {
    this.rng = createRng(config.seed);
  }

  dial({ callId }: { leadId: string; callId: string }): DialOutcomeSchedule {
    const providerCallId = `sim_${callId}`;
    const dialIndex = this.dialCount++;
    const now = Date.now();

    if (dialIndex === this.config.guaranteedConnectOnDialIndex) {
      const delay = this.config.guaranteedConnectDelayMs ?? 2000;
      return {
        providerCallId,
        outcome: 'CONNECTED',
        resolveAt: now + delay,
        talkDurationMs: randomInRange(this.rng, this.config.talkDurationMsRange),
      };
    }

    const outcome = weightedPick(this.rng, this.config.outcomeWeights);
    const ringDelay = randomInRange(this.rng, this.config.ringDelayMsRange);
    return {
      providerCallId,
      outcome,
      resolveAt: now + ringDelay,
      talkDurationMs:
        outcome === 'CONNECTED' ? randomInRange(this.rng, this.config.talkDurationMsRange) : undefined,
    };
  }

  cancel(): void {
    // No-op: a real provider would tell the carrier to drop the line here.
    // The simulated one has nothing to notify — the engine is already
    // authoritative about the call being over the moment it calls this.
  }
}
