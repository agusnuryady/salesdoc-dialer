# Known gaps and deferred work

Everything here is a deliberate scope decision, not an oversight discovered too late. Grouped by
where it was found. Nothing on this list is currently exploitable at this app's actual scale (a
handful of manually-created sessions over 4-8 seeded leads) — it's here because a senior reviewer
would ask about it, not because it's on fire.

## How this maps to V2

**V2's recommendation** (`../salesdoc-v2-refinement/proposal/v2-product-refinement.md` §8): build
the AI-to-human handoff mechanism on FreeSWITCH (primary) or Asterisk (fallback) with LiveKit
Agents, plus the signal-governance, briefing, queue, and compliance layers no evaluated candidate
(VICIdial, ICTDialer, OSDial) provides — deferring all three as the product foundation, conditional
on a two-week spike proving handoff reliability (Gate 1) and capacity (Gate 2).

**Clean seams here, honestly earned.** The repository-interface pattern (`LeadRepository`,
`CrmActivityRepository`, `MockCrmClient`, all swapped from one file per `PLAN.md`) is the same
"abstract the external system behind an interface, one swap point" discipline V2's Lead-management
integration capability needs — not the same interfaces, the same shape. `CrmSyncService`'s
idempotent sync-on-terminal-event — keyed on `callId` via `upsertIfAbsent`, mapping an internal
enum to an external field — is structurally the same problem as V2's Epic 8 (attempt-outcome/
next-action mapping): write exactly one downstream record per terminal event, idempotently.
Smaller scale, no Appendix A discovery uncertainty, but the same shape. `TelephonyProvider` is a
real seam too, weaker: it proves orchestration can be decoupled from how a call connects, nothing
about live in-call behavior.

**Everything else needs structural change, not extension.** Signal/eligibility governance,
pre-call briefing, human presence/reservation/acceptance, and supervision/compliance/redaction
have zero code to build from here — this project never modeled an operator, a signal, or PII.
Queue/retry has a real mechanism (bounded, capped requeue) but conflates lead status, queue
membership, and scheduled retry into one `leadQueue` array — exactly the conflation V2 §4.4 warns
against, and exactly what the required failure scenario (Story 6.4) needs kept apart. Concurrency
is hardcoded to the literal `2`, not a capacity-aware ratio; it happens to land close to V2's own
pilot-scoped fixed 2:1, for unrelated reasons — nothing here paces against human availability,
because there's no human to pace against.

## Security — deferred

- **No authentication or authorization at all.** Any request that knows a session id (a random
  UUID, not a secret) can read or stop that session — there is no concept of "which agent owns
  this session." Out of the original brief's scope (single mock agent, no login), so not fixed,
  but worth being explicit: isolation between sessions today is "whoever has the id," not a real
  access control model. Would need real auth if this ever became multi-user.
- **`CrmSyncService` idempotency is airtight for activities, not for contact creation, under true
  concurrent delivery of the same `callId`.** Two concurrent `syncTerminalCall` calls for the same
  call both pass the early existence check before either finishes, and both can create a mock CRM
  contact for the same lead before the first one's `leadRepo.update` persists the new
  `crmExternalId`. Currently unreachable because the engine only ever calls `handleTerminalCall`
  once per `callId` — but the service doesn't defend itself independently of that invariant. Fix
  would be a per-`callId` in-flight lock in `CrmSyncService`, or re-reading the lead's
  `crmExternalId` right before the contact upsert instead of trusting the caller's snapshot.
- **No retry-with-backoff for failed CRM syncs.** A `FAILED` sync (`crmSync-service.ts`'s
  `failedCallIds` Set) is permanent — no operator recourse, no automatic retry. This was PLAN.md's
  own first-cut candidate; still cut.
- **Server-side logging isn't redacted.** `console.error` in `api/_lib/http.ts` and
  `crm-sync-service.ts` logs full error objects, which could in principle contain lead PII (name/
  phone/email) if a future error path embeds them in a message. Never confirmed to actually happen
  today — nothing currently thrown carries PII in its message — but there's no structural guard
  against it either. Fixing "properly" (structured logging with a redaction allowlist) is more
  machinery than a take-home's log volume justifies.
