import type { Call, CRMActivity, DialerSession, Lead } from '../domain/types';

export interface LeadRepository {
  getAll(): Lead[];
  getById(id: string): Lead | undefined;
  update(id: string, patch: Partial<Lead>): Lead;
}

export interface CallRepository {
  create(call: Call): Call;
  getById(id: string): Call | undefined;
  update(id: string, patch: Partial<Call>): Call;
  listBySession(sessionId: string): Call[];
}

export interface DialerSessionRepository {
  create(session: DialerSession): DialerSession;
  getById(id: string): DialerSession | undefined;
  update(id: string, patch: Partial<DialerSession>): DialerSession;
  listAll(): DialerSession[];
}

/**
 * The app's own CRMActivity store (as opposed to the mock CRM's activity
 * store — see src/server/crm/, a deliberately separate module/storage).
 * There is no plain `create`: `upsertIfAbsent` keyed on `callId` is the only
 * write path, so nothing can insert a duplicate by going around it.
 */
export interface CrmActivityRepository {
  upsertIfAbsent(callId: string, factory: () => CRMActivity): { activity: CRMActivity; created: boolean };
  getByCallId(callId: string): CRMActivity | undefined;
  listByLead(leadId: string): CRMActivity[];
  listAll(): CRMActivity[];
}
