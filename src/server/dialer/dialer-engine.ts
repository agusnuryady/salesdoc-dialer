import { NotFoundError } from '../domain/errors';
import { generateId } from '../domain/ids';
import type { Call, CallStatus, DialerSession, Lead } from '../domain/types';
import type { CallRepository, DialerSessionRepository, LeadRepository } from '../repositories/interfaces';
import type { TelephonyProvider } from '../telephony/telephony-provider';
import { createEngineSessionState, type EngineSessionState, type LineState } from './engine-state';

export interface TerminalCallEvent {
  call: Call;
  lead: Lead;
}

export interface DialerEngineConfig {
  tickIntervalMs: number;
  requeueCap: number;
}

export interface DialerEngineDeps {
  sessionRepo: DialerSessionRepository;
  callRepo: CallRepository;
  leadRepo: LeadRepository;
  provider: TelephonyProvider;
  config: DialerEngineConfig;
  /** Extension point for the CRM layer (not wired in this increment). */
  onTerminalCall?: (event: TerminalCallEvent) => void;
}

/**
 * The single ticking state machine for all dialer sessions in this process.
 * One DialerEngine instance per process (see bootstrap.ts globalThis pinning) —
 * it is the only thing in the codebase allowed to mutate an active call's
 * status or a session's activeCallIds/winnerCallId/leadQueue.
 */
export class DialerEngine {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly sessionStates = new Map<string, EngineSessionState>();

  constructor(private readonly deps: DialerEngineDeps) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.deps.config.tickIntervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  createSession(agentId: string, leadIds: string[]): DialerSession {
    const session: DialerSession = {
      id: generateId('session'),
      agentId,
      leadQueue: [...leadIds],
      concurrency: 2,
      activeCallIds: [],
      winnerCallId: null,
      status: 'STOPPED',
      metrics: { attempted: 0, connected: 0, failed: 0, canceled: 0 },
    };
    return this.deps.sessionRepo.create(session);
  }

  startSession(sessionId: string): DialerSession {
    const session = this.getSessionOrThrow(sessionId);
    if (session.status === 'RUNNING') return session;

    this.sessionStates.set(sessionId, createEngineSessionState(sessionId));
    let current = this.deps.sessionRepo.update(sessionId, { status: 'RUNNING' });
    current = this.refill(current, this.sessionStates.get(sessionId)!);
    return current;
  }

  stopSession(sessionId: string): DialerSession {
    const session = this.getSessionOrThrow(sessionId);
    if (session.status === 'STOPPED') return session;

    const state = this.sessionStates.get(sessionId);
    let current = session;
    if (state) {
      for (const callId of [...current.activeCallIds]) {
        current = this.terminateLine(current, state, callId, 'CANCELED_BY_DIALER', { requeue: false });
      }
    }
    this.sessionStates.delete(sessionId);
    return this.deps.sessionRepo.update(sessionId, {
      status: 'STOPPED',
      winnerCallId: null,
      activeCallIds: [],
    });
  }

  private getSessionOrThrow(sessionId: string): DialerSession {
    const session = this.deps.sessionRepo.getById(sessionId);
    if (!session) throw new NotFoundError(`DialerSession ${sessionId} not found`);
    return session;
  }

  private tick(): void {
    const now = Date.now();
    for (const session of this.deps.sessionRepo.listAll()) {
      if (session.status !== 'RUNNING') continue;
      this.advanceSession(session, now);
    }
  }

  /**
   * One tick's worth of state transitions for a single session. Processes
   * activeCallIds in a fixed order (the order they appear in the array) so
   * that when two lines resolve in the same tick, resolution is deterministic
   * — see the class-level doc and PLAN.md §2 for the connect-vs-connect and
   * connect-vs-mid-ring races this ordering exists to resolve.
   */
  private advanceSession(session: DialerSession, now: number): void {
    const state = this.sessionStates.get(session.id);
    if (!state) return;

    let current = session;
    let winnerDecidedThisTick = false;

    for (const callId of [...current.activeCallIds]) {
      const line = state.lines.get(callId);
      if (!line) continue;

      if (current.winnerCallId === callId) {
        if (line.talkEndAt !== undefined && now >= line.talkEndAt) {
          current = this.terminateLine(current, state, callId, 'CONNECTED', { requeue: false });
        }
        continue;
      }

      // A winner already exists — either from a previous tick, or decided
      // moments ago in this same loop iteration. This line loses regardless
      // of whether its own resolveAt has passed, and regardless of what its
      // own predetermined outcome was going to be.
      if (current.winnerCallId !== null || winnerDecidedThisTick) {
        current = this.terminateLine(current, state, callId, 'CANCELED_BY_DIALER', { requeue: true });
        continue;
      }

      if (now >= line.resolveAt) {
        if (line.outcome === 'CONNECTED') {
          current = this.applyWinner(current, state, callId, line, now);
          winnerDecidedThisTick = true;
        } else {
          current = this.terminateLine(current, state, callId, line.outcome, { requeue: false });
        }
      }
    }

    current = this.refill(current, state);

    if (
      current.status === 'RUNNING' &&
      current.winnerCallId === null &&
      current.activeCallIds.length === 0 &&
      current.leadQueue.length === 0
    ) {
      this.sessionStates.delete(current.id);
      this.deps.sessionRepo.update(current.id, { status: 'STOPPED' });
    }
  }

