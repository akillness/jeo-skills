---
name: pg-jev
description: >
  Operate realZachi/pg-jev, the `jev` PostgreSQL extension for plain-language row
  predicates, probabilities, choices, and scores backed by TypeSafe Jev. Use when
  a user mentions pg-jev, pgjev, `CREATE EXTENSION jev`, `jev()`, `jev_prob`,
  `jev_choice`, `jev_score`, `jev_eval`, natural-language SQL filters, or asks to
  install, configure, query, cost-check, or troubleshoot this extension. Keep
  database mutation, provider calls, and secret handling explicitly approved.
allowed-tools: Bash Read Grep Glob
compatibility: >
  Requires a reachable PostgreSQL 14–17 server (CI-tested majors), `plpython3u`,
  a superuser for extension creation, and `psql`; source installs also need
  `pg_config` and `make`. TypeSafe-host calls need a server-side API key and
  outbound HTTPS, while a trusted Jev-compatible endpoint may be local.
license: PostgreSQL License (repository metadata says Other/NOASSERTION)
metadata:
  version: "1.0.0"
  source: https://github.com/realZachi/pg-jev
  upstream_commit: e3450d44f7f6745aa2d728c9289b9ca4a6feda9a
---

# pg-jev — PostgreSQL Jev extension operator

## When to use this skill

Use this skill for the exact `realZachi/pg-jev` extension: preflight, approved
installation or upgrade, API endpoint/key configuration, SQL using the public
`jev` functions, spend/performance checks, smoke-test proof, and troubleshooting.
It is not the TypeSafe Jev decision harness: route Jev profile/decision-service
work to [`../jev-control-plane/SKILL.md`](../jev-control-plane/SKILL.md) and
explicit remote discovery to [`../jevgrep/SKILL.md`](../jevgrep/SKILL.md).
Generic PostgreSQL schema, query-planning, or security work belongs in the
relevant PostgreSQL skill.

## Instructions

### 1. Freeze the target and approval boundary

1. Name the server, database, PostgreSQL major, installed extension version, and
   endpoint before acting. Do not put passwords, connection URIs with passwords,
   or API keys in prompts, shell history, committed SQL, logs, or this skill.
2. From the pinned pg-jev checkout, run the upstream read-only preflight first,
   with connection details supplied through the normal `psql` environment/service
   configuration rather than inline secrets:

   ```bash
   bash .agents/skills/pgjev/scripts/check_server.sh -d mydb
   ```

   It checks connectivity, PostgreSQL major, `plpython3u` availability/installation,
   current-role superuser status, `jev` availability/installation, and whether the
   `jev.api_key` GUC is set. Exit `0` means ready/already installed, `1` means a
   reported blocker, and `2` means it could not connect. It cannot inspect a
   server process environment variable, so it cannot prove `TYPESAFE_API_KEY`.
3. Treat `CREATE/ALTER EXTENSION`, package installation, role/database GUC changes,
   Docker actions, smoke tests, and any query that can send row data as separate
   approval-gated operations. A preflight is not consent for any of them.

### 2. Check support prerequisites

The pinned control file declares `default_version = '0.2.1'`, `schema = public`,
`relocatable = false`, and `requires = 'plpython3u'`. The pinned CI matrix tests
PostgreSQL 14, 15, 16, and 17. Do not call other majors supported; report them as
unverified. Confirm all of the following before installation:

- the target is self-hosted or otherwise permits untrusted `plpython3u` and a
  superuser; managed services that withhold either prerequisite cannot run this
  extension;
- `plpython3u` is available for the same PostgreSQL major as the target server;
- source installation has the target server's `pg_config` and `make` (the PGXS
  Makefile only copies control/SQL files; it does not compile a native library);
- the PostgreSQL server, not the client shell, can reach the configured endpoint;
- a TypeSafe API key is available only if the endpoint host is `typesafe.ai` or a
  subdomain. The extension source allows a non-`*.typesafe.ai` endpoint without a
  key, but the operator must verify and trust that server's Jev-compatible contract.

Typical package names documented by the project are `postgresql-plpython3-NN`
(Debian/Ubuntu), `postgresqlNN-plpython3` (RHEL-family), and
`postgresql-server-dev-NN`/`postgresqlNN-devel` for `pg_config`. Verify local
package names before installing anything.

### 3. Install or upgrade only after approval

Use one path and make the selected `pg_config` match the server used by `psql`.
Pin source operations to the reviewed commit when reproducibility matters:

