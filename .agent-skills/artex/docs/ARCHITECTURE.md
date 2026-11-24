# ARTEX architecture (code-level companion)

The README's [Architecture](https://github.com/BaaRai/ARTEX#architecture) section has the
component diagram and the 10,000-foot view. This document records the code-level map,
the execution flow and the trust boundaries that are easy to miss when reading the
packages in isolation.

## 1. The two graphs

ARTEX keeps two linked graphs, both in PostgreSQL (`db/schema.sql`):

| Graph | Answers | Main tables | Code |
| --- | --- | --- | --- |
| **Asset graph** | *What exists?* | `companies`, `company_scope`, `assets`, `task_scope` | `db/assets.go`, `db/companies.go`, `db/company_scope.go`, `db/task_assets.go` |
| **Exploration graph** | *What was tried, with what result and why?* | `explorations`, `exploration_nodes`, `activity`, `intent_*`, `coverage_*` | `db/exploration.go`, `db/coverage_ledger.go`, `db/finding_assets.go` |

Anchors tie a finding to the assets that justify it (`db/finding_assets.go`). Traffic
snapshots are archived separately and referenced from findings
(`db/finding_traffic.go`, `db/finding_traffic_archive.go`, `traffic/archive.go`).

`db.Open` executes the idempotent `schema.sql` on every startup, then applies pending
numbered migrations from `db/migrations/*.sql`, recording name + SHA-256 in
`schema_migrations`. A published migration is never edited; fix forward with a new one.

## 2. Package map

| Package | Responsibility | Notes |
| --- | --- | --- |
| `cmd/artex` | Process entry point | Flags (`-addr`, `-data`, `-proxy`), startup config snapshot, signal handling, graceful drain |
| `config` | Resolve config file + env | `Path`, `Load`, `PostgresDSN`, `SkillDir`, `KeyDir`, `Redact`. Env wins over file |
| `db` | All persistence | `DB`, `Manager`-independent stores; AES-256-GCM secret columns in `secrets.go` |
| `agent` | LLM roles and tools | `goals`, `planner`, `worker`, `mainagent`, `retester`; `ToolSet` in `tools.go`; tool catalog in `toolcatalog.go` |
| `server` | HTTP API + orchestration | `net/http` mux (~270 routes), `Manager`, `Engine`, JWT auth, SSE broadcaster |
| `traffic` | Recording proxy | MITM proxy built on `go-mitmproxy`, replay, rewrite rules, body archive |
| `evidence` | Evidence store | Persisted request/response snapshots used by findings |
| `intercept` | Approval gate | Judge, argv grammar, target gate, pins, risk scoring (a `PreToolUse` hook) |
| `guard` | Hook wiring | Binds `intercept` decisions into Norma's hook registry; `NewTargetOnly` for planner/mainagent |
| `egress` | Noise governor | Per-host token bucket, jitter, concurrency caps, 429/503 backoff; default profile is strict passthrough |
| `llmpool` / `llmrec` | Provider pool / recorder | Rotation, health, usage + raw wire capture |
| `mcphttp` | MCP client | HTTP/SSE transport for configured MCP servers |
| `notify` | Outbound notifications | Email, webhook, Telegram, Feishu, DingTalk with masking and SSRF guards |
| `report` | Deliverables | Markdown, CSV and JSON rendering of findings |
| `sidequestion` | Operator Q&A | Asks a human mid-run and suspends intent until answered |
| `skills/` | Skill definitions | One `SKILL.md` per subdirectory, loaded from `SkillDir()` |

The frontend lives in `web/` (Next.js 16, React 19) and is embedded into the Go
binary via `server/webui_embed.go` when built with `-tags embedui`.

## 3. End-to-end flow: goal → finding with evidence

1. **Task creation.** `server.createTask` → `Manager.CreateTaskWithOptions` writes the
   task, its scope and seed goals, and creates the exploration graph (`db/tasks.go`).
2. **Loop start.** `Engine.Run` (`server/engine.go`) starts a planner loop and N worker
   goroutines under a task-scoped context. Nothing needs an LLM to be configured for the
   loops to exist; they idle until one is.
3. **Decomposition.** The `goals` role writes goals and operation constraints through
   `set_goals` / `set_constraints` (`agent/toolcatalog.go`, `agent/tools.go`).
