---
name: context-mode
description: >
  Operate mksglu/context-mode, the Elastic License 2.0 MCP and hook/plugin
  system for temporary-script subprocess execution (not an OS/security sandbox),
  FTS5 indexing, context-savings telemetry, and session recovery. Use for install, inventory, verification,
  diagnosis, or measurement on Claude Code, Codex CLI, Gemini, Copilot, Cursor,
  OpenCode, KiloCode, OpenClaw, Pi, OMP, or another listed client. Also triggers
  on context-mode, ctx_execute, ctx_search, ctx_doctor, ctx_stats, or MCP/hook
  routing for this project.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: Requires Node.js >=22.5 or Bun for the current package; hook and plugin behavior is host-specific. Configuration and lifecycle writes require explicit approval.
license: Elastic-2.0
metadata:
  version: "1.1.0"
  source: https://github.com/mksglu/context-mode
  upstream_commit: abb104847cbb66c2182816a72bb69455bc778b5e
---

# Context Mode operator

`context-mode` is a portable MCP server plus host adapters. It keeps selected command,
file, web, and session data in subprocesses/SQLite, then returns selected output or FTS5
results. It is **not** an OS/security sandbox, proxy, shell-output wrapper, workspace index,
graph, or durable wiki. Child code retains normal user filesystem/network authority, and a
background child can outlive the call.

Hook capture and `ctx_search` can retain sensitive tool/session output. Before enabling capture,
approve scope, sensitivity, storage root and permissions, sharing, retention, and purge policy.
Never index credentials, tokens, secrets, or private data without a reviewed handling plan.

## When to use this skill

- Audit an install, runtime, MCP registration, host adapter, storage root, duplicate entry, or recovery path.
- Plan or perform one explicitly approved install, upgrade, purge, hook/config change, or fixed-workload measurement.
- Explain host-specific MCP, plugin, hook, routing, and no-hook limits.

## Route out

- Proxy compression or persistent routing → `headroom`.
- Shell output/token wrappers → `rtk`.
- Workspace hybrid/vector/BM25 search → `zvec-grep`.
- Code/corpus graph → `graphify`.
- Durable project memory/wiki → `opencontext` or `llm-wiki`.

## Instructions

### 1. Freeze scope and read the right reference

Record host, OS/architecture, and goal: `inventory`, `MCP-only`, `hooks/plugin`, `upgrade`, or
`measurement`. Read `references/upstream.md` when the branch needs the pinned runtime/storage
rules, host matrix, install commands, tool contract, cross-host postinstall, benchmark claims,
or source/license citations. Do not move `main` for version claims.

Run the non-mutating helper before any host inspection:

```bash
python3 .agent-skills/context-mode/scripts/preflight.py --json
python3 "$SKILLS_ROOT/context-mode/scripts/preflight.py" --json
```

The first command is for a repository checkout; the second is for an installed skill root.
The helper inventories Node/npm/npx/Bun/context-mode paths and host facts without executing
those tools or reading Claude/Codex settings, caches, sessions, credentials, or env files.
With `--repo PATH`, it may inspect only the public source shape and bounded local Git `HEAD`;
`--expect-commit FULL_SHA` requires `--repo` and is the only commit comparison pin.
It never invokes context-mode/npm, writes configuration, or makes network calls.

JSON output is one object with `skill`, `scope: "offline-preflight"`, `status` (`ok`, `blocked`,
or `error`), `checks`, and `runtime_verified: false`. Exit `0` means offline inventory checks
passed, `1` means missing or mismatched prerequisites, and `2` means invalid input. A status
`ok` is not proof of Node `>=22.5.0`, trusted hooks, host activation, readiness, or savings;
runtime versions remain explicitly unverified because the helper never executes host tools.

### 2. Inventory before writes

Inspect only the relevant host surface, record user/project scope and managed versus unmanaged
ownership, mask secrets, and do not rewrite JSON/TOML. A package, config, or binary is not proof
that the current session is connected. Never blanket-enable integrations or keep duplicate native
plugin and legacy MCP entries without an approved migration.

### 3. Keep authority and consent explicit

`ctx_execute` is arbitrary code execution, not a sandbox: child processes inherit normal user
filesystem/network rights. Require explicit approval before code execution, file access, network
fetch/index, background processes, hook/config/status-line writes, installs, upgrades, or purge.
The pinned npm postinstall can mutate cross-host Claude plugin/settings state, heal cached args,
remove stale cache files, and create symlinks; preview/back up and approve those paths as writes.
ELv2 permits redistribution only within its terms; substantial hosted/managed feature exposure,
license-key circumvention, and removing or obscuring protected notices are prohibited.

### 4. Verify in layers and report honestly

After an approved change, restart the named host, run its read-only doctor, inspect host
registration, and run `ctx stats` as separate gates. Verify Codex hook trust separately: stats
proves MCP reachability, not hook execution. Run the fixed no-file/no-network/no-background
JavaScript smoke only with code-execution approval. For measurements, freeze identical raw input,
returned bytes, cache hits, and hook state; label upstream claims separately from observed evidence.

## Examples

### Offline preflight

```bash
python3 .agent-skills/context-mode/scripts/preflight.py --json
```

### Source checkout and caller-supplied pin

```bash
python3 .agent-skills/context-mode/scripts/preflight.py --repo /path/to/context-mode --expect-commit FULL_SHA --json
```

The helper reports unverified runtime versions honestly; it does not turn a path or package
presence into a readiness claim.

## Best practices

- Keep one host, one install surface, and one hook owner; duplicate registration is a known failure mode.
- Keep `CONTEXT_MODE_DIR` absolute, writable, and isolated; define capture retention and purge before hooks.
- Use doctor, host registration, session smoke, and measurement as separate evidence gates.
- Attribute savings only to a fixed workload with captured bytes and hook state, never to badges or handshakes.
- Keep host-specific commands and all pinned citations in [`references/upstream.md`](references/upstream.md).

## References

- [`references/upstream.md`](references/upstream.md) — pinned host matrix, install/tool/storage/version contract, safety boundaries, commands, benchmark classification, ELv2 notes, and source citations.
- Upstream commit: `abb104847cbb66c2182816a72bb69455bc778b5e` (package/plugin `1.0.169`).