```bash
git clone https://github.com/realZachi/pg-jev.git
cd pg-jev
git checkout e3450d44f7f6745aa2d728c9289b9ca4a6feda9a
make install PG_CONFIG=/path/to/pg_config
```

The project also documents these alternatives:

- PGXN: `pgxn install jev` (or `pgxn install jev=0.2.1`) with the target
  `pg_config`; `pgxnclient` must already be installed and the extension directories
  may require `sudo`.
- Docker: from the pinned checkout, `docker build --build-arg PG_MAJOR=16 -t
  pg-jev .`; the Dockerfile adds `plpython3u` and copies extension files. The image
  does **not** create the extension automatically.

As a superuser, and once database mutation is approved, create it per database:

```sql
CREATE EXTENSION IF NOT EXISTS jev CASCADE;
SELECT jev_version();
```

`CASCADE` is required on a fresh database because the control file requires
`plpython3u`. For an installed newer SQL distribution, use the explicit approved
upgrade path `ALTER EXTENSION jev UPDATE;` and then re-check `jev_version()`.

The pinned SQL does not alter PostgreSQL's default function ACL: newly created
functions are executable by `PUBLIC`. Before allowing row data to reach a provider,
apply least privilege in each database (after explicit approval) and grant only the
roles that may spend the configured key:

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

Replace `analyst` with an approved role. Re-apply and re-check these ACLs after an
extension upgrade because a newly introduced function can otherwise regain the
default `PUBLIC` execute grant. Function ACLs protect spend/data boundaries; the
`jev.max_rows_per_statement` and `jev.max_chars_per_statement` checks are cooperative
GUCs read by the function, not hard security caps for roles allowed to change them.

### 4. Configure the provider without exposing credentials

The source reads `jev.api_key` first, then `TYPESAFE_API_KEY` from the PostgreSQL
**server process**. The client shell's variable is irrelevant. Choose one approved
scope and enter the secret privately:

```sql
SET jev.api_key = 'REDACTED';                    -- session only
ALTER ROLE analyst SET jev.api_key = 'REDACTED'; -- persistent role setting
```

Never print, echo, commit, or paste the real value into an SQL file. `SHOW jev.api_key`
can disclose it; prefer a non-secret check or the preflight's `set`/unset report.
Role/database settings are visible to authorized database users, so choose scope
accordingly. Keep provider calls disabled until the user approves row disclosure,
endpoint, and expected cost.

The pinned SQL sends `POST /v1/systemone` with `Content-Type: application/json` and,
when a key is set, `Authorization: Bearer <key>`. Its body contains `model`, `state`,
and a nonempty `questions` map. For a noul query the state contains the condition and
serialized rows; choice/score questions carry criteria. A successful response must
contain `answers` keyed by the question ids and `usage` token counts. This matches the
TypeSafe API reference. The default model is `jev-latest`; set `jev.model` to a pinned
model (for example `jev-1.13.0`) when reproducibility matters.

For a local/proxy server, set an approved endpoint such as:

```sql
SET jev.api_url = 'http://127.0.0.1:8787/v1/systemone';
```

The project names stuntd and laya-server as examples of Jev-compatible servers. This
is an endpoint contract, not proof that a local server is running; verify it separately.

### 5. Use the stable SQL API deliberately

Judgment functions take the table/view alias (the composite row), not a text column:

