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
  version: "1.0.169"
  source: https://github.com/mksglu/context-mode
  upstream_commit: abb104847cbb66c2182816a72bb69455bc778b5e
---

# Context Mode operator

`context-mode` is a portable MCP server plus host adapters: large command, file, web,
and session data stay in subprocesses/SQLite while selected stdout or FTS5 results return.
It is not an OS/security sandbox, proxy, shell-output wrapper, workspace index, graph, or durable wiki;
child code can retain normal user filesystem/network authority and can outlive the call when backgrounded.
This skill is pinned to `abb104847cbb66c2182816a72bb69455bc778b5e` (package/plugin `1.0.169`).
Hook capture can persist sensitive tool/session output: before enabling it, approve capture scope,
data sensitivity, storage root/permissions, sharing, retention, and purge policy. Never index secrets,
credentials, tokens, or private data without an explicit reviewed handling plan.

## When to use this skill

- Audit an install, MCP registration, hook/plugin lifecycle, storage root,
  runtime, duplicate configuration, or session recovery.
- Plan or perform one explicitly approved install, upgrade, purge, or host config
  change; or measure a fixed workload honestly.
- Explain supported clients and their hook, native-plugin, or MCP-only limits.

## Route out

- Proxy compression/persistent routing → `headroom`.
- Shell output/token wrappers → `rtk`.
- Workspace hybrid/vector/BM25 search → `zvec-grep`.
- Code/corpus graph → `graphify`.
- Durable project memory/wiki → `opencontext` or `llm-wiki`.

These are catalog entries in this checkout; do not combine their configuration or attribute
one tool's savings to another.

## Instructions

### 1. Freeze target and prerequisites

Record host, OS/architecture, and goal (**inventory**, **MCP-only**,
**hooks/plugin**, **upgrade**, or **measurement**). Read the pinned package and
platform matrix, not moving `main`, for version claims.

```bash
node --version
bun --version || true         # optional; do not install it for this check
if command -v context-mode >/dev/null; then
  context-mode --help
fi
```

The pinned package requires Node `>=22.5.0`; Bun is supported. Linux Node >=22.5 uses `node:sqlite`,
Bun uses `bun:sqlite`, and other paths use `better-sqlite3`; older glibc builds may need
C++20/Make/Python/setuptools. OpenClaw needs Node 22+ and a gateway newer than `2026.1.29`;
Codex hook behavior needs feature flags. Antigravity IDE and Zed have no hooks.

### 2. Inventory read-only before writes

Inspect only relevant host config; record user/project scope and managed versus unmanaged ownership,
mask secrets, and do not rewrite JSON/TOML.

| Host | MCP/plugin surface | Hook/routing surface | Verify |
|---|---|---|---|
| Claude Code | marketplace plugin, or `claude mcp add context-mode -- npx -y context-mode@1.0.169` | plugin hooks; optional settings status line | `/context-mode:ctx-doctor` |
| Gemini | `~/.gemini/settings.json` `mcpServers` | Before/AfterTool, PreCompress, SessionStart | `/mcp list`; `ctx stats` |
| VS Code / JetBrains Copilot | `.vscode/mcp.json` or IDE MCP UI | `.github/hooks/context-mode.json` | `ctx stats` |
| Copilot CLI | plugin `mksglu/context-mode:configs/copilot-cli`, or `copilot mcp add` | `$COPILOT_HOME/hooks/context-mode.json` | `ctx stats`; `doctor` |
| Cursor | `.cursor/mcp.json` | `.cursor/hooks.json` + `context-mode.mdc` | MCP indicator; `ctx stats` |
| OpenCode / KiloCode | `opencode.json` / `kilo.json` `plugin: ["context-mode"]` | in-process TypeScript hooks | `ctx stats`; no legacy MCP duplicate |
| OpenClaw / Pi | native gateway plugin, or Pi package + MCP | gateway/extension hooks | `ctx stats` |
| Codex CLI | marketplace `.codex-plugin/mcp.json`, or `[mcp_servers.context-mode]` | plugin hooks or `$CODEX_HOME/hooks.json` | `ctx stats`; hook trust separately |
| Kimi / Qwen | host MCP JSON/settings | host hook arrays/config | `ctx stats` |
| Antigravity IDE | `~/.gemini/antigravity/mcp_config.json` | none; copied `GEMINI.md` guidance | `ctx stats` |
| Antigravity CLI (`agy`) | plugin bundle or `~/.gemini/config/mcp_config.json` | bounded plugin hooks | `ctx stats`; `doctor` |
| Kiro | `.kiro/settings/mcp.json` | `.kiro/hooks/context-mode.json`, `KIRO.md` | MCP indicator; `ctx stats` |
| Zed | `~/.config/zed/settings.json` `context_servers` | none; copied `AGENTS.md` guidance | context-server indicator; `ctx stats` |
| OMP | `omp plugin install context-mode`, or `~/.omp/agent/mcp.json` | plugin lifecycle hooks | `omp plugin doctor`; `ctx stats` |

