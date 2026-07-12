# TokHub project structure

## Single Go entrypoint, multiple roles

There is one Go binary, `cmd/tokhub`. Behavior is switched via the `TOKHUB_ROLE`
env var — this is the single most important thing to know before editing
`cmd/` or `internal/`:

| Role | What it runs |
| --- | --- |
| `all` | Web, API, Gateway, probing, and worker tasks in one process — local/small self-host |
| `api` | Public front-end, user console, platform admin backend, Open API only |
| `gateway` | OpenAI-compatible dedicated gateway only (`/gateway/v1/*`) |
| `prober` | Probe/health-check tasks only |
| `worker` | Async task/event extensions only |
| `migrate` | Runs DB migrations |
| `seed` | Seeds admin user, default org, site config, model catalog |

Default deployment runs everything as one container (`all`). At scale, split
via `deploy/compose/docker-compose.roles.yml` into separate `api`/`gateway`/
`prober`/`worker` containers, each with its own health-check port (`api`:
`8081`, `gateway`: `8082`; `prober`/`worker` expose health checks
network-internal only).

## Repo layout

- `cmd/tokhub/` — the single Go entrypoint
- `internal/` — Go application code (probes, gateway routing, API handlers, data access)
- `db/` — migration SQL, sqlc-generated queries/config (`sqlc.yaml`)
- `web/` — React + Vite + TypeScript frontend (React Router, Radix UI)
- `deploy/` — Dockerfile, Compose files (base + role-split overlay), Helm templates, `deploy/scripts/*` (preflight, backup, restore, security scan, release-check)
- `docs/` — `API.md`, `openapi.yaml`, `DEPLOYMENT.md`, `RECOVERY-DRILL.md`, `RELEASE.md`, `OPEN_SOURCE.md`, admin-agent docs
- `agent-skills/tokhub/` — TokHub's own bundled agent skill for connecting a
  running agent to a **live** TokHub instance's API (session/CSRF/admin-agent
  auth). This is a runtime-client skill shipped inside the TokHub repo itself
  — do not confuse it with this jeo-skills `tokhub` skill, which is about
  working on the TokHub codebase.
- `tests/` — Playwright and other test suites

## Tech stack

| Layer | Tech |
| --- | --- |
| Backend | Go, go-chi, pgx, sqlc, bcrypt |
| Frontend | React, Vite, TypeScript, React Router, Radix UI |
| Database | PostgreSQL, TimescaleDB, migration SQL, sqlc-generated queries |
| Cache/rate-limit | Redis |
| Events/tasks | NATS |
| Probing/gateway | L1/L2/L3 probe, OpenAI-compatible gateway, Anthropic/Gemini/OpenAI adapters |
| Deploy | Dockerfile, Docker Compose (base + role-split), Helm templates |
| Verification | `go test`, `go vet`, TypeScript, Vite build, Playwright, release/security scripts |

## L1/L2/L3 channel health probing

TokHub splits channel health into three layers instead of conflating "the
endpoint responds" with "the model actually generates":

- **L1 — connectivity**: resolve the endpoint URL, DNS resolve, TCP connect,
  TLS handshake (records cert expiry) for HTTPS, HTTP HEAD reachability.
  Classifies `dns_failed`, `tcp_failed`, `tls_failed`, generic `http` errors,
  and dead endpoints.
- **L2 — model availability**: calls the upstream `/models` endpoint to
  verify the API key is valid and the configured model exists/is listed
  (some providers can skip this via a provider profile). Classifies `401`/`403`
  as `auth_error`, missing models as `model_not_found`.
- **L3 — real generation**: sends a minimal chat-completion request with a
  prompt requiring a fixed reply, to catch "HTTP succeeded but the model
  didn't actually generate" false positives. Records total latency,
  estimated first-token time, HTTP status, token usage, and cost; classifies
  slow responses, rate limits, empty content, auth failure, and model
  unavailability separately.

**Status synthesis** combines L1/L2/L3 results into one of: `healthy`,
`degraded` (usable but slow/rate-limited/partial issues), `connectivity_down`,
`functional_down` (network may be fine but real generation fails),
`auth_error`, `unknown` (insufficient probe data). A health score combines
current status + success rate; snapshots record 24h uptime, success rate,
P95 latency, L1/L2/L3 latency, tokens, and cost.

## Gateway routing algorithm

The dedicated OpenAI-compatible gateway (`/gateway/v1/*`) builds a routing
candidate list per request:

1. Skip disabled upstreams.
2. Filter out upstreams currently `connectivity_down`, `auth_error`, or
   `functional_down`.
3. If *all* candidates are unhealthy, fall back to all enabled upstreams
   (never return an empty route set).
4. Sort by the gateway's configured strategy:
   - `latency` — lowest P95 latency first, health score breaks ties
   - `success` — highest success rate first, health score breaks ties
   - `cost` — lowest cost first, health score breaks ties
5. Skip channels currently in a short-lived circuit-breaker state.
6. Write the resulting routing plan to Redis for observability/reuse.

Redis also backs per-second gateway QPS buckets and short-term channel
circuit-breaker flags/routing-plan cache. If Redis is unavailable, the
service degrades to in-memory circuit-breaking and DB-only routing rather
than failing the gateway outright.

## Security model (relevant when touching credential/key code)

- Upstream API keys, private channel keys, and notification targets are
  stored AES-GCM encrypted; master key derives from `TOKHUB_SECRET_KEY`
  (must be ≥32 chars in production), random nonce per encryption.
- Gateway Keys use an `sk-th-` prefix; only a SHA-256 hash + short
  prefix/mask are stored server-side. The full key is shown once at
  creation only — never re-displayable, only rotatable/reissuable.
- Login passwords are bcrypt-hashed; session tokens store only a hash.
- Browser writes require Cookie + CSRF token double validation.
- Production requires `TOKHUB_SESSION_SECURE=true`.
- Site-scraping/channel-intro parsing blocks localhost, private/internal,
  link-local, multicast, reserved, and documentation address ranges (SSRF
  mitigation).
- Deleting a channel/user or governance actions purge/wipe related key
  material and write an audit event.
