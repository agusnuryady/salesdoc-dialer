import { describe, expect, it } from 'vitest';
import { InMemoryMockCrmActivityRepository } from '../crm/mock-crm-activity-repository';
import { InMemoryMockCrmContactRepository } from '../crm/mock-crm-contact-repository';
import { SimulatedMockCrmClient } from '../crm/mock-crm-client';
import { CrmSyncService } from '../dialer/crm-sync-service';
import { NotFoundError } from '../domain/errors';
import type { Call, Lead } from '../domain/types';
import { InMemoryCrmActivityRepository } from './in-memory/in-memory-crm-activity-repository';
import type { LeadRepository } from './interfaces';

/**
 * Test-only second LeadRepository implementation — array-backed with linear
 * lookup, deliberately unlike InMemoryLeadRepository's Map-backed O(1)
 * lookup. Exists to prove the interface boundary is genuinely swappable
 * (PLAN.md's "the ONE file a Postgres swap would touch" claim, and NOTES.md's
 * "How this maps to V2" — the same discipline V2's Lead-management
 * integration capability needs), not just typed that way with only one
 * implementation ever exercised.
 */
class ArrayBackedLeadRepository implements LeadRepository {
  private leads: Lead[];

  constructor(initial: Lead[]) {
    this.leads = [...initial];
  }

  getAll(): Lead[] {
    return [...this.leads];
  }

  getById(id: string): Lead | undefined {
    return this.leads.find((lead) => lead.id === id);
  }

  update(id: string, patch: Partial<Lead>): Lead {
    const index = this.leads.findIndex((lead) => lead.id === id);
    if (index === -1) throw new NotFoundError(`Lead ${id} not found`);
    const existing = this.leads[index]!;
    const updated = { ...existing, ...patch };
    this.leads = [...this.leads.slice(0, index), updated, ...this.leads.slice(index + 1)];
    return updated;
  }
}

function makeTerminalCall(id: string, leadId: string): Call {
  const now = new Date().toISOString();
  return {
    id,
    leadId,
    sessionId: 'session_swap_test',
    status: 'CONNECTED',
    startedAt: now,
    endedAt: now,
    providerCallId: `sim_${id}`,
  };
}

describe('LeadRepository interface swap', () => {
  it('CrmSyncService behaves identically against an array-backed LeadRepository, not just the Map-backed one', async () => {
    const lead: Lead = {
      id: 'lead_swap_1',
      name: 'Test Lead',
      company: 'Test Co',
      phone: '+1-555-0100',
      email: 'test@example.com',
    };
    const leadRepo = new ArrayBackedLeadRepository([lead]);
    const appActivityRepo = new InMemoryCrmActivityRepository();
    const mockContactRepo = new InMemoryMockCrmContactRepository();
    const mockActivityRepo = new InMemoryMockCrmActivityRepository();
    const mockCrmClient = new SimulatedMockCrmClient(mockContactRepo, mockActivityRepo);
    const crmSync = new CrmSyncService({ leadRepo, appActivityRepo, mockCrmClient });

    expect(leadRepo.getById('lead_swap_1')?.crmExternalId).toBeUndefined();

    const call = makeTerminalCall('call_swap_1', lead.id);
    const result = await crmSync.syncTerminalCall(call, leadRepo.getById(lead.id)!);

    // Same outcomes CrmSyncService's own tests assert against the Map-backed
    // repository — nothing here is specific to Map semantics.
    expect(result.created).toBe(true);
    expect(result.activity?.disposition).toBe('Connected');
    expect(leadRepo.getById(lead.id)?.crmExternalId).toBeDefined();
    expect(mockContactRepo.listAll()).toHaveLength(1);

    // Idempotency holds identically too: a second delivery of the same
    // callId is a no-op against this repository, same as against the
    // Map-backed one.
    const second = await crmSync.syncTerminalCall(call, leadRepo.getById(lead.id)!);
    expect(second.created).toBe(false);
    expect(second.activity?.id).toBe(result.activity?.id);
    expect(appActivityRepo.listAll()).toHaveLength(1);
  });
});
