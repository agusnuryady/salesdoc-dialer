import { config } from '../config';
import { generateId } from '../domain/ids';
import type { Call, CallStatus, CRMActivity, Lead } from '../domain/types';
import type { MockCrmClient } from '../crm/mock-crm-client';
import type { CrmActivityRepository, LeadRepository } from '../repositories/interfaces';
import type { TerminalCallEvent } from './dialer-engine';

const DISPOSITIONS: Record<CallStatus, string> = {
  CONNECTED: 'Connected',
  NO_ANSWER: 'No Answer',
  BUSY: 'Busy',
  VOICEMAIL: 'Voicemail',
  CANCELED_BY_DIALER: 'Canceled by Dialer',
};

export type CrmSyncState = 'PENDING' | 'SYNCED' | 'FAILED' | 'SKIPPED';

export interface CrmSyncDeps {
  leadRepo: LeadRepository;
  appActivityRepo: CrmActivityRepository;
  mockCrmClient: MockCrmClient;
}

export interface SyncResult {
  activity: CRMActivity | null;
  created: boolean;
}

/**
 * The ONLY way a terminal call is allowed to reach the CRM. Both activity
 * stores (app-side and mock-crm-side) only expose upsertIfAbsent as a write
 * path, and this is the only module that calls either of them — so there is
 * no code path in the app that can create a CRMActivity without going
 * through the idempotency check below first.
 */
export class CrmSyncService {
  private readonly failedCallIds = new Set<string>();

  constructor(private readonly deps: CrmSyncDeps) {}

  /** Wired as DialerEngine's onTerminalCall hook — fire-and-forget from the engine's perspective. */
  handleTerminalCall = (event: TerminalCallEvent): void => {
    void this.syncTerminalCall(event.call, event.lead).catch((error: unknown) => {
      this.failedCallIds.add(event.call.id);
      console.error(`CRM sync failed for call ${event.call.id}:`, error);
    });
  };

  getSyncState(callId: string, callStatus: CallStatus): CrmSyncState {
    if (this.deps.appActivityRepo.getByCallId(callId)) return 'SYNCED';
    if (callStatus === 'CANCELED_BY_DIALER' && !config.syncCanceledByDialer) return 'SKIPPED';
    if (this.failedCallIds.has(callId)) return 'FAILED';
    return 'PENDING';
  }

  getActivityId(callId: string): string | null {
    return this.deps.appActivityRepo.getByCallId(callId)?.id ?? null;
  }

  /**
   * Public so it can be awaited directly (tests, the idempotency proof, and
   * `handleTerminalCall` above all go through this one method).
   */
  async syncTerminalCall(call: Call, lead: Lead): Promise<SyncResult> {
    if (!call.status) {
      throw new Error(`syncTerminalCall called on non-terminal call ${call.id}`);
    }
    if (call.status === 'CANCELED_BY_DIALER' && !config.syncCanceledByDialer) {
      return { activity: null, created: false };
    }

    // Idempotency check happens first, before any write (contact upsert
    // included) is attempted — a duplicate delivery short-circuits here.
    const existing = this.deps.appActivityRepo.getByCallId(call.id);
    if (existing) return { activity: existing, created: false };

    const disposition = DISPOSITIONS[call.status];

    const contact = await this.deps.mockCrmClient.upsertContact({
      externalId: lead.crmExternalId,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      company: lead.company,
    });

    if (!lead.crmExternalId) {
      this.deps.leadRepo.update(lead.id, { crmExternalId: contact.id });
    }

    const notes = `Call to ${lead.name} at ${lead.company} — ${disposition.toLowerCase()}.`;

    // Final atomic reservation: guards the true race of two concurrent
    // syncTerminalCall calls for the same callId (the engine should never
    // produce that, but this method doesn't rely on the engine to be right).
    const { activity, created } = this.deps.appActivityRepo.upsertIfAbsent(call.id, () => ({
      id: generateId('activity'),
      leadId: lead.id,
      crmExternalId: contact.id,
      type: 'CALL',
      callId: call.id,
      disposition,
      notes,
      createdAt: new Date().toISOString(),
    }));
    if (!created) return { activity, created: false };

    await this.deps.mockCrmClient.createActivity({
      callId: call.id,
      contactId: contact.id,
      disposition,
      notes,
    });

    return { activity, created: true };
  }
}