`context-mode doctor` is the read-only diagnostic for runtimes, hooks, FTS5, versions, registration,
and storage. A package/config/binary is not proof that the current session is connected.

### 3. Choose one approved install surface

Never blanket-enable integrations. Installing, changing config, copying routing files, enabling
hooks/features, adding a status line, or running `upgrade` is a scoped configuration write.

- **Claude plugin:** `/plugin marketplace add mksglu/context-mode`, then
  `/plugin install context-mode@context-mode`; restart or `/reload-plugins`.
  Marketplace resolution is moving: inspect its resolved revision/version before activation and stop
  if it is not this pin; use the pinned npm MCP-only path when an exact revision cannot be proven.
  It registers 11 tools and six lifecycle hooks. MCP-only has no auto-routing.
- **Global-package hosts:** after approval, `npm install -g context-mode@1.0.169`, then add only the
  named host's MCP/plugin and hook entries from pinned docs. The pinned `postinstall.mjs` may also
  mutate Claude state under `~/.claude/plugins/installed_plugins.json` and `~/.claude/settings.json`,
  heal cached plugin `mcpServers` args, remove stale cached `.mcp.json`, and create compatibility
  symlinks. Preview/back up those cross-host paths and approve them; do not call this host-local.
- **OpenCode/KiloCode:** use native `plugin: ["context-mode"]`; do not retain a
  legacy `mcp.context-mode` duplicate without an approved migration.
- **Codex:** prefer the marketplace plugin. Hooks are inactive until
  `[features].hooks = true` and gated `plugin_hooks = true` are enabled/trusted. Manual fallback is
  global npm plus `config.toml` and `$CODEX_HOME/hooks.json`; PreToolUse can deny but cannot rewrite
  args at this pin, and PreCompact is runtime-gated.
- **OpenClaw:** `npm run install:openclaw` mutates runtime state and needs
  approval for installer, state directory, native rebuild, and gateway restart.
- **No-hook clients:** Antigravity IDE and Zed have MCP plus model-guidance files
  only. Cursor rejects `sessionStart`; Kiro lacks `agentSpawn`.

### Safety and data boundary

`ctx_execute` is arbitrary code execution, not a security sandbox: pinned `executor.ts` runs from
the project root, preserves real `HOME` and most environment variables, and child processes retain
normal user filesystem/network authority. `background: true` can leave a process running. Require
explicit approval before arbitrary code, project/user file access, network activity, fetch/index,
or background processes. `ctx_execute_file` reads a caller-selected file and requires file-access
approval. Hook capture and `ctx_search` can expose retained sensitive output through a shared
`CONTEXT_MODE_DIR`; approve scope, permissions, sharing, retention, and purge policy first.
Never index credentials, tokens, secrets, or private data without a reviewed handling plan.

### 4. Know the contract and destructive boundaries

Pinned `src/server.ts` registers 11 tools: `ctx_execute`, `ctx_execute_file`, `ctx_batch_execute`,
`ctx_index`, `ctx_search`, `ctx_fetch_and_index`, `ctx_stats`, `ctx_doctor`, `ctx_upgrade`,
`ctx_purge`, and `ctx_insight`.

`ctx_execute` exposes detected JavaScript/TypeScript, Python, Shell, Ruby, Go, Rust, PHP, Perl, R,
Elixir, and C# runtimes. `ctx_index`/`ctx_search` use SQLite FTS5; `ctx_fetch_and_index` defaults
to a 24-hour cache (`force: true`/`ttl: 0` refreshes); `ctx_batch_execute` is bounded and indexes
output. `ctx_purge` permanently deletes indexed content. Session continuity is host-lifecycle-dependent
(PreToolUse, PostToolUse, compaction, session start), not proof of MCP reachability. Native
OpenCode/KiloCode tools are in-process. `CONTEXT_MODE_DIR` may set an absolute writable root;
do not assume clients can safely share a database.

`context-mode upgrade`/`ctx_upgrade` may write hooks/settings, migrate storage, repair plugin paths,
and remove duplicate entries: preview the diff and obtain approval. `statusline` prints only;
adding it to settings is another write. `ctx_purge` requires separate destructive approval.

### 5. Verify in layers and measure honestly

