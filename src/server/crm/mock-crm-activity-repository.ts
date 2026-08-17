import type { MockCrmActivity } from './mock-crm-types';

/**
 * Same upsertIfAbsent-only shape as the app-side CrmActivityRepository, and
 * deliberately not the same interface/instance — this is a second, separate
 * idempotency boundary belonging to the external system, not a re-export of
 * the app's one. See mock-crm-client.ts for the only caller.
 */
export interface MockCrmActivityRepository {
  upsertIfAbsent(
    callId: string,
    factory: () => MockCrmActivity,
  ): { activity: MockCrmActivity; created: boolean };
  listAll(): MockCrmActivity[];
}

export class InMemoryMockCrmActivityRepository implements MockCrmActivityRepository {
  private readonly activitiesByCallId = new Map<string, MockCrmActivity>();

  upsertIfAbsent(
    callId: string,
    factory: () => MockCrmActivity,
  ): { activity: MockCrmActivity; created: boolean } {
    const existing = this.activitiesByCallId.get(callId);
    if (existing) return { activity: existing, created: false };
    const activity = factory();
    this.activitiesByCallId.set(callId, activity);
    return { activity, created: true };
  }

  listAll(): MockCrmActivity[] {
    return [...this.activitiesByCallId.values()];
  }
}
