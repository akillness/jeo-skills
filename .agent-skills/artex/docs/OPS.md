# ARTEX operations

## 1. Startup

Docker (recommended):

```bash
cp .env.example .env          # set POSTGRES_PASSWORD; optionally an LLM key
docker compose up -d --build
docker compose logs artex | grep "Setup token"
```

Open `http://localhost:8787`. The first visit to `/setup` asks for the one-time setup
token printed at startup (`[auth] no admin password is set. Setup token for the /setup
page: ...` in `server/auth.go`).

From source (no embedded UI):

```bash
go run ./cmd/artex                       # backend only, 127.0.0.1:8787
cd web && npm run dev                    # UI on :5173, /api proxied to the backend
# or: ./dev.sh                           # both, plus the traffic proxy on :8788
```

The process prints one `[config] snapshot {...}` line at startup. It is the authoritative
record of the effective configuration: config path, DSN source and **redacted** DSN,
data/skill/key directories, listen address, proxy, noise profile, untrusted-output
boundary and trusted proxies. No password or token value is ever logged there.

## 2. Configuration precedence

| Setting | Resolution order | Code |
| --- | --- | --- |
| Config file | `ARTEX_CONFIG` → `./config.json` → `config.json` next to the binary | `config.Path` |
| PostgreSQL DSN | `ARTEX_PG_DSN` → `ARTEX_PG_HOST` / `ARTEX_PG_PORT` / `ARTEX_PG_USER` / `ARTEX_PG_PASSWORD` / `ARTEX_PG_DBNAME` / `ARTEX_PG_SSLMODE` → `database.dsn` → assembled `host/port/user/password/dbname` | `config.PostgresDSN` |
| Skill directory | `ARTEX_SKILL_DIR` → `skill_dir` → `<binary dir>/skills` | `config.SkillDir` |
| JWT / secret key directory | `ARTEX_JWT_KEY_DIR` → `<binary dir>` (never the browsable data dir) | `config.KeyDir` |
| Secret encryption key | `ARTEX_SECRET_KEY` → `<key dir>/secret.key` → newly generated key file | `db.InitSecrets` |
| Noise profile | `ARTEX_NOISE_PROFILE` (`off` default; `quiet`, `balanced`, `aggressive`), also settable in UI | `egress.ProfileFromEnv` |
| Untrusted-output boundary | on by default; `ARTEX_UNTRUSTED_BOUNDARY=0\|false\|off\|no` disables it | `agent/untrusted_boundary.go` |
| Trusted proxies for login rate limit | `ARTEX_TRUSTED_PROXIES` (comma-separated IPs/CIDRs; empty trusts none) | `server.ParseTrustedProxies` |
| Target user agent | `ARTEX_TARGET_USER_AGENT` (applied by non-`off` noise profiles) | `egress.ProfileByName` |
| Budgets | `ARTEX_TASK_BUDGET_TOKENS` / `_TURNS`, `ARTEX_INTENT_BUDGET_TOKENS` / `_TURNS` | `agent/budget.go` |
| Live model judge test | `ARTEX_REVIEW_LIVE_CONFIG` (opt-in integration test only) | `server/intercept_live_test.go` |

Agent profiles, providers, notifications and other runtime settings live in the database
and are edited in **System → LLM / Settings / Notify**, not in `config.json`.

## 3. Backup and restore

```bash
scripts/backup.sh                       # database dump only, 14 rotations
scripts/backup.sh --with-data --keep 30 # also archive the data/ bind mount
```

The dump runs inside the `postgres` compose service, so no host `psql` is needed. Restore:

```bash
gunzip -c backups/artex-db-<ts>.sql.gz | docker compose exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

Back up the key directory as well: without it, JWTs cannot be verified and sealed
secrets cannot be decrypted. Keep it outside the database backup but under the same
access controls.

## 4. Key rotation

- **`jwt.key`** — signing key for the 7-day HS256 session tokens. Replacing it
  invalidates every existing session; all users must log in again. Existing key files
  are never overwritten by startup (`loadOrCreateJWTKey`).
- **`secret.key`** (or `ARTEX_SECRET_KEY`) — AES-256-GCM key for API keys, MCP env,
  task credentials and captured auth headers. Startup never overwrites an existing key.
  If it changes, values sealed under the old key cannot be decrypted (the code returns
  an error rather than leaking ciphertext as plaintext). Re-enter those secrets in the
  UI, or keep the previous key available until the migration is complete.

Plan a short maintenance window for either rotation.

## 5. Diagnostics and local verification

- `GET /api/health` — liveness, build version and provider health.
- `GET /api/logs`, `GET /api/logs/stream` — live backend log sink; the UI shows it under
  **System → Logs**. The startup snapshot line is here too.
- `scripts/verify.sh` — reproduces the CI checks locally (gofmt, build, vet, tests,
  web type-check and unit tests, shellcheck, python checks). `--full` adds `-race` and
  the web static build; `--go-only` / `--web-only` narrow the run.
- `./scripts/backup.sh --help` — backup options.

When Postgres is not configured, database-dependent tests skip themselves; that is
expected. Set `ARTEX_PG_DSN` to run them. CI uses `go test -p 1 ./...` because test
packages share a Postgres service and use suffixed per-package databases
(`SuffixTestDatabase`).
