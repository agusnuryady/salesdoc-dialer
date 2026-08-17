import { NotFoundError } from '../../domain/errors';
import type { DialerSession } from '../../domain/types';
import type { DialerSessionRepository } from '../interfaces';

export class InMemorySessionRepository implements DialerSessionRepository {
  private readonly sessions = new Map<string, DialerSession>();

  create(session: DialerSession): DialerSession {
    this.sessions.set(session.id, session);
    return session;
  }

  getById(id: string): DialerSession | undefined {
    return this.sessions.get(id);
  }

  update(id: string, patch: Partial<DialerSession>): DialerSession {
    const existing = this.sessions.get(id);
    if (!existing) throw new NotFoundError(`DialerSession ${id} not found`);
    const updated = { ...existing, ...patch };
    this.sessions.set(id, updated);
    return updated;
  }

  listAll(): DialerSession[] {
    return [...this.sessions.values()];
  }
}
