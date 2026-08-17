import { NotFoundError } from '../../domain/errors';
import type { Call } from '../../domain/types';
import type { CallRepository } from '../interfaces';

export class InMemoryCallRepository implements CallRepository {
  private readonly calls = new Map<string, Call>();
  // Secondary index so listBySession is O(this session's calls), not O(every
  // call ever created in the process) — the latter is what a naive
  // Array.from(map.values()).filter() would cost on every 1.5s poll.
  private readonly callIdsBySession = new Map<string, Set<string>>();

  create(call: Call): Call {
    this.calls.set(call.id, call);
    const bucket = this.callIdsBySession.get(call.sessionId) ?? new Set<string>();
    bucket.add(call.id);
    this.callIdsBySession.set(call.sessionId, bucket);
    return call;
  }

  getById(id: string): Call | undefined {
    return this.calls.get(id);
  }

  update(id: string, patch: Partial<Call>): Call {
    const existing = this.calls.get(id);
    if (!existing) throw new NotFoundError(`Call ${id} not found`);
    // sessionId is not mutable via patch in practice, but guard the index
    // anyway so this class can't silently drift from itself if that changes.
    if (patch.sessionId && patch.sessionId !== existing.sessionId) {
      this.callIdsBySession.get(existing.sessionId)?.delete(id);
      const bucket = this.callIdsBySession.get(patch.sessionId) ?? new Set<string>();
      bucket.add(id);
      this.callIdsBySession.set(patch.sessionId, bucket);
    }
    const updated = { ...existing, ...patch };
    this.calls.set(id, updated);
    return updated;
  }

  listBySession(sessionId: string): Call[] {
    const ids = this.callIdsBySession.get(sessionId);
    if (!ids) return [];
    const result: Call[] = [];
    for (const id of ids) {
      const call = this.calls.get(id);
      if (call) result.push(call);
    }
    return result;
  }
}
