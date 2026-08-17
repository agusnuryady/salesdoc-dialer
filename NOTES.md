# Known gaps and deferred work

Everything here is a deliberate scope decision, not an oversight discovered too late. Grouped by
where it was found. Nothing on this list is currently exploitable at this app's actual scale (a
handful of manually-created sessions over 4-8 seeded leads) — it's here because a senior reviewer
would ask about it, not because it's on fire.

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

- **No README.** `config.ts`'s env vars (notably `DIALER_GUARANTEED_CONNECT_INDEX`, which defaults
  to forcing every session's first dial to connect) are undocumented anywhere a reviewer would
  find them without reading source.
- **Not deployed.** No `render.yaml`, no deployment attempted. The brief's "single Render Web
  Service" requirement is unmet.
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
