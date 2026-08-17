# Implementation Plan — CRM Dialer Assessment

No application code has been written yet. This document is the plan only.

## 0. Interpretive choices this plan takes (beyond the 5 already decided)

These are gaps in the verbatim spec that the architecture below has to resolve one way or
another. Flagging them up front so they're reviewed once, here, instead of being buried in code.

1. **`Call.status` is typed `CallStatus | undefined`, not just `CallStatus`.** The brief's enum
   has no "ringing / in progress" value, but a line has to show *something* on screen 2 before it
   resolves. A `Call` row is created the instant a lead starts dialing, with `status: undefined`;
   the field is only ever set to one of the five enum values once the outcome is known. This is
   the smallest deviation I could find from the verbatim model — everything else about the model
   is unchanged.
2. **`DialerSession.status` is reused for three real situations.** The brief only gives two values
   (`RUNNING | STOPPED`), but Screen 1 has two separate buttons — "Create Dialer Session" and
   "Start" — implying a created-but-not-started state. Plan: a session is created in `STOPPED`,
   `POST .../start` moves it to `RUNNING`, and it returns to `STOPPED` both when the queue is
   exhausted and (if used) on an explicit stop. Not-started, exhausted, and stopped-early are all
   `STOPPED` — that's what "verbatim, two values" forces.
3. **Slot-refill rule while a winner is live.** Decision #1 says "when [the winner] ends, dial the
   next pair" — read literally, that means only one line is active during the winner's talk time,
   not two. I'm implementing it literally: the loser's slot is canceled and left *empty* (not
   backfilled) until the winner itself ends, at which point both slots refill together as a fresh
   pair. This is a real concurrency underuse but it's what's written, and it makes the "pair"
   language exact rather than approximate. For ordinary (non-connect) terminal outcomes — no
   winner involved — the freed slot refills immediately, so the queue doesn't stall waiting on the
   other line.
4. **A `stop` capability stays in the engine and API even though Screen 2 doesn't need a button.**
   The build constraints explicitly call out "must survive: stop mid-call" as an engine
   requirement, so `stopSession()` exists and is exercised by tests/curl; the frontend simply
   doesn't wire a button to it per your answer.

## 1. File tree

```
src/
├── server/                                  # zero Next.js imports anywhere under here
│   ├── config.ts                            # env-driven: seed, ring/talk delay ranges, outcome
│   │                                         #   weights, tick interval, CRM latency/failure rate,
│   │                                         #   retry policy, requeue cap
│   ├── domain/
│   │   ├── types.ts                         # Lead, Call, CallStatus, DialerSession,
│   │   │                                     #   DialerSessionStatus, CRMActivity — verbatim models
│   │   └── ids.ts                           # id generation helper
│   ├── repositories/
│   │   ├── interfaces.ts                    # LeadRepository, CallRepository,
│   │   │                                     #   DialerSessionRepository, CrmActivityRepository,
│   │   │                                     #   CrmContactRepository contracts
│   │   └── in-memory/
│   │       ├── in-memory-lead-repository.ts
│   │       ├── in-memory-call-repository.ts
│   │       ├── in-memory-session-repository.ts
│   │       ├── in-memory-crm-activity-repository.ts   # instantiated twice (app store + mock-crm
│   │       │                                           #   store) — same interface, two singletons
│   │       └── in-memory-crm-contact-repository.ts
│   ├── telephony/
│   │   ├── telephony-provider.ts            # TelephonyProvider interface, DialOutcomeSchedule type
│   │   ├── simulated-provider.ts            # SimulatedProvider: seeded outcomes, ring/talk delay,
│   │   │                                     #   scenario mode, cancel()
│   │   └── rng.ts                           # deterministic seeded PRNG (mulberry32) + weighted pick
│   ├── crm/
│   │   └── mock-crm-client.ts               # simulated "external" CRM: upsertContact,
│   │                                         #   createActivity, configurable latency/failure
│   ├── dialer/
│   │   ├── dialer-engine.ts                 # the one ticking state machine: start/stop session,
│   │   │                                     #   tick loop, connect/cancel/requeue race handling
│   │   ├── engine-state.ts                  # engine-internal per-call scheduling bookkeeping
│   │   │                                     #   (resolveAt, talkEndAt, requeue counts) — not
│   │   │                                     #   persisted, not part of the domain model
│   │   └── crm-sync-service.ts              # terminal-call handler: idempotent activity write,
│   │                                         #   contact upsert, retry-on-failure
│   ├── services/
│   │   ├── lead-service.ts                  # list/get leads
│   │   ├── session-service.ts               # create/start/stop session, builds SessionView DTO
│   │   └── crm-query-service.ts             # mock-crm contacts/activities, lead crm-activities
│   ├── dto/
│   │   └── session-view.ts                  # SessionView / LineView / CrmSyncStatus response
│   │                                         #   shapes — decouples API responses from domain types
│   ├── seed/
│   │   └── seed-leads.ts                    # 6 seeded leads
│   └── bootstrap.ts                         # wires globalThis-pinned singletons (repos, provider,
│                                             #   engine, services). THE ONE FILE a Postgres swap
│                                             #   touches: swap in-memory repo imports for Postgres
│                                             #   ones here, nothing else in server/ changes.
├── app/
│   ├── layout.tsx
│   ├── page.tsx                             # Screen 1 — thin, calls the API only
│   ├── dialer/[sessionId]/page.tsx          # Screen 2 — thin, calls the API only
│   ├── components/
│   │   ├── leads-table.tsx
│   │   ├── line-card.tsx
│   │   ├── metrics-panel.tsx
│   │   ├── winner-banner.tsx
│   │   └── crm-sync-badge.tsx
│   ├── hooks/
│   │   └── use-polling.ts                   # generic interval-poll hook for Screen 2
│   └── api/
│       ├── leads/route.ts                              # GET
│       ├── leads/[id]/crm-activities/route.ts           # GET
│       ├── dialer-sessions/route.ts                     # POST create
│       ├── dialer-sessions/[id]/route.ts                # GET session view (poll target)
│       ├── dialer-sessions/[id]/start/route.ts          # POST start
│       ├── dialer-sessions/[id]/stop/route.ts           # POST stop (defensive; no UI button)
│       └── mock-crm/
│           ├── contacts/route.ts                        # GET
│           └── activities/route.ts                      # GET
├── PLAN.md
└── README.md                                # seed/config docs, run instructions, architecture note
```

