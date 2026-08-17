import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEngineHarness } from '../test-support/harness';
import { ScriptedProvider } from '../test-support/scripted-provider';
import { SimulatedProvider } from '../telephony/simulated-provider';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('winner selection race', () => {
  it('picks exactly one winner when both lines resolve CONNECTED in the same tick; the loser is CANCELED_BY_DIALER and requeued once', async () => {
    const provider = new ScriptedProvider([
      { outcome: 'CONNECTED', relativeDelayMs: 50, talkDurationMs: 100 }, // lead_1
      { outcome: 'CONNECTED', relativeDelayMs: 50, talkDurationMs: 100 }, // lead_2 — same resolveAt
    ]);
    const { engine, sessionRepo, callRepo } = createEngineHarness(provider);

    const session = engine.createSession('agent_1', ['lead_1', 'lead_2']);
    engine.startSession(session.id);
    engine.start();

    await vi.advanceTimersByTimeAsync(60); // past resolveAt=50, before talkEndAt=150

    const finalSession = sessionRepo.getById(session.id)!;
    const calls = callRepo.listBySession(session.id);
    const connected = calls.filter((c) => c.status === 'CONNECTED');
    const canceled = calls.filter((c) => c.status === 'CANCELED_BY_DIALER');

    expect(connected).toHaveLength(1);
    expect(canceled).toHaveLength(1);
    expect(finalSession.winnerCallId).toBe(connected[0]!.id);
    expect(finalSession.metrics.connected).toBe(1);
    expect(finalSession.metrics.canceled).toBe(1);
    // the loser goes back to the queue exactly once, and the second slot
    // stays empty (not backfilled) while the winner is still talking
    expect(finalSession.leadQueue).toEqual([canceled[0]!.leadId]);
    expect(finalSession.activeCallIds).toEqual([finalSession.winnerCallId]);

    engine.stop();
  });
});

describe('requeue cap', () => {
  it('requeues a preempted lead exactly once — a second preemption drops it permanently', async () => {
    // lead_1 connects immediately and preempts lead_2 (1st loss -> requeued).
    // Once lead_1's talk ends, the queue ([lead_3, lead_2]) refills as a pair:
    // lead_3 connects and preempts lead_2's SECOND attempt (2nd loss -> must
    // NOT be requeued again, since requeueCap is 1).
    const provider = new ScriptedProvider([
      { outcome: 'CONNECTED', relativeDelayMs: 50, talkDurationMs: 50 }, // 0: lead_1
      { outcome: 'NO_ANSWER', relativeDelayMs: 10_000 }, // 1: lead_2 (1st attempt) — preempted well before this resolves
      { outcome: 'CONNECTED', relativeDelayMs: 50, talkDurationMs: 50 }, // 2: lead_3
      { outcome: 'NO_ANSWER', relativeDelayMs: 10_000 }, // 3: lead_2 (2nd attempt) — preempted again
    ]);
    const { engine, sessionRepo, callRepo } = createEngineHarness(provider);

    const session = engine.createSession('agent_1', ['lead_1', 'lead_2', 'lead_3']);
    engine.startSession(session.id);
    engine.start();

    await vi.advanceTimersByTimeAsync(220);

    const finalSession = sessionRepo.getById(session.id)!;
    const lead2Calls = callRepo.listBySession(session.id).filter((c) => c.leadId === 'lead_2');

    expect(lead2Calls).toHaveLength(2);
    expect(lead2Calls.every((c) => c.status === 'CANCELED_BY_DIALER')).toBe(true);
    expect(finalSession.status).toBe('STOPPED');
    expect(finalSession.leadQueue).toEqual([]); // never requeued a third time
    expect(finalSession.metrics.canceled).toBe(2);
    expect(finalSession.metrics.connected).toBe(2); // lead_1 and lead_3

    engine.stop();
  });
});