- **No rate limiting anywhere.** Nothing stops a client from calling `POST /api/dialer-sessions`
  in a loop and creating unlimited sessions — ties directly into the unbounded-growth item below.
  Irrelevant for a private single-evaluator demo; a real concern the moment this is public.
- **Unbounded in-memory growth across the process lifetime.** `sessionRepo`, `callRepo`,
  `appActivityRepo`, `mockCrmContactRepo`, `mockCrmActivityRepo` are all Maps that never evict —
  every session/call/activity/contact ever created stays in memory for the life of the process.
  Inherent to "in-memory state, no persistence" being the explicit brief requirement; fixing it for
  real means a TTL/eviction policy or an actual database, which is out of scope here on purpose.

## Performance — deferred

- **No payload-size concern in practice.** Measured the actual `GET /api/dialer-sessions/:id`
  response: ~1.3KB mid-session, ~2.8KB at session end with 7 calls in history. Bounded by
  `leadQueue` length, which the brief caps at 4-8 seeded leads plus at most one requeue each — this
  will never grow large under this app's actual constraints, so no truncation/pagination was added.
  Would become a real concern only if the lead-selection cap were ever lifted by an order of
  magnitude.
- **`DialerEngine`'s process-wide tick interval has no graceful shutdown hook.** It starts on
  first use and runs until the process dies; there's no `SIGTERM` handler calling `engine.stop()`.
  Irrelevant for typical hosting (process exit kills the interval along with everything else) but
  worth naming since it was explicitly asked about.

## Process / deliverable gaps (carried over from the earlier code review, still open)

- **Deployed on Railway, not Render — deliberate deviation from the brief.** The original brief
  said "single Render Web Service"; `render.yaml` is still in the repo and still works, but the
  actual deployment target was switched to Railway by explicit choice, after being shown the
  trade-off: Railway's free tier is a one-time $5/30-day trial, not an ongoing free tier, and the
  container **stops entirely** (not a cold-start sleep) once that runs out, requiring a card and a
  paid Hobby plan to keep it alive past that window. Render's free tier has no such expiry — it
  was the safer choice for "reachable on an unknown grading timeline" and was already fully built
  and verified before this switch. If the deployed link is down when reviewed, this trade-off —
  not a bug — is almost certainly why; see README.md's Deployment section for the reviewer-facing
  version of this note.
- **Git history is reconstructed, not real.** The repository at
  github.com/agusnuryady/salesdoc-dialer has 6 commits grouped by concern (scaffold → domain core →
  CRM/API → frontend → tests → plan), assembled after the fact from final file states — not actual
  incremental history from when each piece was built.

## Fixed in this pass (for reference — not deferred)

- `InMemoryCallRepository.listBySession` was a full scan of every call ever created in the process,
  not just the target session's calls — O(total calls globally) on every 1.5s poll. Added a
  `sessionId -> Set<callId>` index. Benchmarked before/after: at 300K total calls in the repo, an
  8-call session's lookup went from ~2.4ms/call to ~0.0004ms/call — now flat regardless of global
  size.
- `POST /api/dialer-sessions` had no body size limit (`request.json()` will buffer an arbitrarily
  large body before validation ever runs) and no cap on `leadIds` array length, individual id
  length, or `agentId` length. Added a streamed byte-cap body reader (413 over the limit, checked
  against `Content-Length` first and enforced again as bytes actually arrive) and explicit length
  caps on all three fields.
- `SimulatedProvider.canceledProviderCallIds` (and its `isCanceled()` accessor, plus a duplicate
  copy in the `ScriptedProvider` test double) was written to on every cancellation and never read
  anywhere — pure unbounded growth for zero benefit. Removed both.
- Frontend polling had a real out-of-order-response race: `setInterval` doesn't wait for the
  previous fetch to resolve, so a slow, older response arriving after a faster, newer one could
  silently overwrite fresher state. Added request sequencing to discard stale responses. Proved it
  with a test that makes the race concrete (first response deliberately hangs, second resolves
  first, first then resolves after) rather than trusting the fix by inspection.
- The 1s elapsed-time clock kept ticking (and forcing a re-render) after a session reached
  `STOPPED`, with nothing left on screen that needed a live clock. Now stops with the session.
  Proved via `vi.getTimerCount()` that both the poll and clock intervals reach exactly zero the
  tick a session goes `STOPPED`, and stay at zero — not just momentarily zero.
