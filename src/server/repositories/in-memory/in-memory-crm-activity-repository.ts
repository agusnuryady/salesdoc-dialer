import type { CRMActivity } from '../../domain/types';
import type { CrmActivityRepository } from '../interfaces';

export class InMemoryCrmActivityRepository implements CrmActivityRepository {
  // Keyed directly by callId — the idempotency key IS the storage key, so a
  // duplicate write is structurally a no-op rather than something that has
  // to be separately checked for.
  private readonly activitiesByCallId = new Map<string, CRMActivity>();

  upsertIfAbsent(callId: string, factory: () => CRMActivity): { activity: CRMActivity; created: boolean } {
    const existing = this.activitiesByCallId.get(callId);
    if (existing) return { activity: existing, created: false };
    const activity = factory();
    this.activitiesByCallId.set(callId, activity);
    return { activity, created: true };
  }

  getByCallId(callId: string): CRMActivity | undefined {
    return this.activitiesByCallId.get(callId);
  }

  listByLead(leadId: string): CRMActivity[] {
    return [...this.activitiesByCallId.values()].filter((activity) => activity.leadId === leadId);
  }

  listAll(): CRMActivity[] {
    return [...this.activitiesByCallId.values()];
  }
}
