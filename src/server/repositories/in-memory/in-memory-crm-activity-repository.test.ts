import { describe, expect, it } from 'vitest';
import type { CRMActivity } from '../../domain/types';
import { InMemoryCrmActivityRepository } from './in-memory-crm-activity-repository';

function makeActivity(overrides: Partial<CRMActivity> = {}): CRMActivity {
  return {
    id: overrides.id ?? 'activity_x',
    leadId: overrides.leadId ?? 'lead_1',
    crmExternalId: overrides.crmExternalId ?? 'crmcontact_1',
    type: 'CALL',
    callId: overrides.callId ?? 'call_1',
    disposition: overrides.disposition ?? 'Connected',
    notes: overrides.notes ?? 'note',
    createdAt: overrides.createdAt ?? new Date().toISOString(),
  };
}

describe('InMemoryCrmActivityRepository.upsertIfAbsent', () => {
  it('stores the first write and ignores the second — even when the second factory would produce different content', () => {
    const repo = new InMemoryCrmActivityRepository();

    const first = repo.upsertIfAbsent('call_1', () => makeActivity({ id: 'activity_first', disposition: 'Connected' }));
    const second = repo.upsertIfAbsent('call_1', () => makeActivity({ id: 'activity_second', disposition: 'Busy' }));

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.activity.id).toBe('activity_first');
    expect(second.activity.disposition).toBe('Connected'); // the second factory's output was never stored
    expect(repo.listAll()).toHaveLength(1);
  });

  it('keeps independent callIds independent', () => {
    const repo = new InMemoryCrmActivityRepository();
    repo.upsertIfAbsent('call_1', () => makeActivity({ id: 'activity_1', callId: 'call_1' }));
    repo.upsertIfAbsent('call_2', () => makeActivity({ id: 'activity_2', callId: 'call_2' }));

    expect(repo.listAll()).toHaveLength(2);
  });
});
