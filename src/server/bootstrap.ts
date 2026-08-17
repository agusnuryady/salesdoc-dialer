import { config } from './config';
import { InMemoryMockCrmActivityRepository } from './crm/mock-crm-activity-repository';
import type { MockCrmActivityRepository } from './crm/mock-crm-activity-repository';
import { InMemoryMockCrmContactRepository } from './crm/mock-crm-contact-repository';
import type { MockCrmContactRepository } from './crm/mock-crm-contact-repository';
import { SimulatedMockCrmClient } from './crm/mock-crm-client';
import type { MockCrmClient } from './crm/mock-crm-client';
import { CrmSyncService } from './dialer/crm-sync-service';
import { DialerEngine } from './dialer/dialer-engine';
import { InMemoryCallRepository } from './repositories/in-memory/in-memory-call-repository';
import { InMemoryCrmActivityRepository } from './repositories/in-memory/in-memory-crm-activity-repository';
import { InMemoryLeadRepository } from './repositories/in-memory/in-memory-lead-repository';
import { InMemorySessionRepository } from './repositories/in-memory/in-memory-session-repository';
import type {
  CallRepository,
  CrmActivityRepository,
  DialerSessionRepository,
  LeadRepository,
} from './repositories/interfaces';
import { seedLeads } from './seed/seed-leads';
import { SimulatedProvider } from './telephony/simulated-provider';
import type { TelephonyProvider } from './telephony/telephony-provider';

/**
 * Everything below is pinned to globalThis so dev-mode HMR and per-route
 * module evaluation in Next.js can't produce more than one copy of the
 * store/engine per process (PLAN.md's "one process, one engine" constraint).
 * This is the ONLY file a Postgres swap would touch: replace the InMemory*
 * repository imports/constructions here, leave everything else in server/
 * untouched.
 *
 * Note the mock CRM's contact/activity repos are constructed here and handed
 * ONLY to SimulatedMockCrmClient — nothing else in this file (or anywhere
 * else) holds a reference to them. The app-side CrmActivityRepository is a
 * completely separate instance. That's what keeps the two stores from ever
 * sharing storage.
 */
interface DialerGlobals {
  leadRepo?: LeadRepository;
  callRepo?: CallRepository;
  sessionRepo?: DialerSessionRepository;
  appCrmActivityRepo?: CrmActivityRepository;
  mockCrmContactRepo?: MockCrmContactRepository;
  mockCrmActivityRepo?: MockCrmActivityRepository;
  mockCrmClient?: MockCrmClient;
  crmSyncService?: CrmSyncService;
  provider?: TelephonyProvider;
  engine?: DialerEngine;
}

const globalForDialer = globalThis as unknown as { __dialer__?: DialerGlobals };
const globals: DialerGlobals = globalForDialer.__dialer__ ?? (globalForDialer.__dialer__ = {});

export function getLeadRepo(): LeadRepository {
  return (globals.leadRepo ??= new InMemoryLeadRepository(seedLeads()));
}

export function getCallRepo(): CallRepository {
  return (globals.callRepo ??= new InMemoryCallRepository());
}

export function getSessionRepo(): DialerSessionRepository {
  return (globals.sessionRepo ??= new InMemorySessionRepository());
}

export function getAppCrmActivityRepo(): CrmActivityRepository {
  return (globals.appCrmActivityRepo ??= new InMemoryCrmActivityRepository());
}

export function getMockCrmContactRepo(): MockCrmContactRepository {
  return (globals.mockCrmContactRepo ??= new InMemoryMockCrmContactRepository());
}

export function getMockCrmActivityRepo(): MockCrmActivityRepository {
  return (globals.mockCrmActivityRepo ??= new InMemoryMockCrmActivityRepository());
}

export function getMockCrmClient(): MockCrmClient {
  return (globals.mockCrmClient ??= new SimulatedMockCrmClient(
    getMockCrmContactRepo(),
    getMockCrmActivityRepo(),
  ));
}

export function getCrmSyncService(): CrmSyncService {
  return (globals.crmSyncService ??= new CrmSyncService({
    leadRepo: getLeadRepo(),
    appActivityRepo: getAppCrmActivityRepo(),
    mockCrmClient: getMockCrmClient(),
  }));
}

export function getProvider(): TelephonyProvider {
  return (globals.provider ??= new SimulatedProvider({
    seed: config.seed,
    ringDelayMsRange: config.ringDelayMsRange,
    talkDurationMsRange: config.talkDurationMsRange,
    outcomeWeights: config.outcomeWeights,
    guaranteedConnectOnDialIndex: config.guaranteedConnectOnDialIndex,
    guaranteedConnectDelayMs: config.guaranteedConnectDelayMs,
  }));
}

export function getEngine(): DialerEngine {
  if (globals.engine) return globals.engine;
  const engine = new DialerEngine({
    sessionRepo: getSessionRepo(),
    callRepo: getCallRepo(),
    leadRepo: getLeadRepo(),
    provider: getProvider(),
    config: { tickIntervalMs: config.tickIntervalMs, requeueCap: config.requeueCap },
    onTerminalCall: getCrmSyncService().handleTerminalCall,
  });
  engine.start();
  globals.engine = engine;
  return engine;
}
