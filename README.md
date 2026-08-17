# Salesdoc Dialer

A CRM dialer assessment: an agent runs a 2-line concurrent dialer session over a list of leads.
When a call ends, the system writes a CRM activity for that lead — to both the app's own store
and a mock external CRM — with `callId` as the idempotency key so a duplicate delivery of the
same terminal event never produces a second activity.

Next.js (App Router) + TypeScript, in-memory state, deployed as a single Render Web Service. See
[`PLAN.md`](./PLAN.md) for the full design rationale (state machine, race handling, idempotency
sequence) and [`NOTES.md`](./NOTES.md) for known gaps and deliberately deferred work.

## Quickstart

```bash
npm install
npm run dev       # http://localhost:3000
```

Other scripts:

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build |
| `npm start` | Production server (`next start`, binds to `$PORT`/`0.0.0.0` — see Deployment) |
| `npm test` | Vitest — domain layer + one component test, no HTTP, no browser |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

The domain/engine tests run in well under a second (fake timers, no real sleeps). The one
component test (`session-screen.test.tsx`) runs in jsdom and is the only test file that isn't
instant to start up, since jsdom itself has startup cost.

## Environment variables

All optional — every one has a sensible default and the app runs correctly with none of them set.
Set from the Render dashboard's Environment tab, or a local `.env` file for `npm run dev`.

