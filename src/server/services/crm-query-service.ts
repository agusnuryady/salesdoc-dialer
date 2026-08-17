import { getMockCrmActivityRepo, getMockCrmContactRepo } from '../bootstrap';
import type { MockCrmActivity, MockCrmContact } from '../crm/mock-crm-types';

export function listMockCrmContacts(): MockCrmContact[] {
  return getMockCrmContactRepo().listAll();
}

export function listMockCrmActivities(): MockCrmActivity[] {
  return getMockCrmActivityRepo().listAll();
}