- `npm audit`: 0 vulnerabilities. Nothing in the dependency tree is unmaintained — the only
  `npm outdated` findings are routine major-version lag on dev tooling (`@types/node`, `eslint`,
  `typescript`), not urgent.

## What I'd do next

Prioritised against V2's own three required acceptance scenarios (primary, failure, data-
minimization — `../salesdoc-v2-refinement/backlog/prioritized-backlog.md`), not a generic roadmap.

1. **Validate the telephony-core seam for real, before anything else.** `TelephonyProvider`
   (`dial()`/`cancel()`) proves orchestration *can* be decoupled from the telephony implementation —
   it proves nothing about live in-call behavior, since `dial()` returns one precomputed outcome
   rather than a real event stream. The honest next step is exactly V2's own §8 spike: one real
   implementation against FreeSWITCH's ESL or Asterisk's ARI, scoped to just place-a-call/detect-
   answer/hang-up, before attempting gatekeeper navigation or handoff. Serves: Telephony core &
   AI call handling; §8 Gates 1–2. Cost: the two-week spike V2 already budgets — no new estimate.

2. **Add a redaction/PII boundary before storing anything AI-collected.** Nothing here defends
   against this: Lead PII (name/phone/email) flows straight from the lead record through
   `CrmSyncService` into both CRM stores, because Part 1 never collects anything beyond what's
   already on file. V2's AI phase actively risks *volunteered* PII mid-conversation, and Epic 7's
   data-minimization scenario is zero-tolerance, not a rate. Serves: Epic 7 (Stories 7.1–7.3).
   Cost: net-new — a small detect-and-redact module plus the audit-query Story 7.3 needs. Medium.

3. **Split queue membership, lead status, and scheduled retry into three separate concepts before
   extending the state machine further.** `DialerSession.leadQueue` conflates all three today — a
   requeue is just re-appending to the same array, immediately eligible, and there's no separate
   "lead status" field at all. V2 §4.4 names this exact conflation as why a reached-PIC company
   could silently re-enter the wrong queue instead of the required distinct human-callback status.
   Serves: §4.4's framework; underlies Epic 1 and the required failure scenario (Story 6.4). Cost:
   days — foundational rework, not a feature.

4. **Carry the idempotent-sync design forward into Epic 8, not the code.** `CrmSyncService`'s
   sync-on-terminal-event — keyed on `callId` via `upsertIfAbsent`, mapping an internal enum to an
   external field — is the same shape as Epic 8's attempt-outcome/next-action mapping, just at
   Part 1's much smaller scale and without the Appendix A lead-management discovery uncertainty.
   Serves: Epic 8 (Stories 8.1–8.2). Cost: cheap — a design note now; real implementation blocks on
   Appendix A resolving what SalesDoc's system actually exposes.

5. **Build Operator Presence and provisional reservation as genuinely new domain concepts.**
   `agentId` is a single fixed string here — nothing models a human at all, let alone an
   Available/Reserved/On-call/Wrap-up state machine or an explicit accept/decline step. Serves:
   Human-side operations cluster; Epic 4. Cost: net-new, medium — this is real Epic 4 scope, not an
   extension of anything Part 1 has.

6. **Replace the 5-value disposition set with V2's actual exception table, once the real core
   exists.** `CallStatus` (`CONNECTED`/`NO_ANSWER`/`BUSY`/`VOICEMAIL`/`CANCELED_BY_DIALER`) covers a
   narrower, unrelated event set — two identical dial attempts racing — not V2's 10-row table
   (wrong company, gatekeeper refusal, DNC, dropped mid-transfer, PIC-uncertain, and more). Serves:
   Epic 6 (Core Exception Handling). Cost: small-medium; sequence after item 1, since several rows
   depend on live-call events this project's telephony layer doesn't have yet.

7. **Don't generalize the hardcoded `concurrency: 2` into a capacity-aware dialing feature.**
   It coincidentally lands near V2's own pilot-scoped fixed 2:1 ratio, for unrelated reasons — ours
   races two identical dial attempts against each other; V2's paces AI lines against human
   availability, derived from measured rates. V2's own backlog already cuts dynamic capacity tuning
   to required-before-production, deferred past the pilot. Serves: flags the exact overclaim this
   mapping has to avoid. Cost: zero — a "don't start here yet" item, not a build.
