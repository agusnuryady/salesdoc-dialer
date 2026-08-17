import { getAppCrmActivityRepo, getLeadRepo } from '../bootstrap';
import { NotFoundError } from '../domain/errors';
import type { CRMActivity, Lead } from '../domain/types';

export function listLeads(): Lead[] {
  return getLeadRepo().getAll();
}

export function getLeadCrmActivities(leadId: string): CRMActivity[] {
  const lead = getLeadRepo().getById(leadId);
  if (!lead) throw new NotFoundError(`Lead ${leadId} not found`);
  return getAppCrmActivityRepo().listByLead(leadId);
}
