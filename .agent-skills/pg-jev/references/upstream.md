# pg-jev pinned operations reference

This reference preserves the audited operator evidence for `realZachi/pg-jev` at
commit `e3450d44f7f6745aa2d728c9289b9ca4a6feda9a`. It is reached from the router only
when an approved database, installation, provider, SQL, or troubleshooting operation
is actually in scope.

## Pinned source and support evidence

The pinned `jev.control` declares `default_version = '0.2.1'`, `schema = public`,
`relocatable = false`, and `requires = 'plpython3u'`. The pinned CI matrix tests
PostgreSQL 14, 15, 16, and 17. Do not call other majors supported; report them as
unverified.

A target must be self-hosted or otherwise permit untrusted `plpython3u` and a
superuser for extension creation. A managed service that withholds either prerequisite
cannot run this extension. `plpython3u` must match the PostgreSQL major serving the
target. Source installation needs that server's `pg_config` and `make`; the PGXS
Makefile only copies control/SQL files and does not compile a native library.
The PostgreSQL server, rather than only the client shell, must reach the configured
endpoint. A TypeSafe API key is needed only when the endpoint host is `typesafe.ai` or
a subdomain. The source permits a non-`*.typesafe.ai` endpoint without a key, but the
operator must verify and trust that server's Jev-compatible contract.

Documented package-name examples are `postgresql-plpython3-NN` (Debian/Ubuntu),
`postgresqlNN-plpython3` (RHEL-family), and
`postgresql-server-dev-NN`/`postgresqlNN-devel` for `pg_config`. Verify local package
names before installing anything.

## Read-only preflight boundary

The skill-local helper is offline and read-only. Run it from a repository root as:

```bash
python3 .agent-skills/pg-jev/scripts/preflight.py --json
python3 .agent-skills/pg-jev/scripts/preflight.py --repo /path/to/pg-jev --expect-commit e3450d44f7f6745aa2d728c9289b9ca4a6feda9a --json
```

From an installed skill root, use:

```bash
python3 "$SKILLS_ROOT/pg-jev/scripts/preflight.py" --json
```

It checks Python 3.10+, host OS/architecture, `pg_config`, `make`, `psql`, and `git`
availability. With `--repo`, it performs bounded local `git rev-parse --verify HEAD`
and checks these public structural files: `jev.control`, `sql/jev--0.2.1.sql`,
`Makefile`, `README.md`, and `LICENSE`. `--expect-commit` is the caller-supplied
comparison pin and requires `--repo`.
The Git probe uses a sanitized environment and accepts a commit only when Git's
resolved `--show-toplevel` matches the resolved `--repo` path.

The helper never opens a PostgreSQL or provider session, runs `psql`, invokes upstream
applications, reads credentials, reads env files, installs packages, writes config, or
contacts the network. A present path does **not** prove PostgreSQL 14–17 support,
matching `plpython3u`, server egress, superuser/server permissions, endpoint contract,
credential validity, or semantic/model quality. JSON output is one object with
`skill`, `scope: "offline-preflight"`, `status` (`ok`, `blocked`, or `error`),
`checks`, and `runtime_verified: false`; exit `0` means checks passed, `1` means a
missing/mismatched prerequisite, and `2` means invalid input.

The former upstream connectivity check remains evidence for an approved live
operation, not for this helper:

```bash
bash .agents/skills/pgjev/scripts/check_server.sh -d mydb
```

It checks connectivity, PostgreSQL major, `plpython3u` availability/installation,
current-role superuser status, `jev` availability/installation, and whether the
`jev.api_key` GUC is set. Exit `0` means ready/already installed, `1` a reported
blocker, and `2` it could not connect. It cannot inspect a server process environment
variable and therefore cannot prove `TYPESAFE_API_KEY`.
For a named target, the original operator example is:

```bash
bash .agents/skills/pgjev/scripts/check_server.sh -h db.example -U analyst -d app
```

Review its verdict and blockers; a configured-key indicator is not proof that the key
is valid or authorization to send data.

## Installation and upgrade (approval required)

Use one path and make `pg_config` match the server used by `psql`. Pin source
operations to the reviewed commit when reproducibility matters:

```bash
git clone https://github.com/realZachi/pg-jev.git
cd pg-jev
git checkout e3450d44f7f6745aa2d728c9289b9ca4a6feda9a
make install PG_CONFIG=/path/to/pg_config
```

Alternatives documented by the project:

- PGXN: `pgxn install jev` (or `pgxn install jev=0.2.1`) with the target
  `pg_config`; `pgxnclient` must already be installed and extension directories may
  require `sudo`.
- Docker: from the pinned checkout,
  `docker build --build-arg PG_MAJOR=16 -t pg-jev .`; the Dockerfile adds
  `plpython3u` and copies extension files. The image does **not** create the
  extension automatically.

As a superuser, after database mutation is explicitly approved, create it per database:

```sql
CREATE EXTENSION IF NOT EXISTS jev CASCADE;
SELECT jev_version();
SELECT extversion FROM pg_extension WHERE extname = 'jev';
```

