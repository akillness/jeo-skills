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
  outbound HTTPS, while a trusted Jev-compatible endpoint may be local. The
  offline helper audits only local prerequisites and source structure.
license: PostgreSQL License (repository metadata says Other/NOASSERTION)
metadata:
  version: "1.1.0"
  source: https://github.com/realZachi/pg-jev
  upstream_commit: e3450d44f7f6745aa2d728c9289b9ca4a6feda9a
---

# pg-jev — PostgreSQL Jev extension operator

## When to use this skill

Use this skill for the exact `realZachi/pg-jev` extension: offline preflight,
approved installation or upgrade, endpoint/key configuration, SQL using public
`jev` functions, spend/performance checks, smoke-test proof, and troubleshooting.
Do not confuse it with the TypeSafe Jev decision harness: route Jev profile or
decision-service work to [`../jev-control-plane/SKILL.md`](../jev-control-plane/SKILL.md)
and explicit remote discovery to [`../jevgrep/SKILL.md`](../jevgrep/SKILL.md).
Generic PostgreSQL schema, query-planning, or security work belongs in the relevant
PostgreSQL skill.

## Instructions

### 1. Freeze scope and run the offline audit

1. Name the target server/database, PostgreSQL major, installed extension version,
   and endpoint before any action. Never put passwords, password-bearing URIs, or
   API keys in prompts, shell history, committed SQL, logs, or this skill.
2. Run the helper before live work; it opens no PostgreSQL/provider session:

   ```bash
   python3 .agent-skills/pg-jev/scripts/preflight.py --json
   python3 .agent-skills/pg-jev/scripts/preflight.py --repo /path/to/pg-jev --expect-commit e3450d44f7f6745aa2d728c9289b9ca4a6feda9a --json
   ```

   From an installed root: `python3 "$SKILLS_ROOT/pg-jev/scripts/preflight.py" --json`.
   It checks Python/current host and `pg_config`, `make`, `psql`, and `git`, plus
   supplied source structure and the caller-supplied commit pin. `ok` is not proof
   of PostgreSQL 14–17 support, matching `plpython3u`, server permissions/egress,
   endpoint compatibility, credentials, or semantic quality; inspect the exact
   checks and `runtime_verified: false`.
3. Treat `CREATE/ALTER EXTENSION`, package/PGXN/Docker installation, role/database
   GUC changes, ACL changes, smoke tests, and every query that can send row data as
   separate approval-gated operations. The helper performs none of them.

### 2. Keep the four hard safety boundaries inline

- **Server-side credentials:** the source reads `jev.api_key`, then
  `TYPESAFE_API_KEY` from the PostgreSQL **server process**; a client-shell variable
  is irrelevant. Enter a key privately only after endpoint/scope approval, and never
  print, echo, commit, paste, or `SHOW` the real value.
- **Row disclosure:** cache misses may send composite rows to the configured provider.
  Require explicit disclosure and cost approval; keep deterministic filters in SQL and
  expose only needed columns through a narrow view.
- **PUBLIC EXECUTE:** newly created functions retain PostgreSQL's default `PUBLIC`
  execute ACL. Revoke it and grant only approved roles before allowing provider data;
  re-check after upgrades. `jev.max_*` GUCs are cooperative, not hard security caps.
- **Non-STRICT wrappers:** nullable composite aliases (often unmatched `LEFT JOIN`
  rows) can reach PL/Python and fail at `row_json.encode()`. Guard with an inner join,
  `WHERE joined_alias IS NOT NULL`, or a non-null materialized view before `jev(...)`.

### 3. Reach the detailed operation only when its branch fires

For pinned control/SQL evidence, PGXS/PGXN/Docker commands, ACL SQL, GUC/API payload
contract, public function signatures, spend defaults, smoke proof, and troubleshooting,
read [`references/upstream.md`](references/upstream.md). It preserves every audited
operation and citation without loading those details for an offline-only check.

## Examples

### Offline source audit

```bash
python3 .agent-skills/pg-jev/scripts/preflight.py --repo /work/pg-jev --expect-commit e3450d44f7f6745aa2d728c9289b9ca4a6feda9a --json
```

Review blocked checks; do not treat path presence or tool availability as runtime
support or consent to send data.

### Approved live workflow

Read the relevant branch in [`references/upstream.md`](references/upstream.md), then
obtain separate approval for installation, ACL/GUC changes, provider disclosure, and
smoke proof. Keep endpoint class, version, request statistics, and errors—but never
credentials—in the evidence record.

## Best practices

- Pin the extension commit and model version for reproducible reports; record PostgreSQL
  major and `pg_config` path.
- Use cheap SQL predicates first, narrow views, closed choice options, and explicit
  row/character spend guards in shared deployments.
- Treat all cache-miss rows as potentially sensitive third-party disclosure; never infer
  provider or semantic correctness from a successful SQL install alone.
- Report unavailable tools, unverified majors, missing `plpython3u`/superuser access,
  failed egress, invalid credentials, local-server contract uncertainty, and nullable
  composite hazards plainly.

## References

- Detailed pinned operations: [`references/upstream.md`](references/upstream.md)
- Pinned source: <https://github.com/realZachi/pg-jev/tree/e3450d44f7f6745aa2d728c9289b9ca4a6feda9a>
- TypeSafe API contract: <https://docs.typesafe.ai/api.md>
- Project docs: <https://pgjev.com/docs>
