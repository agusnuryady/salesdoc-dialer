'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { SessionView } from '@/server/dto/session-view';
import { CallActivityTable } from './call-activity-table';
import { LineCard } from './line-card';
import { MetricsPanel } from './metrics-panel';
import { WinnerBanner } from './winner-banner';

const POLL_INTERVAL_MS = 1500;

export function SessionScreen({
  sessionId,
  initialSession,
}: {
  sessionId: string;
  initialSession: SessionView;
}) {
  const [session, setSession] = useState<SessionView>(initialSession);
  const [now, setNow] = useState<number>(() => Date.now());
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Polls the session endpoint. Stops entirely once the session is STOPPED —
  // in this engine that status is only reached once the queue (including
  // requeues) is drained or the session was explicitly stopped, so "STOPPED"
  // and "queue drained" are the same condition here.
  useEffect(() => {
    if (session.status === 'STOPPED') return;

    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/dialer-sessions/${sessionId}`);
        if (!res.ok) return;
        const data = (await res.json()) as SessionView;
        if (!cancelled) setSession(data);
      } catch {
        // Transient network hiccup — the next poll will retry.
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId, session.status]);

  // Independent 1s clock so elapsed-time displays tick smoothly between polls.
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, []);

  async function handleStop() {
    setStopping(true);
    setError(null);
    try {
      const res = await fetch(`/api/dialer-sessions/${sessionId}/stop`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to stop session');
      setSession(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop session');
    } finally {
      setStopping(false);
    }
  }

  const winnerLine = session.lines.find((line) => line.isWinner) ?? null;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-700">
          ← Back to leads
        </Link>
      </div>

      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Dialer session</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Agent {session.agentId} · {session.queueRemaining} lead{session.queueRemaining === 1 ? '' : 's'}{' '}
            remaining in queue
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill status={session.status} />
          <button
            type="button"
            onClick={handleStop}
            disabled={session.status === 'STOPPED' || stopping}
            className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            {stopping ? 'Stopping…' : 'Stop'}
          </button>
        </div>
      </header>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <MetricsPanel metrics={session.metrics} />

      <WinnerBanner line={winnerLine} now={now} />

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Active lines</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {session.lines.length === 0 && (
            <p className="col-span-full rounded-lg border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-400">
              {session.status === 'STOPPED' ? 'Session finished — no active lines.' : 'No active lines.'}
            </p>
          )}
          {session.lines.map((line) => (
            <LineCard key={line.callId} line={line} now={now} />
          ))}
        </div>
      </section>

      <CallActivityTable calls={session.calls} />
    </div>
  );
}

function StatusPill({ status }: { status: SessionView['status'] }) {
  const isRunning = status === 'RUNNING';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
        isRunning ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-200 text-neutral-700'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isRunning ? 'bg-emerald-500' : 'bg-neutral-400'}`} />
      {status}
    </span>
  );
}
