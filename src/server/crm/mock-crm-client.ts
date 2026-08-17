import { generateId } from '../domain/ids';
import type { MockCrmActivityRepository } from './mock-crm-activity-repository';
import type { MockCrmContactRepository } from './mock-crm-contact-repository';
import type { MockCrmActivity, MockCrmContact } from './mock-crm-types';

export interface UpsertMockCrmContactInput {
  /** The contact's own id in this system, if the app already has one on file. */
  externalId?: string;
  name: string;
  phone: string;
  email: string;
  company: string;
}

export interface CreateMockCrmActivityInput {
  callId: string;
  contactId: string;
  disposition: string;
  notes: string;
}

/** The simulated "wire" to the external CRM — async by shape so latency can be added later without changing callers. */
export interface MockCrmClient {
  upsertContact(input: UpsertMockCrmContactInput): Promise<MockCrmContact>;
  createActivity(input: CreateMockCrmActivityInput): Promise<{ activity: MockCrmActivity; created: boolean }>;
}

export class SimulatedMockCrmClient implements MockCrmClient {
  constructor(
    private readonly contacts: MockCrmContactRepository,
    private readonly activities: MockCrmActivityRepository,
  ) {}

  async upsertContact(input: UpsertMockCrmContactInput): Promise<MockCrmContact> {
    const patch = { name: input.name, phone: input.phone, email: input.email, company: input.company };
    if (input.externalId) {
      return this.contacts.update(input.externalId, patch);
    }
    return this.contacts.create(patch);
  }

  async createActivity(
    input: CreateMockCrmActivityInput,
  ): Promise<{ activity: MockCrmActivity; created: boolean }> {
    return this.activities.upsertIfAbsent(input.callId, () => ({
      id: generateId('mockact'),
      contactId: input.contactId,
      type: 'CALL',
      callId: input.callId,
      disposition: input.disposition,
      notes: input.notes,
      createdAt: new Date().toISOString(),
    }));
  }
}