`CASCADE` is required on a fresh database because the control file requires
`plpython3u`. For an installed newer SQL distribution, use the explicit approved
upgrade path and re-check the version:

```sql
ALTER EXTENSION jev UPDATE;
SELECT jev_version();
```

## ACL and PUBLIC EXECUTE boundary (approval required)

The pinned SQL does not alter PostgreSQL's default function ACL: newly created
functions are executable by `PUBLIC`. Before allowing row data to reach a provider,
apply least privilege in each database and grant only roles that may spend the
configured key:

```sql
REVOKE EXECUTE ON FUNCTION
  public._jev_eval(text,text,text,text,text),
  public.jev(anyelement,text,float8), public.jev_prob(anyelement,text),
  public.jev_score(anyelement,text,text[]), public.jev_score_norm(anyelement,text,text[]),
  public.jev_choice(anyelement,text,text[]), public.jev_confidence(anyelement,text,text,text[]),
  public.jev_eval(anyelement,text,text,text[]), public.jev_stats(),
  public.jev_cache_clear(), public.jev_version()
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  public.jev(anyelement,text,float8), public.jev_prob(anyelement,text),
  public.jev_score(anyelement,text,text[]), public.jev_score_norm(anyelement,text,text[]),
  public.jev_choice(anyelement,text,text[]), public.jev_confidence(anyelement,text,text,text[]),
  public.jev_eval(anyelement,text,text,text[]), public.jev_stats(),
  public.jev_cache_clear(), public.jev_version()
TO analyst;
```

Replace `analyst` with an approved role. Re-apply and re-check ACLs after every
extension upgrade: a newly introduced function can otherwise regain `PUBLIC` execute.
Function ACLs protect spend/data boundaries; `jev.max_rows_per_statement` and
`jev.max_chars_per_statement` are cooperative GUCs, not hard security caps for roles
allowed to change them.

## Provider configuration and API contract (approval required)

The source reads `jev.api_key` first, then `TYPESAFE_API_KEY` from the PostgreSQL
**server process**. The client shell variable is irrelevant. Choose an approved scope
and enter the secret privately:

```sql
SET jev.api_key = 'REDACTED';
ALTER ROLE analyst SET jev.api_key = 'REDACTED';
```

Never print, echo, commit, or paste the real value into SQL, logs, or prompts.
`SHOW jev.api_key` can disclose it; prefer a non-secret check or the preflight's
set/unset report. Role/database settings are visible to authorized database users, so
choose scope accordingly. Keep provider calls disabled until row disclosure, endpoint,
and expected cost are explicitly approved.

The pinned SQL sends `POST /v1/systemone` with `Content-Type: application/json` and,
when a key is set, `Authorization: Bearer <key>`. Its body contains `model`, `state`,
and a nonempty `questions` map. For a noul query, state contains the condition and
serialized rows; choice/score questions carry criteria. A successful response contains
`answers` keyed by question ids and `usage` token counts, matching the TypeSafe API
reference. The default model is `jev-latest`; set `jev.model` to a pinned model (for
example `jev-1.13.0`) when reproducibility matters.

For a local/proxy server, an approved endpoint can be configured as:

```sql
SET jev.api_url = 'http://127.0.0.1:8787/v1/systemone';
```

The project names stuntd and laya-server as examples of Jev-compatible servers. This
is an endpoint contract, not proof that a local server is running; verify it separately.

## Stable SQL API and data disclosure

Judgment functions take a table/view alias (the composite row), not a text column:

```sql
SELECT * FROM tickets t
WHERE status = 'open' AND jev(t, 'the customer threatens to cancel');

SELECT id, jev_prob(t, 'the customer is angry') AS p
FROM tickets t ORDER BY p DESC LIMIT 20;

SELECT jev_choice(t, 'which team should handle this?',
                  ARRAY['billing', 'technical', 'sales']) AS team
FROM tickets t;

SELECT id, jev_score(t, 'how positive is this review?',
                     ARRAY['negative', 'neutral', 'positive']) AS score
FROM reviews t;
```

The pinned SQL defines `jev(anyelement,text,float8 default null) -> boolean`,
`jev_prob -> float8`, `jev_score -> float8`, `jev_score_norm -> float8`,
`jev_choice -> text`, `jev_confidence -> float8`, `jev_eval -> jsonb`,
`jev_stats -> jsonb`, `jev_cache_clear() -> void`, and `jev_version() -> text`.
`jev_eval`/`jev_confidence` kinds are `noul`, `choice`, or `score`; choice options
are a closed set and score levels are ordered.
For `jev`, an explicit threshold overrides `jev.threshold`; otherwise the default is
`0.5`.

Before a provider call, keep deterministic predicates (dates, arithmetic, exact
matches) in SQL and use a view that exposes only columns needed for the semantic
question. `jev` is a full-scan-style judgment path: rows reaching it may be sent to
the API on cache misses; answers are cached per backend session. Prefer base
tables/views over anonymous CTE/subquery records for read-ahead batching.

## GUCs, spend controls, and null-composite hazard