Every route handler under `src/app/api/` does exactly three things: parse the request, call one
`server/services/*` function, serialize the response. No business logic, no imports from
`server/dialer`, `server/telephony`, or `server/repositories` directly — only from
`server/services` and `server/bootstrap`.

## 2. DialerSession state machine

**Session-level states:** `RUNNING`, `STOPPED` (see deviation #2 above for what `STOPPED` covers).

**Per-line lifecycle** (not a separate persisted type — expressed through `Call` rows plus
engine-internal bookkeeping in `engine-state.ts`):

```
queued (lead sitting in leadQueue)
  → dialing (Call created, status=undefined, providerCallId set, resolveAt scheduled)
    → CONNECTED            → becomes winner; talkEndAt scheduled
        → (talk timer fires) → endedAt set → terminal → CRM sync → slot cleared
    → NO_ANSWER / BUSY / VOICEMAIL → terminal immediately → CRM sync → slot refilled from queue
    → CANCELED_BY_DIALER (preempted by sibling connecting) → terminal → CRM sync
        → lead requeued at tail IF requeue count for that lead is 0, else dropped from session
```

**Tick loop** (`dialer-engine.ts`), driven by a single `setInterval` per process (default 250ms),
independent of frontend polling:

For each `RUNNING` session, in a fixed slot order (slot 0 then slot 1):

1. If a slot is `dialing` and `now >= resolveAt`:
   - If a winner already exists this tick (see step 2) and this line isn't it → treat as
     preempted, not as its own predetermined outcome (see race below).
   - Else apply the line's predetermined outcome:
     - `CONNECTED` → set `Call.status = CONNECTED`, `session.winnerCallId = call.id`, schedule
       `talkEndAt`. Immediately cancel the *other* active slot regardless of its own progress
       (see race below).
     - Non-connect outcome → set `Call.status`, `Call.endedAt = now`, invoke `CrmSyncService`,
       clear the slot, refill immediately from the queue head if a lead remains.
2. If a slot holds the winner and `now >= talkEndAt`:
   - Set `Call.endedAt = now`, invoke `CrmSyncService`, clear `session.winnerCallId`, clear the
     slot.
   - If both slots are now empty: refill both together as a fresh pair from the queue head
     (per deviation #3).
3. If both slots are empty and the queue (including pending requeues) is empty: set
   `session.status = STOPPED`.

**The requested race — line A connects while line B is mid-ring:**

1. Tick T: slot 0 (A) has `resolveAt <= T`, predetermined outcome `CONNECTED`. Engine sets
   `A.status = CONNECTED`, `winnerCallId = A.id`, schedules `A.talkEndAt`.
2. Same tick, slot 1 (B): `resolveAt > T` (still ringing). Engine re-checks "does a winner exist
   this tick?" *after* processing slot 0 — it does — so B is force-terminated regardless of its
   own scheduled resolution: `provider.cancel(B.providerCallId)`, `B.status = CANCELED_BY_DIALER`,
   `B.endedAt = T`, `CrmSyncService` invoked for B, B's lead requeued (if under cap), slot 1
   cleared and left empty.
3. B's predetermined outcome (whatever it would have been) is discarded — it never gets applied,
   because the engine checks "is there a winner" before consulting a line's own scheduled result.

**The degenerate double-connect edge** — both A and B have `resolveAt <= T` in the same tick, both
predetermined `CONNECTED`: because slots are processed in fixed order (slot 0 before slot 1), A is
always evaluated first and wins; B is then re-evaluated under step 1's "a winner exists" branch and
is preempted exactly like the mid-ring case, even though its own outcome was also `CONNECTED`. This
tie-break is deterministic and reproducible under the seeded RNG — same seed, same winner, every
run.

**Stop mid-call** (`stopSession`, used by `POST .../stop` and by tests): for any active slot,
`provider.cancel()` + `status = CANCELED_BY_DIALER` + `endedAt = now` + CRM sync, exactly like a
preemption, then `session.status = STOPPED` and the queue is abandoned (no further dials).

## 3. API surface

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/api/leads` | — | `Lead[]` |
| GET | `/api/leads/:id/crm-activities` | — | `CRMActivity[]` (app-side store, this lead only) |
| POST | `/api/dialer-sessions` | `{ agentId?: string, leadIds: string[] }` | `DialerSession` (status `STOPPED`, not yet started) |
| POST | `/api/dialer-sessions/:id/start` | — | `SessionView` (status now `RUNNING`; 409 if already running) |
| POST | `/api/dialer-sessions/:id/stop` | — | `SessionView` (status now `STOPPED`; no-op/409 if already stopped) |
| GET | `/api/dialer-sessions/:id` | — | `SessionView` — **the Screen 2 poll target** |
| GET | `/api/mock-crm/contacts` | — | `CrmContact[]` — brief-required |
| GET | `/api/mock-crm/activities` | — | `CRMActivity[]` — brief-required, mock-crm store |

`SessionView` (the enriched DTO Screen 2 polls, defined in `server/dto/session-view.ts`) exists so
the frontend never has to make N+1 calls or join data client-side:

```ts
type SessionView = {
  id: string;
  agentId: string;
  status: 'RUNNING' | 'STOPPED';
  metrics: { attempted: number; connected: number; failed: number; canceled: number };
  winnerCallId: string | null;
  lines: Array<{
    callId: string;
    lead: { id: string; name: string; phone: string };
    status: CallStatus | 'DIALING';
    startedAt: string;
    endedAt: string | null;
    crmSync: { state: 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED'; attempts: number } | null;
  }>; // 0-2 entries, empty slots omitted
  queueRemaining: number;
};
```

No session-listing endpoint — Screen 1 creates a session and redirects straight to
`/dialer/[sessionId]`, so nothing else needs to enumerate sessions. Cut candidate if it turns out
to be needed later, not built by default.

## 4. CRM sync sequence and idempotency

Runs inside `CrmSyncService.handleTerminalCall(call, lead, disposition)`, invoked synchronously by
the engine the instant a line goes terminal (steps 1/2/3 of the tick loop above). No `await`
happens between the idempotency check and the reservation — both are one synchronous function call
against an in-memory `Map`, so there's no interleaving window even though the rest of the sequence
(contact upsert, mock-CRM write) is async.

1. **Idempotency check + reserve (synchronous, atomic in practice):**
   `appActivityRepo.upsertIfAbsent(call.id, buildActivityDraft)`.
   - If a record for this `callId` already exists: return `{ created: false, activity: existing }`
     immediately. Nothing downstream runs again — no second contact upsert, no second mock-CRM
     write, no second metrics increment. **This is what a duplicate delivery returns: the original
     activity, unchanged, with `created: false`.**
   - If absent: the draft is written now (reserving the slot) and `{ created: true, activity }` is
     returned, and the sequence continues.
2. **Contact upsert** (only on `created: true`): if `lead.crmExternalId` is missing, call
   `mockCrmClient.upsertContact({ name, phone, email })`, get back an external id, persist it onto
   the `Lead` via `LeadRepository.update`. If present, call the same method with the existing id to
   update it instead.
3. **Build the activity**: `{ id, leadId, crmExternalId, type: 'CALL', callId: call.id,
   disposition, notes, createdAt }`. `disposition` comes from the 1:1 map already decided.
4. **Write to the mock CRM's own activity store**: `mockCrmClient.createActivity(activity)`. This
   repository is *also* keyed idempotently on `callId` (same `upsertIfAbsent` pattern), so even if
   this step is somehow re-entered (e.g. during a retry after step 2 failed), the mock-CRM side
   can't duplicate either.
5. **Simulated latency/failure**: `mockCrmClient` calls in steps 2 and 4 resolve after a
   configurable delay and fail at a configurable rate. On failure, `CrmSyncService` marks the
   line's sync state `FAILED` (surfaced in `SessionView.lines[].crmSync`) and enqueues a retry,
   processed on a later engine tick (not a new `setTimeout`), capped at a configured max attempt
   count, still gated by the same `upsertIfAbsent` idempotency check on every retry.
6. **Metrics update**: only on `created: true`, bump the appropriate `session.metrics` counter
   (`connected` / `failed` for NO_ANSWER+BUSY+VOICEMAIL / `canceled` for CANCELED_BY_DIALER),
   alongside `attempted` which increments once per line at dial-start, not here.

## 5. Build order

Each increment is runnable and independently verifiable — mostly via `curl` — before the next one
starts, and before any frontend code exists.

1. **Scaffold + deploy skeleton.** Bare Next.js App Router project, `globalThis` pinning pattern
   proven with a trivial counter route (hit it twice under dev HMR, confirm the count persists
   rather than resetting). Deploy this skeleton to Render immediately. *Verify: the counter
   survives a dev-server file save, and the Render URL responds.*
2. **Leads.** Domain types, `seed-leads.ts`, `InMemoryLeadRepository`, `GET /api/leads`. *Verify:
   `curl` returns 6 leads.*
3. **Telephony provider in isolation.** `TelephonyProvider` interface, `rng.ts`, `SimulatedProvider`
   — no engine yet. *Verify: a throwaway script calls `dial()` 100 times with a fixed seed and
   confirms the outcome distribution and byte-for-byte reproducibility across two runs; confirm
   scenario mode forces an early connect.*
4. **Remaining repositories + mock CRM client.** Call/Session/CRMActivity(x2)/Contact repos,
   `mock-crm-client.ts` with configurable latency/failure. *Verify: a script calls
   `upsertIfAbsent` twice with the same key and confirms the second call is a no-op returning the
   first result.*
5. **Engine core, no CRM sync yet.** Create + start a session, single-pair dialing, tick loop
   advancing lines to terminal outcomes (log to console instead of syncing), slot refill. Force
   outcome weights to always `NO_ANSWER` for this step. *Verify: `POST` create, `POST` start,
   poll `GET .../:id` repeatedly via curl, watch the queue drain to `STOPPED`.*
6. **Connect handling.** Winner assignment, sibling cancellation + requeue-with-cap, talk timer,
   paired refill after the winner ends. *Verify: enable scenario mode to force an early connect,
   confirm via polling that the sibling shows `CANCELED_BY_DIALER`, its lead reappears later in
   the queue exactly once, and the session still reaches `STOPPED`.*
7. **Wire in `CrmSyncService`.** Contact upsert, dual-store activity writes, idempotency guard,
   retry loop, per-line sync status in `SessionView`. *Verify: run a full session, then `curl`
   `/api/mock-crm/contacts`, `/api/mock-crm/activities`, and `/api/leads/:id/crm-activities` and
   confirm counts match `session.metrics` with no duplicates even across retried failures.*
8. **Remaining routes** (`start`/`stop` as real thin adapters, error responses, input validation on
   `POST /api/dialer-sessions`). *Verify: curl the invalid-input and already-running/already-stopped
   cases and confirm sane HTTP status codes.*
9. **Screen 1.** Leads table with checkboxes, create + start, redirect to Screen 2. *Verify: manual
   click-through in a browser.*
10. **Screen 2.** Line cards, metrics panel, winner banner, per-line CRM sync badges, 1-2s polling.
    *Verify: manual click-through, watch a full session run end to end in the browser.*
11. **Deploy + README.** Final Render deploy, smoke-test the production URL end to end, document
    the seed/config env vars and how to reproduce the guaranteed-connect demo.

## 6. What gets cut first if time runs short

1. Retry-with-backoff on CRM sync failure — fall back to one attempt, surface `FAILED` permanently
   if it fails, no retry loop.
2. The `stop` endpoint's edge-case polish (still exists per the engine requirement, but skip extra
   tests beyond the one basic "stop mid-call" check).
3. General tunable outcome weights/env-var surface — keep one hardcoded guaranteed-early-connect
   scenario for the demo, drop broader configurability.
4. Multi-session support / session-listing endpoint — one active session at a time is enough for
   the assessment as specified.
5. UI styling — functional over polished; keep the required elements legible, skip anything
   decorative.
6. Exhaustive edge-case handling for unusual queue sizes (0 or 1 lead selected) beyond not
   crashing — document the known behavior rather than building bespoke UX for it.

The repository-interface layer, the `globalThis` singleton pinning, and the idempotency guard are
*not* on this list — they're small to build correctly up front and expensive to retrofit, so they
stay in scope regardless of time pressure.
