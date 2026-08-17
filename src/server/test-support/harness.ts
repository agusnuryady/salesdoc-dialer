import { DialerEngine, type TerminalCallEvent } from '../dialer/dialer-engine';
import { InMemoryCallRepository } from '../repositories/in-memory/in-memory-call-repository';
import { InMemoryLeadRepository } from '../repositories/in-memory/in-memory-lead-repository';
import { InMemorySessionRepository } from '../repositories/in-memory/in-memory-session-repository';
import { seedLeads } from '../seed/seed-leads';
import type { TelephonyProvider } from '../telephony/telephony-provider';

/**
 * Builds a fresh, fully isolated DialerEngine + repositories for a single
 * test — deliberately bypasses bootstrap.ts's globalThis-pinned singletons
 * (those exist to survive Next.js HMR across requests; tests want the
 * opposite: a brand new store per test, with no shared state).
 */
export function createEngineHarness(
  provider: TelephonyProvider,
  overrides?: { tickIntervalMs?: number; requeueCap?: number },
) {
  const leadRepo = new InMemoryLeadRepository(seedLeads());
  const callRepo = new InMemoryCallRepository();
  const sessionRepo = new InMemorySessionRepository();
  const terminalEvents: TerminalCallEvent[] = [];

  const engine = new DialerEngine({
    sessionRepo,
    callRepo,
    leadRepo,
    provider,
    config: {
      tickIntervalMs: overrides?.tickIntervalMs ?? 10,
      requeueCap: overrides?.requeueCap ?? 1,
    },
    onTerminalCall: (event) => terminalEvents.push(event),
  });

  return { leadRepo, callRepo, sessionRepo, engine, terminalEvents };
}