For shared deployments, set approved spend guards such as
`jev.max_rows_per_statement` and `jev.max_chars_per_statement`; they are off by
default. Operational defaults are:

- `jev.threshold = 0.5`
- `jev.batch_size = 20`
- `jev.concurrency = 16`
- `jev.max_prefetch_rows = 5000`
- `jev.notices = on`
- `jev.timeout = 30`
- `jev.keepalive = 600`

The answer cache can still exceed the prefetch bound; do not assume
`jev.max_prefetch_rows` bounds the answer cache or total session memory.

The pinned wrappers are not declared `STRICT`. A SQL `NULL` composite row (for
example an unmatched `LEFT JOIN` alias) reaches PL/Python, and the source then calls
`row_json.encode()` without a null check. Use an inner join,
`WHERE joined_alias IS NOT NULL`, or a non-null materialized view before
`jev(...)`. This is separate from ordinary NULL column values inside a real row.

## Smoke-test proof (approval required)

After provider disclosure and cost are approved, run the pinned smoke test:

```bash
psql -d mydb -f .agents/skills/pgjev/scripts/smoke_test.sql
```

It creates a five-row temporary table, invokes each public judgment shape, prints
`jev_stats()`, drops the temporary table, and sends row contents to the configured
endpoint. Accept proof only when `jev_version()` matches the installed version,
results are returned, `jev_stats()` shows requests and `errors = 0`, and the command
exits successfully. A successful SQL install alone does not prove API calls,
credentials, or endpoint behavior. Preserve command, endpoint class (TypeSafe/local),
version, stats summary (never the key), and errors/notices.

## Troubleshooting

| Evidence | Likely cause and next bounded check |
| --- | --- |
| `could not open extension control file ... jev.control` | Files were installed for another PostgreSQL; compare `pg_config`/`--sharedir` with the server used by `psql`. |
| `plpython3u.control` missing or `language "plpython3u" does not exist` | Install the matching PL/Python package on a host that permits it. |
| `required extension "plpython3u" is not installed` | Use approved `CREATE EXTENSION jev CASCADE`. |
| `permission denied ... CREATE EXTENSION` / `must be superuser` | Use an approved DBA/superuser path; do not bypass permissions. |
| `jev: no API key` | Key is absent from the GUC and server process environment; a client-shell key does not count. |
| `jev: TypeSafe API error 401/422` | Check approved endpoint/key/model/options; do not print credentials or retry blindly. |
| 429/5xx, connection errors, or `jev.timeout` | Check server egress/proxy and provider status; lower concurrency or retry only with approval. |
| One request per row | The call is on a CTE/subquery `record`; move it to a base table or view when appropriate. |
| `AttributeError`/failure while hashing a row | A nullable composite alias was passed (often an unmatched `LEFT JOIN` row); filter the alias with `IS NOT NULL` or use a non-null base row. |
| Unexpected provider calls or spend | Check `has_function_privilege` for the caller and re-apply explicit `REVOKE PUBLIC`/role `GRANT` ACL after extension updates; `jev.max_*` is cooperative. |
| Missing functions/version drift | Run approved `SELECT jev_version()` and, if files are newer, `ALTER EXTENSION jev UPDATE`. |

`SELECT jev_stats();` is the first diagnostic for request count, tokens, cache hits,
retries, errors, API time, and estimated cost. It does not prove semantic correctness.

## Pinned citations

- Pinned source: <https://github.com/realZachi/pg-jev/tree/e3450d44f7f6745aa2d728c9289b9ca4a6feda9a>
- Pinned README: <https://github.com/realZachi/pg-jev/blob/e3450d44f7f6745aa2d728c9289b9ca4a6feda9a/README.md>
- Pinned control/SQL: [`jev.control`](https://github.com/realZachi/pg-jev/blob/e3450d44f7f6745aa2d728c9289b9ca4a6feda9a/jev.control), [`sql/jev--0.2.1.sql`](https://github.com/realZachi/pg-jev/blob/e3450d44f7f6745aa2d728c9289b9ca4a6feda9a/sql/jev--0.2.1.sql)
- Pinned operator scripts: [`check_server.sh`](https://github.com/realZachi/pg-jev/blob/e3450d44f7f6745aa2d728c9289b9ca4a6feda9a/.agents/skills/pgjev/scripts/check_server.sh), [`install.sh`](https://github.com/realZachi/pg-jev/blob/e3450d44f7f6745aa2d728c9289b9ca4a6feda9a/.agents/skills/pgjev/scripts/install.sh), [`smoke_test.sql`](https://github.com/realZachi/pg-jev/blob/e3450d44f7f6745aa2d728c9289b9ca4a6feda9a/.agents/skills/pgjev/scripts/smoke_test.sql)
- Pinned license evidence: <https://github.com/realZachi/pg-jev/blob/e3450d44f7f6745aa2d728c9289b9ca4a6feda9a/LICENSE>
- TypeSafe API contract: <https://docs.typesafe.ai/api.md>
- Project docs: <https://pgjev.com/docs>