```sql
-- Boolean filter; optional threshold overrides jev.threshold, then 0.5.
SELECT * FROM tickets t
WHERE status = 'open' AND jev(t, 'the customer threatens to cancel');

-- Rank, classify, and score.
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

Before a provider call, keep deterministic predicates (dates, arithmetic, exact
matches) in SQL and use a view to expose only columns needed for the semantic question.
`jev` is a full-scan-style judgment path: rows reaching it may be sent to the API on
cache misses; answers are cached per backend session. Prefer base tables/views over
anonymous CTE/subquery records for read-ahead batching. For shared deployments, set
approved spend guards such as `jev.max_rows_per_statement` and
`jev.max_chars_per_statement`; these are off by default. Operational defaults are
`jev.threshold = 0.5`, `jev.batch_size = 20`, `jev.concurrency = 16`,
`jev.max_prefetch_rows = 5000`, `jev.notices = on`, `jev.timeout = 30`, and
`jev.keepalive = 600`; the answer cache can still exceed the prefetch bound. Do not
assume `jev.max_prefetch_rows` bounds the answer cache or total session memory.

Guard nullable composite aliases before calling a judgment function. The pinned
wrappers are not declared `STRICT`; a SQL `NULL` row (for example an unmatched
`LEFT JOIN` alias) reaches PL/Python and the source then calls `row_json.encode()`
without a null check. Use an inner join, `WHERE joined_alias IS NOT NULL`, or a
non-null materialized view before `jev(...)`; this is separate from ordinary NULL
column values inside a real row.


### 6. Prove the result and record limits

After the user approves provider disclosure and cost, run the pinned smoke test:

```bash
psql -d mydb -f .agents/skills/pgjev/scripts/smoke_test.sql
```

It creates a five-row temporary table, invokes each public judgment shape, prints
`jev_stats()`, drops the temp table, and sends row contents to the configured
endpoint. Accept proof only when `jev_version()` matches the installed version,
results are returned, `jev_stats()` shows requests and `errors = 0`, and the command
exits successfully. A successful SQL install alone is not proof that the API call,
credentials, or endpoint work. Preserve the command, endpoint class (TypeSafe/local),
version, stats summary (never the key), and any error/notices.

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
| Unexpected provider calls or spend | Check `has_function_privilege` for the caller and re-apply the explicit `REVOKE PUBLIC`/role `GRANT` ACL after extension updates; `jev.max_*` is cooperative. |
| Missing functions/version drift | Run approved `SELECT jev_version()` and, if files are newer, `ALTER EXTENSION jev UPDATE`. |

`SELECT jev_stats();` is the first diagnostic for request count, tokens, cache hits,
retries, errors, API time, and estimated cost. It does not prove semantic correctness.

## Examples

### Read-only preflight

```bash
bash .agents/skills/pgjev/scripts/check_server.sh -h db.example -U analyst -d app
```

Review its verdict and blockers; do not treat a configured-key indicator as the key
being valid or as authorization to send data.

### Approved installation proof

```sql
CREATE EXTENSION jev CASCADE;
SELECT extversion FROM pg_extension WHERE extname = 'jev';
SELECT jev_version();
```

The first statement mutates the database and the following statements prove only local
installation. Run the smoke test separately for provider proof.

## Best practices

- Pin the extension source commit and model version when results feed reports or
  automation; record PostgreSQL major and `pg_config` path.
- State semantic conditions literally, use closed choice options, and inspect
  `jev_prob` distributions before choosing thresholds.
- Apply cheap SQL filters first, cap rows/chars in shared environments, and keep
  `jev.batch_size` near its documented default of 20 unless you have evidence.
- Treat every row sent on a cache miss as potentially sensitive third-party disclosure;
  use narrow views and obtain approval before remote calls.
- Report unverified PostgreSQL majors, unavailable PL/Python, missing superuser access,
  failed egress, invalid credentials, and local-server contract uncertainty plainly.

## References

- Pinned source: <https://github.com/realZachi/pg-jev/tree/e3450d44f7f6745aa2d728c9289b9ca4a6feda9a>
- Pinned README: <https://github.com/realZachi/pg-jev/blob/e3450d44f7f6745aa2d728c9289b9ca4a6feda9a/README.md>
- Pinned control/SQL: [`jev.control`](https://github.com/realZachi/pg-jev/blob/e3450d44f7f6745aa2d728c9289b9ca4a6feda9a/jev.control), [`sql/jev--0.2.1.sql`](https://github.com/realZachi/pg-jev/blob/e3450d44f7f6745aa2d728c9289b9ca4a6feda9a/sql/jev--0.2.1.sql)
- Pinned operator scripts: [`check_server.sh`](https://github.com/realZachi/pg-jev/blob/e3450d44f7f6745aa2d728c9289b9ca4a6feda9a/.agents/skills/pgjev/scripts/check_server.sh), [`install.sh`](https://github.com/realZachi/pg-jev/blob/e3450d44f7f6745aa2d728c9289b9ca4a6feda9a/.agents/skills/pgjev/scripts/install.sh), [`smoke_test.sql`](https://github.com/realZachi/pg-jev/blob/e3450d44f7f6745aa2d728c9289b9ca4a6feda9a/.agents/skills/pgjev/scripts/smoke_test.sql)
- Pinned license evidence: <https://github.com/realZachi/pg-jev/blob/e3450d44f7f6745aa2d728c9289b9ca4a6feda9a/LICENSE>
- TypeSafe API contract: <https://docs.typesafe.ai/api.md>
- Project docs: <https://pgjev.com/docs>