describe('stopSession', () => {
  it('cancels active calls mid-ring and moves the session to STOPPED', async () => {
    const provider = new ScriptedProvider([
      { outcome: 'CONNECTED', relativeDelayMs: 1000, talkDurationMs: 1000 },
      { outcome: 'NO_ANSWER', relativeDelayMs: 1000 },
    ]);
    const { engine, sessionRepo, callRepo } = createEngineHarness(provider);

    const session = engine.createSession('agent_1', ['lead_1', 'lead_2']);
    engine.startSession(session.id);
    engine.start();

    await vi.advanceTimersByTimeAsync(50); // both lines still mid-ring, well before resolveAt=1000

    expect(sessionRepo.getById(session.id)!.activeCallIds).toHaveLength(2);

    const stopped = engine.stopSession(session.id);

    expect(stopped.status).toBe('STOPPED');
    expect(stopped.activeCallIds).toEqual([]);
    expect(stopped.winnerCallId).toBeNull();

    const calls = callRepo.listBySession(session.id);
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.status === 'CANCELED_BY_DIALER' && c.endedAt !== undefined)).toBe(true);

    // stopping doesn't leave the tick loop able to revive the session
    await vi.advanceTimersByTimeAsync(2000);
    expect(sessionRepo.getById(session.id)!.status).toBe('STOPPED');
    expect(callRepo.listBySession(session.id)).toHaveLength(2); // no new dials after stop

    engine.stop();
  });
});

describe('queue exhaustion', () => {
  it('drains the whole queue and stops cleanly with no orphaned active calls', async () => {
    const leads = ['lead_1', 'lead_2', 'lead_3', 'lead_4', 'lead_5'];
    const provider = new ScriptedProvider(leads.map(() => ({ outcome: 'NO_ANSWER' as const, relativeDelayMs: 20 })));
    const { engine, sessionRepo, callRepo } = createEngineHarness(provider);

    const session = engine.createSession('agent_1', leads);
    engine.startSession(session.id);
    engine.start();

    await vi.advanceTimersByTimeAsync(200);

    const finalSession = sessionRepo.getById(session.id)!;
    expect(finalSession.status).toBe('STOPPED');
    expect(finalSession.activeCallIds).toEqual([]);
    expect(finalSession.winnerCallId).toBeNull();
    expect(finalSession.leadQueue).toEqual([]);

    const calls = callRepo.listBySession(session.id);
    expect(calls).toHaveLength(5);
    expect(calls.every((c) => c.status !== undefined && c.endedAt !== undefined)).toBe(true);

    engine.stop();
  });
});

describe('concurrency invariant', () => {
  it('never runs more than 2 concurrent active calls across a full seeded session, using the seeded SimulatedProvider', async () => {
    const provider = new SimulatedProvider({
      seed: 20260818,
      ringDelayMsRange: [20, 60],
      talkDurationMsRange: [20, 60],
      outcomeWeights: { CONNECTED: 25, NO_ANSWER: 25, BUSY: 25, VOICEMAIL: 25 },
    });
    const { engine, sessionRepo, leadRepo } = createEngineHarness(provider, { tickIntervalMs: 10 });
    const leadIds = leadRepo.getAll().map((lead) => lead.id);

    const session = engine.createSession('agent_1', leadIds);
    engine.startSession(session.id);
    engine.start();

    const TICK_MS = 10;
    const MAX_TICKS = 2000; // 20s of virtual time — generous upper bound
    let stopped = false;
    let observedMax = 0;

    for (let tick = 0; tick < MAX_TICKS; tick++) {
      await vi.advanceTimersByTimeAsync(TICK_MS);
      const current = sessionRepo.getById(session.id)!;
      observedMax = Math.max(observedMax, current.activeCallIds.length);
      expect(current.activeCallIds.length).toBeLessThanOrEqual(2);
      if (current.status === 'STOPPED') {
        stopped = true;
        break;
      }
    }

    expect(stopped).toBe(true); // guards against a bug that silently never terminates
    expect(observedMax).toBeGreaterThan(0); // sanity: the session actually ran calls

    engine.stop();
  });
});
