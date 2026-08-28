# Open Executive operations and safety

Verified against upstream commit `3a48f77a35e6980335553b9bdd02724e00f6f239`.

## Risk tiers

Classify an operation before running it.

### Read-only

- `GET /health`, `GET /fixtures`, `GET /fixtures/status`
- listing agents, workflows, people, departments, decisions, audit rows
- reading the static architecture sections
- `openexecutive consolidate-initiatives` without `--apply`

### Stateful but recoverable

- loading a fixture company
- taking a fixture snapshot
- uploading a document, which indexes it into ChromaDB
- running a chat turn, which spends provider budget
- onboarding, which writes the company profile

### Destructive or externally visible

- `POST /fixtures/reset` — irreversible factory reset of live state **and** the
  snapshot; it re-seeds the eight default departments afterwards, which can
  make the wipe look like a benign reinitialization
- `POST /fixtures/unload` and `DELETE /fixtures/{name}`
- `openexecutive consolidate-initiatives --apply` — deletes merged rows and
  takes an immediate SQLite write lock
- `make clean` — removes the virtualenv, `node_modules`, `.next`, and caches
- `make stop` — runs a kill against every process listening on ports 8000 and
  3000, not only Open Executive
- any proactive DM or email send
- `flyctl secrets set` or `unset`, which restarts a live machine
- merging to `main`, which auto-deploys the dev environment

Never use a destructive route to work around a smaller problem, and never run
one on a machine or deployment you did not confirm with the user.

## Outbound messaging

Proactive DMs across Telegram, Slack, and Discord funnel through send-tool
handlers in the orchestrator, which call a single guard immediately before the
network send. The guard enforces three controls:

1. content dedup within a dedup window;
2. a per-recipient rate cap within a rolling window;
3. quiet hours and availability, including on-leave status.

Two properties matter more than the controls themselves:

- **The guard is fail-open.** Any internal lookup failure returns "allow",
  because an anti-spam helper must never turn a working send into a dropped
  message. Do not describe it as a hard safety gate.
- **It applies to both autonomous and human-requested sends**, and suppression
  is non-destructive: it returns a reason the Executive can read and then
  reword, hold, or reschedule.

Tuning knobs, with their documented defaults:

| Variable | Default | Effect |
|---|---|---|
| `OUTBOUND_MAX_PER_RECIPIENT_PER_WINDOW` | 5 | cap per recipient per window |
| `OUTBOUND_RATE_WINDOW_MINUTES` | 60 | rolling window for the cap |
| `OUTBOUND_DEDUP_WINDOW_MINUTES` | 360 | suppress near-identical resends |
| `OUTBOUND_RESPECT_QUIET_HOURS` | true | honor availability and leave |

Before enabling any channel, answer these questions with the user:

- Who exactly can reach the Executive, and who can it message back?
- Is the roster populated with real people or demo rows?
- Is this a production workspace, or a test workspace?
- Should quiet hours stay on?
- Who owns the resulting messages if the model is wrong?

## Channel notes

- **Discord**: the bot runs inside the API lifespan when `DISCORD_BOT_TOKEN` is
  set; `make discord` runs it standalone against the same local database.
  Requires the Message Content privileged intent, and the `bot` plus
  `applications.commands` scopes. Guild IDs register slash commands instantly;
  global registration can take up to an hour. Disabling in production means
  unsetting the token on the deployed app, which restarts the machine.
- **Email**: an IMAP poller checks on an interval; outbound goes through Gmail
  MCP as the configured executive address. There is deliberately no fallback
  address.
- **Telegram**: bot token plus a webhook secret you choose when registering.
- **Google Chat**: needs the numeric project number and one of two service
  account auth paths.
- **Slack**: bot and app tokens for socket mode.

Access for email, Telegram, and Discord is roster-driven: only senders whose
channel ID matches a non-archived Person row get a response. Manage that in the
people UI rather than inventing env-var allowlists.

## Fixtures

Three fictional demo companies ship with the repository. They exist to
demonstrate the product without real data, and their rosters use example
domains and non-routable IDs.

Two caveats:

- Loading some fixtures schedules an automatic research scan shortly after
  load, which performs real web searches and therefore real spend when search
  is enabled.
- The reset route wipes both live state and the snapshot. Use unload or a
  targeted delete when you only want to clear a demo, and confirm first.

## Scheduler, memory, and single-instance operation

The scheduler claims due actions atomically so one instance cannot double-fire.
This makes horizontal scaling unsafe: two API machines will run the same
scheduled action twice. The Fly configs pin the API to one running machine;
treat that as an invariant rather than a tuning parameter.

Episodic memory, alerts, and audit share one SQLite database. That is why a
large `--apply` consolidation can block a concurrent chat turn's background
extraction, and why upstream suggests pausing the API for large merges.

## Deployment

Two Fly.io environments, each a separate set of apps:

| Environment | Trigger | Apps |
|---|---|---|
| dev | push or merge to `main` | `openexec-api-dev`, `openexec-ui-dev` |
| qa | push or merge to `qa` | `openexec-api-qa`, `openexec-ui-qa` |

An optional Honcho memory app deploys independently. The API app keeps a
persistent volume mounted at `/data`; the UI is stateless.

Consequences to state plainly before touching a repository:

- merging to `main` ships to a live dev environment automatically;
- QA is a deliberate promotion branch and lags `main` on purpose;
- deploy tokens live in GitHub Actions secrets, runtime secrets live on each
  Fly app;
- the deployed UI is gated by Google sign-in plus an email allow-list, and the
  API expects the shared-secret header, so removing either exposes the app.

For rollbacks, operational runbooks, and known failure modes, read the upstream
deployment document rather than improvising.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Full-app tests return 401 | `BACKEND_SHARED_SECRET` is set in the shell; run tests with it unset |
| `npm run lint` opens an interactive prompt | the UI has no ESLint config; use `npm run build` as the gate |
| `make eval` finds no scenarios | the Makefile path does not exist in the repo; use the runner default |
| App refuses to start | no provider configured; set Anthropic, OpenRouter, or local model variables |
| First run seems hung | heavy ML dependencies plus a first-boot embedding-model download |
| Scheduled actions fire twice | more than one API machine is running |
| Post-login redirect lands on `0.0.0.0` | `AUTH_URL` is missing behind a proxy |
| Unexpected provider bill | web search enabled by code default, or fan-out across specialists |
