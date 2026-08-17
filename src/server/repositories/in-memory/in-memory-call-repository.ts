import { NotFoundError } from '../../domain/errors';
import type { Call } from '../../domain/types';
import type { CallRepository } from '../interfaces';

export class InMemoryCallRepository implements CallRepository {
  private readonly calls = new Map<string, Call>();

  create(call: Call): Call {
    this.calls.set(call.id, call);
    return call;
  }

  getById(id: string): Call | undefined {
    return this.calls.get(id);
  }

  update(id: string, patch: Partial<Call>): Call {
    const existing = this.calls.get(id);
    if (!existing) throw new NotFoundError(`Call ${id} not found`);
    const updated = { ...existing, ...patch };
    this.calls.set(id, updated);
    return updated;
  }

  listBySession(sessionId: string): Call[] {
    return [...this.calls.values()].filter((call) => call.sessionId === sessionId);
  }
}