| Variable | Default | What it controls |
|---|---|---|
| `DIALER_SEED` | `42` | Seed for the deterministic RNG driving simulated call outcomes |
| `DIALER_TICK_MS` | `250` | How often the dialer engine advances all running sessions |
| `DIALER_RING_MIN_MS` / `DIALER_RING_MAX_MS` | `2000` / `6000` | Simulated ring duration before a dial resolves |
| `DIALER_TALK_MIN_MS` / `DIALER_TALK_MAX_MS` | `4000` / `10000` | Simulated talk duration once a line connects |
| `DIALER_WEIGHT_CONNECTED` / `_NO_ANSWER` / `_BUSY` / `_VOICEMAIL` | `35` / `35` / `15` / `15` | Relative weights for the random outcome distribution |
| `DIALER_GUARANTEED_CONNECT_INDEX` | `0` | 0-based dial index (per process) forced to `CONNECTED` regardless of weights — **defaults to the very first dial of every session**, so a demo never has to wait out the random distribution. Set to a negative number (e.g. `-1`) to disable and let every dial be genuinely random. |
| `DIALER_GUARANTEED_CONNECT_DELAY_MS` | `2000` | How long that forced connect takes to resolve |
| `DIALER_SYNC_CANCELED_BY_DIALER` | `true` | Whether a `CANCELED_BY_DIALER` terminal call produces a CRM activity (set to `false` to suppress — it's real signal-to-noise tradeoff in a real CRM) |

## API reference

All endpoints are under `/api`. Errors are `{ "error": string }` with a real status code — 400 for
bad input, 404 for an unknown id, 413 for an oversized request body, 500 for anything unexpected.

### `GET /api/leads`

```bash
curl http://localhost:3000/api/leads
```

```json
[
  {
    "id": "lead_1",
    "name": "Maria Santoso",
    "company": "Kirana Retail Group",
    "phone": "+62-812-3456-7890",
    "email": "maria.santoso@kiranaretail.co.id"
  }
]
```

### `GET /api/leads/:id/crm-activities`

The app's own view of a lead's CRM activity history (not the mock CRM's — see below).

```bash
curl http://localhost:3000/api/leads/lead_1/crm-activities
```

```json
[
  {
    "id": "activity_f436e4b5-7b2c-4bc9-9f6f-9d8a6c5349e3",
    "leadId": "lead_1",
    "crmExternalId": "crmcontact_ca02db53-8043-41a1-aaa6-5521685dc0cc",
    "type": "CALL",
    "callId": "call_0081fbb8-8ac1-4f7d-a6fb-611394f5e1c3",
    "disposition": "Connected",
    "notes": "Call to Maria Santoso at Kirana Retail Group — connected.",
    "createdAt": "2026-08-17T17:18:40.263Z"
  }
]
```

404 if `:id` doesn't match a seeded lead.

### `POST /api/dialer-sessions`

Creates a session (status `STOPPED` — not yet started; see "Create" vs "Start" on Screen 1).

```bash
curl -X POST http://localhost:3000/api/dialer-sessions \
  -H 'Content-Type: application/json' \
  -d '{"leadIds":["lead_1","lead_2","lead_3"]}'
```

```json
{
  "id": "session_765ef044-216d-4339-b6e1-beb4c1f2dd76",
  "agentId": "agent_1",
  "leadQueue": ["lead_1", "lead_2", "lead_3"],
  "concurrency": 2,
  "activeCallIds": [],
  "winnerCallId": null,
  "status": "STOPPED",
  "metrics": { "attempted": 0, "connected": 0, "failed": 0, "canceled": 0 }
}
```

`leadIds` must be a non-empty array of up to 20 known lead ids (each ≤128 chars); `agentId` is
optional (defaults to `"agent_1"`, ≤128 chars if given). 400 for anything outside those bounds,
413 if the request body exceeds 16KB.

### `POST /api/dialer-sessions/:id/start`

```bash
curl -X POST http://localhost:3000/api/dialer-sessions/session_765ef044.../start
```

Returns the enriched `SessionView` (below) with `status: "RUNNING"` and the first pair of lines
already dialing. Idempotent — calling it again on an already-running session just returns the
current state, not an error.

### `GET /api/dialer-sessions/:id`

**The Screen 2 poll target.** Polled every 1.5s until `status` is `STOPPED`.

```bash
curl http://localhost:3000/api/dialer-sessions/session_765ef044...
```

```json
{
  "id": "session_765ef044-216d-4339-b6e1-beb4c1f2dd76",
  "agentId": "agent_1",
  "status": "RUNNING",
  "metrics": { "attempted": 2, "connected": 0, "failed": 0, "canceled": 0 },
  "winnerCallId": null,
  "queueRemaining": 1,
  "lines": [
    {
      "callId": "call_0081fbb8-8ac1-4f7d-a6fb-611394f5e1c3",
      "lead": { "id": "lead_1", "name": "Maria Santoso", "phone": "+62-812-3456-7890", "company": "Kirana Retail Group" },
      "status": "DIALING",
      "startedAt": "2026-08-17T17:18:30.244Z",
      "endedAt": null,
      "isWinner": false,
      "crmSync": null
    }
  ],
  "calls": [
    { "...": "every call made in this session so far, oldest first — see below" }
  ]
}
```

`lines` is the 0-2 currently active line slots (what Screen 2's side-by-side cards render).
`calls` is the full session history including terminated lines — `lines` empties out the instant a
call goes terminal and its slot refills, so `calls` is what keeps each call's CRM sync outcome
(`crmSync.state`: `PENDING` / `SYNCED` / `FAILED` / `SKIPPED`, plus `crmSync.activityId` once
synced) visible for the life of the session instead of flashing by for under a second.

### `POST /api/dialer-sessions/:id/stop`

Cancels any active lines and moves the session to `STOPPED` immediately, abandoning the rest of
the queue. Same `SessionView` shape as above. Idempotent, same as `start`.

```bash
curl -X POST http://localhost:3000/api/dialer-sessions/session_765ef044.../stop
```

### `GET /api/mock-crm/contacts`

The mock external CRM's own contact store — a separate module/store from the app's own data, with
its own id namespace (`crmcontact_*`).

```bash
curl http://localhost:3000/api/mock-crm/contacts
```

```json
[
  { "id": "crmcontact_ca02db53-8043-41a1-aaa6-5521685dc0cc", "name": "Maria Santoso", "phone": "+62-812-3456-7890", "email": "maria.santoso@kiranaretail.co.id", "company": "Kirana Retail Group" }
]
```

### `GET /api/mock-crm/activities`

The mock CRM's own activity store (`mockact_*` ids, keyed by `contactId` not `leadId` — it doesn't
know what a "lead" is, only a "contact," same as a real external CRM wouldn't).

```bash
curl http://localhost:3000/api/mock-crm/activities
```

```json
[
  {
    "id": "mockact_61e94be2-0a55-43c5-ad36-20b308511fe3",
    "contactId": "crmcontact_ca02db53-8043-41a1-aaa6-5521685dc0cc",
    "type": "CALL",
    "callId": "call_0081fbb8-8ac1-4f7d-a6fb-611394f5e1c3",
    "disposition": "Connected",
    "notes": "Call to Maria Santoso at Kirana Retail Group — connected.",
    "createdAt": "2026-08-17T17:18:40.263Z"
  }
]
```

## How the 2-line race works

Two lines dial concurrently. Every 250ms tick, the engine checks each active line in a fixed slot
order (slot 0, then slot 1):

- If a line's simulated ring time is up and it resolves `CONNECTED`, it immediately becomes the
  session's `winnerCallId`.
- The *other* active line is force-terminated as `CANCELED_BY_DIALER` **in that same tick** —
  regardless of whether its own ring time was already up or it was still mid-ring, and regardless
  of what its own outcome would have been. The engine checks "does a winner already exist this
  tick?" before it ever looks at a line's own scheduled result, so a losing line's outcome is
  simply never consulted, not overridden.
- Because slots are always processed in the same fixed order, the degenerate case — both lines
  resolving `CONNECTED` in the exact same tick — is still deterministic: slot 0 is evaluated
  first and wins every time, under the same seed, on every run.
- The losing lead goes back to the end of the queue once (capped per session so a lead can't loop
  forever); a second loss drops it permanently.
- While the winner is live, the second slot stays deliberately empty — the engine only dials the
  next pair once the winner's call ends, matching "when it ends, dial the next pair" literally.

This is exercised directly (not just asserted by inspection) in
[`dialer-engine.test.ts`](./src/server/dialer/dialer-engine.test.ts), including a scenario that
forces both lines to resolve `CONNECTED` at the identical timestamp.

## Deployment

Deployed as a single Render Web Service via [`render.yaml`](./render.yaml) (Blueprint). Node
version is pinned in [`.nvmrc`](./.nvmrc) and `package.json`'s `engines` field.

**State does not survive a restart, by design.** Every `Lead`/`DialerSession`/`Call`/`CRMActivity`
lives only in this process's memory — there's no database and no writable disk dependency. A
redeploy, a crash, or (on Render's free tier) the service spinning down after 15 minutes of
inactivity all wipe every session and CRM record back to just the 6 seeded leads. This is the
brief's explicit "in-memory state" requirement, not an accident — see `NOTES.md` for what would
change if this needed to survive a restart.

**Free tier cold start**: the free plan spins the service down after ~15 minutes idle. The first
request after that takes 30-60 seconds to respond while it spins back up — expect the first page
load to hang, not error. If you're coming back to re-test after a break, that first load being slow
is expected, not a bug; give it a minute and reload.