After an approved change, restart the named host and: (1) run `context-mode doctor` and record runtime,
adapter, FTS5, version, and hook/plugin state; (2) check the host listing, verifying Codex hook trust
separately because `ctx stats` proves MCP reachability, not hook execution; (3) run `ctx stats`; and
(4) only with explicit code-execution approval, run this fixed no-file/no-network/no-background smoke:
`ctx_execute(language: "javascript", code: "process.stdout.write(String(2 + 2))", timeout: 1000, background: false)`.
If recovery matters, test compaction/resume and report partial or unsupported lifecycle events.

Do not confuse claims with evidence:

| Statement | Classification |
|---|---|
| README says `~98%` with hooks and `~60%` without | upstream claim |
| `BENCHMARK.md`: 21 scenarios, 376 KB raw → 16.5 KB context (96%) | upstream self-report |
| Local `ctx_stats` for a fixed workload | observed runtime evidence |
| Same raw inputs, captured bytes, and hook state before/after | measured local evidence |

For local measurement, freeze workload, raw bytes, returned bytes, cache hits, and hook state for both
runs; report exact commands/session and limitations.

## Examples

### Read-only inventory

```bash
if command -v context-mode >/dev/null; then
  context-mode --help
  context-mode doctor
else
  echo "context-mode is not installed"
fi
```

Stop after recording output; do not call `upgrade` or edit hooks because a binary exists.

### Approved Claude plugin

```text
/plugin marketplace add mksglu/context-mode
/plugin install context-mode@context-mode
# restart, then /context-mode:ctx-doctor
```

### Approved MCP-only trial

```bash
claude mcp add context-mode -- npx -y context-mode@1.0.169
```

This omits hooks and slash commands, so routing is not automatically enforced.

## Best practices

- Keep one host, one install surface, and one hook owner; duplicate plugin/MCP
  entries are a known failure mode.
- Use `doctor`, host listing, and session smoke as separate gates.
- Treat routing files as guidance and hooks as enforcement; no-hook hosts lack the
  latter. Keep `CONTEXT_MODE_DIR` absolute, writable, and isolated.
- Before hooks/capture, define retention, purge, permissions, and sharing; never index secrets,
  credentials, tokens, or private data without an approved handling plan.
- Require scoped approval for installs, upgrades, hook/config writes, status-line
  edits, and purge. Never silently enable integrations.
- Attribute savings to fixed-workload/`ctx_stats` evidence, never to badges,
  package versions, or a successful MCP handshake.

## References

Pinned to `abb104847cbb66c2182816a72bb69455bc778b5e`:

- [README install matrix, commands, tools, benchmarks](https://github.com/mksglu/context-mode/blob/abb104847cbb66c2182816a72bb69455bc778b5e/README.md)
- [Package metadata and engines](https://github.com/mksglu/context-mode/blob/abb104847cbb66c2182816a72bb69455bc778b5e/package.json)
- [CLI and hook dispatch](https://github.com/mksglu/context-mode/blob/abb104847cbb66c2182816a72bb69455bc778b5e/src/cli.ts)
- [MCP tools and storage](https://github.com/mksglu/context-mode/blob/abb104847cbb66c2182816a72bb69455bc778b5e/src/server.ts)
- [Platform matrix](https://github.com/mksglu/context-mode/blob/abb104847cbb66c2182816a72bb69455bc778b5e/docs/platform-support.md)
- [Claude routing](https://github.com/mksglu/context-mode/blob/abb104847cbb66c2182816a72bb69455bc778b5e/configs/claude-code/CLAUDE.md)
- [Codex routing](https://github.com/mksglu/context-mode/blob/abb104847cbb66c2182816a72bb69455bc778b5e/configs/codex/AGENTS.md)
- [Benchmark methodology](https://github.com/mksglu/context-mode/blob/abb104847cbb66c2182816a72bb69455bc778b5e/BENCHMARK.md)
- [Elastic License 2.0](https://github.com/mksglu/context-mode/blob/abb104847cbb66c2182816a72bb69455bc778b5e/LICENSE)

- [Postinstall and cross-host self-healing](https://github.com/mksglu/context-mode/blob/abb104847cbb66c2182816a72bb69455bc778b5e/scripts/postinstall.mjs)

GitHub's API reports `Other`/`NOASSERTION`; the pinned `LICENSE` identifies Elastic License 2.0 (ELv2).
Redistribution is licensed subject to ELv2 terms, but a hosted/managed service exposing a substantial
set of features is prohibited; license-key circumvention and removing or obscuring protected
functionality/notices are also prohibited. Check the full license before redistribution or hosting.
