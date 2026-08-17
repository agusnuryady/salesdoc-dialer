import { NotFoundError } from '../../domain/errors';
import type { Lead } from '../../domain/types';
import type { LeadRepository } from '../interfaces';

export class InMemoryLeadRepository implements LeadRepository {
  private readonly leads = new Map<string, Lead>();

  constructor(initial: Lead[]) {
    for (const lead of initial) this.leads.set(lead.id, lead);
  }

  getAll(): Lead[] {
    return [...this.leads.values()];
  }

  getById(id: string): Lead | undefined {
    return this.leads.get(id);
  }

  update(id: string, patch: Partial<Lead>): Lead {
    const existing = this.leads.get(id);
    if (!existing) throw new NotFoundError(`Lead ${id} not found`);
    const updated = { ...existing, ...patch };
    this.leads.set(id, updated);
    return updated;
  }
}
