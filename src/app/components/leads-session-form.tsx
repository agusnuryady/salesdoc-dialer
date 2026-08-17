'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Lead } from '@/server/domain/types';

export function LeadsSessionForm({ leads }: { leads: Lead[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleCreate() {
    setError(null);
    setCreating(true);
    try {
      const res = await fetch('/api/dialer-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: [...selected] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to create session');
      setSessionId(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setCreating(false);
    }
  }

  async function handleStart() {
    if (!sessionId) return;
    setError(null);
    setStarting(true);
    try {
      const res = await fetch(`/api/dialer-sessions/${sessionId}/start`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to start session');
      router.push(`/session/${sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start session');
      setStarting(false);
    }
  }

  const hasSelection = selected.size > 0;

  return (
    <div className="space-y-6">
      <ul className="divide-y divide-neutral-200 overflow-hidden rounded-lg border border-neutral-200 bg-white">
        {leads.map((lead) => (
          <li key={lead.id} className="flex items-center gap-4 px-4 py-3">
            <input
              type="checkbox"
              checked={selected.has(lead.id)}
              onChange={() => toggle(lead.id)}
              disabled={sessionId !== null}
              className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900 disabled:opacity-40"
              aria-label={`Select ${lead.name}`}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-neutral-900">{lead.name}</p>
              <p className="truncate text-sm text-neutral-500">{lead.company}</p>
            </div>
            <div className="shrink-0 text-right text-sm text-neutral-500">
              <p>{lead.phone}</p>
              <p className="text-neutral-400">{lead.email}</p>
            </div>
          </li>
        ))}
      </ul>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleCreate}
          disabled={!hasSelection || sessionId !== null || creating}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          {creating ? 'Creating…' : sessionId ? 'Session created ✓' : 'Create Dialer Session'}
        </button>
        <button
          type="button"
          onClick={handleStart}
          disabled={!sessionId || !hasSelection || starting}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          {starting ? 'Starting…' : 'Start'}
        </button>
        <span className="text-sm text-neutral-500">
          {selected.size} lead{selected.size === 1 ? '' : 's'} selected
        </span>
      </div>
    </div>
  );
}
