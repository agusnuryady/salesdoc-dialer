import { describe, expect, it } from 'vitest';
import { InMemoryMockCrmActivityRepository } from '../crm/mock-crm-activity-repository';
import { InMemoryMockCrmContactRepository } from '../crm/mock-crm-contact-repository';
import { SimulatedMockCrmClient } from '../crm/mock-crm-client';
import type { Call, CallStatus } from '../domain/types';
import { InMemoryCrmActivityRepository } from '../repositories/in-memory/in-memory-crm-activity-repository';
import { InMemoryLeadRepository } from '../repositories/in-memory/in-memory-lead-repository';
import { seedLeads } from '../seed/seed-leads';
import { CrmSyncService } from './crm-sync-service';

function createHarness() {
  const leadRepo = new InMemoryLeadRepository(seedLeads());
  const appActivityRepo = new InMemoryCrmActivityRepository();
  const mockContactRepo = new InMemoryMockCrmContactRepository();
  const mockActivityRepo = new InMemoryMockCrmActivityRepository();
  const mockCrmClient = new SimulatedMockCrmClient(mockContactRepo, mockActivityRepo);
  const crmSync = new CrmSyncService({ leadRepo, appActivityRepo, mockCrmClient });
  return { leadRepo, appActivityRepo, mockContactRepo, mockActivityRepo, crmSync };
}

function makeTerminalCall(overrides: { id: string; leadId: string; status: CallStatus }): Call {
  const now = new Date().toISOString();
  return {
    id: overrides.id,
    leadId: overrides.leadId,
    sessionId: 'session_test',
    status: overrides.status,
    startedAt: now,
    endedAt: now,
    providerCallId: `sim_${overrides.id}`,
  };
}

describe('CrmSyncService idempotency', () => {
  it('delivering the same callId twice via syncTerminalCall produces exactly one CRMActivity in each store', async () => {
    const { leadRepo, appActivityRepo, mockActivityRepo, crmSync } = createHarness();
    const lead = leadRepo.getAll()[0]!;
    const call = makeTerminalCall({ id: 'call_dup', leadId: lead.id, status: 'CONNECTED' });

    const first = await crmSync.syncTerminalCall(call, lead);
    const second = await crmSync.syncTerminalCall(call, lead);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.activity?.id).toBe(first.activity?.id);
    expect(appActivityRepo.listAll()).toHaveLength(1);
    expect(mockActivityRepo.listAll()).toHaveLength(1);
  });

  it('delivering via the engine-wired handleTerminalCall a second time, after the first has settled, produces no second activity or contact', async () => {
    const { leadRepo, appActivityRepo, mockContactRepo, crmSync } = createHarness();
    const lead = leadRepo.getAll()[1]!;
    const call = makeTerminalCall({ id: 'call_handle_dup', leadId: lead.id, status: 'VOICEMAIL' });

    crmSync.handleTerminalCall({ call, lead });
    await new Promise((resolve) => setTimeout(resolve, 10)); // let the first delivery fully settle

    crmSync.handleTerminalCall({ call, lead }); // a second, later delivery of the same terminal event
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(appActivityRepo.listAll()).toHaveLength(1);
    expect(mockContactRepo.listAll()).toHaveLength(1);
  });
});

describe('CrmSyncService contact upsert', () => {
  it('creates a contact and persists its id back onto the lead when it has none', async () => {
    const { leadRepo, mockContactRepo, crmSync } = createHarness();
    const lead = leadRepo.getAll()[0]!;
    expect(lead.crmExternalId).toBeUndefined();

    const call = makeTerminalCall({ id: 'call_new_contact', leadId: lead.id, status: 'CONNECTED' });
    await crmSync.syncTerminalCall(call, lead);

    const contacts = mockContactRepo.listAll();
    expect(contacts).toHaveLength(1);
    expect(leadRepo.getById(lead.id)!.crmExternalId).toBe(contacts[0]!.id);
  });

  it('updates the existing contact — no second contact — when the lead already has a crmExternalId', async () => {
    const { leadRepo, mockContactRepo, crmSync } = createHarness();
    const lead = leadRepo.getAll()[0]!;

    const firstCall = makeTerminalCall({ id: 'call_first', leadId: lead.id, status: 'CONNECTED' });
    await crmSync.syncTerminalCall(firstCall, lead);
    expect(mockContactRepo.listAll()).toHaveLength(1);

    const leadWithExternalId = leadRepo.getById(lead.id)!;
    expect(leadWithExternalId.crmExternalId).toBeDefined();

    const secondCall = makeTerminalCall({ id: 'call_second', leadId: lead.id, status: 'NO_ANSWER' });
    await crmSync.syncTerminalCall(secondCall, leadWithExternalId);

    expect(mockContactRepo.listAll()).toHaveLength(1); // still just one contact, not a second
    expect(leadRepo.getById(lead.id)!.crmExternalId).toBe(leadWithExternalId.crmExternalId);
  });
});

describe('CrmSyncService disposition mapping', () => {
  const cases: Array<{ status: CallStatus; disposition: string }> = [
    { status: 'CONNECTED', disposition: 'Connected' },
    { status: 'NO_ANSWER', disposition: 'No Answer' },
    { status: 'BUSY', disposition: 'Busy' },
    { status: 'VOICEMAIL', disposition: 'Voicemail' },
    { status: 'CANCELED_BY_DIALER', disposition: 'Canceled by Dialer' },
  ];

  it.each(cases)('maps $status to disposition "$disposition" in both stores', async ({ status, disposition }) => {
    const { leadRepo, appActivityRepo, mockActivityRepo, crmSync } = createHarness();
    const lead = leadRepo.getAll()[0]!;
    const call = makeTerminalCall({ id: `call_${status}`, leadId: lead.id, status });

    const result = await crmSync.syncTerminalCall(call, lead);

    expect(result.created).toBe(true);
    expect(result.activity?.disposition).toBe(disposition);
    expect(appActivityRepo.getByCallId(call.id)?.disposition).toBe(disposition);
    expect(mockActivityRepo.listAll().find((a) => a.callId === call.id)?.disposition).toBe(disposition);
  });
});
