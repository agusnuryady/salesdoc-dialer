import { NotFoundError } from '../domain/errors';
import { generateId } from '../domain/ids';
import type { MockCrmContact } from './mock-crm-types';

export interface CreateMockCrmContactInput {
  name: string;
  phone: string;
  email: string;
  company: string;
}

export interface MockCrmContactRepository {
  create(input: CreateMockCrmContactInput): MockCrmContact;
  update(id: string, patch: Partial<CreateMockCrmContactInput>): MockCrmContact;
  getById(id: string): MockCrmContact | undefined;
  listAll(): MockCrmContact[];
}

// Storage lives only here — no other module holds a reference to this Map.
export class InMemoryMockCrmContactRepository implements MockCrmContactRepository {
  private readonly contacts = new Map<string, MockCrmContact>();

  create(input: CreateMockCrmContactInput): MockCrmContact {
    const contact: MockCrmContact = { id: generateId('crmcontact'), ...input };
    this.contacts.set(contact.id, contact);
    return contact;
  }

  update(id: string, patch: Partial<CreateMockCrmContactInput>): MockCrmContact {
    const existing = this.contacts.get(id);
    if (!existing) throw new NotFoundError(`Mock CRM contact ${id} not found`);
    const updated = { ...existing, ...patch };
    this.contacts.set(id, updated);
    return updated;
  }

  getById(id: string): MockCrmContact | undefined {
    return this.contacts.get(id);
  }

  listAll(): MockCrmContact[] {
    return [...this.contacts.values()];
  }
}