  private applyWinner(
    session: DialerSession,
    state: EngineSessionState,
    callId: string,
    line: LineState,
    now: number,
  ): DialerSession {
    line.talkEndAt = now + (line.talkDurationMs ?? 0);
    this.deps.callRepo.update(callId, { status: 'CONNECTED' });
    const metrics = { ...session.metrics, connected: session.metrics.connected + 1 };
    return this.deps.sessionRepo.update(session.id, { winnerCallId: callId, metrics });
  }

  /**
   * Moves one line to a terminal status: updates the Call, updates session
   * metrics/activeCallIds/winnerCallId, optionally requeues the lead (capped),
   * notifies the CRM extension point, and drops the line's scheduling state.
   */
  private terminateLine(
    session: DialerSession,
    state: EngineSessionState,
    callId: string,
    status: CallStatus,
    opts: { requeue: boolean },
  ): DialerSession {
    const call = this.deps.callRepo.getById(callId);
    if (!call) throw new NotFoundError(`Call ${callId} not found`);

    if (status === 'CANCELED_BY_DIALER') {
      this.deps.provider.cancel(call.providerCallId);
    }

    const updatedCall = this.deps.callRepo.update(callId, {
      status,
      endedAt: new Date().toISOString(),
    });
    state.lines.delete(callId);

    const activeCallIds = session.activeCallIds.filter((id) => id !== callId);
    const winnerCallId = session.winnerCallId === callId ? null : session.winnerCallId;

    const metrics = { ...session.metrics };
    if (status === 'CANCELED_BY_DIALER') {
      metrics.canceled += 1;
    } else if (status !== 'CONNECTED') {
      // CONNECTED is counted once in applyWinner, not again when the winner's
      // talk timer later closes the line out via this same method.
      metrics.failed += 1;
    }

    let leadQueue = session.leadQueue;
    if (opts.requeue) {
      const requeueCount = state.requeueCounts.get(updatedCall.leadId) ?? 0;
      if (requeueCount < this.deps.config.requeueCap) {
        state.requeueCounts.set(updatedCall.leadId, requeueCount + 1);
        leadQueue = [...leadQueue, updatedCall.leadId];
      }
    }

    const updatedSession = this.deps.sessionRepo.update(session.id, {
      activeCallIds,
      winnerCallId,
      leadQueue,
      metrics,
    });

    const lead = this.deps.leadRepo.getById(updatedCall.leadId);
    if (lead) this.deps.onTerminalCall?.({ call: updatedCall, lead });

    return updatedSession;
  }

  /**
   * Tops activeCallIds up to `concurrency` from the queue — but only when no
   * winner is live. While a winner is talking, the second slot is left
   * deliberately empty (PLAN.md §0.3): decision #1 dials "the next pair" only
   * once the winner ends, so both slots refill together at that point.
   */
  private refill(session: DialerSession, state: EngineSessionState): DialerSession {
    let current = session;
    if (current.winnerCallId !== null) return current;

    while (current.activeCallIds.length < current.concurrency && current.leadQueue.length > 0) {
      const [leadId, ...rest] = current.leadQueue;
      if (!leadId) break;
      current = this.deps.sessionRepo.update(current.id, { leadQueue: rest });
      current = this.dialLead(current, state, leadId);
    }
    return current;
  }

  private dialLead(session: DialerSession, state: EngineSessionState, leadId: string): DialerSession {
    const call: Call = {
      id: generateId('call'),
      leadId,
      sessionId: session.id,
      startedAt: new Date().toISOString(),
      providerCallId: '',
    };
    const created = this.deps.callRepo.create(call);
    const schedule = this.deps.provider.dial({ leadId, callId: created.id });
    this.deps.callRepo.update(created.id, { providerCallId: schedule.providerCallId });

    state.lines.set(created.id, {
      callId: created.id,
      leadId,
      providerCallId: schedule.providerCallId,
      resolveAt: schedule.resolveAt,
      outcome: schedule.outcome,
      talkDurationMs: schedule.talkDurationMs,
    });

    const metrics = { ...session.metrics, attempted: session.metrics.attempted + 1 };
    return this.deps.sessionRepo.update(session.id, {
      activeCallIds: [...session.activeCallIds, created.id],
      metrics,
    });
  }
}
