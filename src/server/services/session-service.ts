import { getCallRepo, getCrmSyncService, getEngine, getLeadRepo, getSessionRepo } from '../bootstrap';
import { NotFoundError, ValidationError } from '../domain/errors';
import type { Call, DialerSession } from '../domain/types';
import type { SessionLineView, SessionView } from '../dto/session-view';

export function createSession(agentId: string, leadIds: string[]): DialerSession {
  const leadRepo = getLeadRepo();
  const unknownLeadIds = leadIds.filter((id) => !leadRepo.getById(id));
  if (unknownLeadIds.length > 0) {
    throw new ValidationError(`Unknown lead id(s): ${unknownLeadIds.join(', ')}`);
  }
  return getEngine().createSession(agentId, leadIds);
}

export function startSession(sessionId: string): SessionView {
  getEngine().startSession(sessionId);
  return getSessionView(sessionId);
}

export function stopSession(sessionId: string): SessionView {
  getEngine().stopSession(sessionId);
  return getSessionView(sessionId);
}

export function getSessionView(sessionId: string): SessionView {
  const session = getSessionRepo().getById(sessionId);
  if (!session) throw new NotFoundError(`DialerSession ${sessionId} not found`);

  const callRepo = getCallRepo();
  const leadRepo = getLeadRepo();
  const crmSync = getCrmSyncService();

  const toLineView = (call: Call): SessionLineView => {
    const lead = leadRepo.getById(call.leadId);
    if (!lead) throw new NotFoundError(`Lead ${call.leadId} not found`);

    return {
      callId: call.id,
      lead: { id: lead.id, name: lead.name, phone: lead.phone, company: lead.company },
      status: call.status ?? 'DIALING',
      startedAt: call.startedAt,
      endedAt: call.endedAt ?? null,
      isWinner: session.winnerCallId === call.id,
      crmSync:
        call.status && call.endedAt
          ? { state: crmSync.getSyncState(call.id, call.status), activityId: crmSync.getActivityId(call.id) }
          : null,
    };
  };

  const calls = callRepo
    .listBySession(sessionId)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .map(toLineView);
  const callsById = new Map(calls.map((call) => [call.callId, call]));
  const lines = session.activeCallIds.map((callId) => {
    const line = callsById.get(callId);
    if (!line) throw new NotFoundError(`Call ${callId} not found`);
    return line;
  });

  return {
    id: session.id,
    agentId: session.agentId,
    status: session.status,
    metrics: session.metrics,
    winnerCallId: session.winnerCallId,
    queueRemaining: session.leadQueue.length,
    lines,
    calls,
  };
}