4. **Planning.** `Planner.Plan` (`agent/planner.go`) reads the route, queries the asset
   graph, judges goals and emits intents (`addOneIntent`). Every intent is an
   exploration node, so it is auditable like any other activity.
5. **Execution.** `Worker.Execute` (`agent/worker.go`) claims an intent, runs tools with
   the guard hooks attached and writes observed facts back to the exploration graph.
6. **Tools and traffic.** Shell and HTTP/WebFetch calls go through the recording proxy
   and the egress governor. Platform-owned HTTP clients use `intercept.PinnedDialer`
   and `intercept.RedirectCheck`, so a redirect or a direct retry is re-checked at
   dial time. When a proxy is in the path the gate records the pin as name-only: the
   proxy makes the outbound connection, so no IP binding can be claimed.
7. **Findings.** `addFinding` (`agent/tools.go`) records severity, class, confidence and
   asset references; `db/findings.go` dedups and keeps the status workflow. Evidence is
   linked to captured traffic (`traffic/evidence.go`, `db/finding_traffic.go`).
8. **Completion.** `prove_goal` marks a goal met; the last met goal completes the task.
   `goal_met` is deliberately unbound by default because it bypasses per-goal proof.

## 4. Execution control

- **Per-task context:** pause/cancel/kill attach a named cause via
  `context.WithCancelCause` so the activity trace records who initiated a stop.
- **Per-intent control:** the UI can pause/cancel one intent; `steerBox` queues a
  planner course-correction that the worker's `PreToolUse` hook drains before the next
  tool call, re-planning without killing the run.
- **Delete barrier:** `Engine.BeginDelete` makes installing the barrier atomic with
  registering an in-flight operation; after it returns, no new task-owned writes are
  admitted and the task context is cancelled once existing writers drain.
- **Quiet mode:** an unchanged open-goal fingerprint suppresses redundant planning
  rounds while work is still in flight.

## 5. Trust boundaries

| Boundary | Implementation |
| --- | --- |
| Tool output → model | Norma's untrusted-output boundary: nonce-tagged markers around tool results. On by default; `ARTEX_UNTRUSTED_BOUNDARY=0` disables it. See `agent/untrusted_boundary.go` |
| Command → host | Allow rules match one Bash simple command with the exact prefix: a pipeline, redirection, wrapper (`env`, `sudo`, `xargs`, `find -exec`, a shell `-c`), substitution or expansion does not inherit an allow. Deny and ask rules also inspect every simple command inside wrappers, lists and pipelines. `ArgvPrefixOf` derives the human-readable prefix |
| URL → network | Target gate + `PinnedDialer` + `RedirectCheck`: scope decisions are re-made against a fresh DNS lookup at dial time, and without a proxy the client connects only to the addresses it compared; with a proxy the pin is name-only |
| Secrets → disk/log | `db/secrets.go` seals API keys, proxy credentials, MCP env, task credentials and captured auth headers with AES-256-GCM, nonce per value, AAD `table.column`. JWT keys live in `KeyDir()`, never in the browsable data dir. The boot snapshot logs only `config.Redact(dsn)` |
| Approval → audit | Every decision records the approver (`jwtSubject`), source and decision; history is queryable through `/api/intercept/history` and `/api/intercept/history/{id}` (with `/execution` for the audit detail). `/api/tasks/{id}/intercept-rules` manages rules, not history |

## 6. Decisions

- **ADR-001 — Nonce-tagged untrusted output.** Tool output is framed with a per-run
  nonce rather than trusting the model to distinguish instructions from data.
- **ADR-002 — Pin at dial time.** A URL decision is not enough: DNS can change between
  the hook and the connection, so the dialer re-resolves and connects only to compared
  addresses.
- **ADR-003 — AES-GCM with per-column AAD.** Sealed values are bound to their table and
  column (and settings to their key), so a ciphertext cannot be moved to another field.

## 7. Where to look next

- `docs/OPS.md` for startup, configuration precedence, backup and key rotation.
- `docs/vulnerability-traffic-evidence.md` for how a finding keeps its receipts.
- `docs/traffic-rewrite-rules.md` for the rewrite engine.
- `scripts/verify.sh` to reproduce the CI checks locally.
