# context-mode upstream reference

This reference preserves the audited host, installation, tool, storage, version, and license details for `mksglu/context-mode`. It is pinned to commit `abb104847cbb66c2182816a72bb69455bc778b5e` and package/plugin `1.0.169`. Treat upstream files as source material, not as permission to mutate a host.

## Runtime, storage, and platform facts

- The pinned package requires Node `>=22.5.0`; Bun is supported.
- Linux on Node `>=22.5` uses `node:sqlite`; Bun uses `bun:sqlite`; other paths use `better-sqlite3`.
- Older glibc builds may need C++20, Make, Python, and setuptools.
- OpenClaw needs Node 22+ and a gateway newer than `2026.1.29`.
- Codex hook behavior needs feature flags. Antigravity IDE and Zed have no hooks.
- `CONTEXT_MODE_DIR` may set an absolute writable root. Do not assume clients can safely share a database.
- FTS5 indexes and fetch/cache data are retained under the context-mode storage root; `ctx_fetch_and_index` defaults to a 24-hour cache, while `force: true` or `ttl: 0` refreshes it.

The upstream runtime probe is a separately approved host operation, not the offline helper:

```bash
node --version
bun --version || true         # optional; do not install it for this check
if command -v context-mode >/dev/null; then
  context-mode --help
fi
```

## Read-only host inventory

Inspect only relevant host configuration, record user/project scope and managed versus unmanaged ownership, mask secrets, and do not rewrite JSON/TOML. The following surfaces were audited at the pinned revision:

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

`context-mode doctor` is the read-only diagnostic for runtimes, hooks, FTS5, versions, registration, and storage. A package, config, or binary is not proof that the current session is connected.

## Approved installation surfaces

Installing, changing config, copying routing files, enabling hooks/features, adding a status line, or running `upgrade` is a scoped configuration write. Blanket-enabling integrations is not an installation plan.

### Claude plugin

```text
/plugin marketplace add mksglu/context-mode
/plugin install context-mode@context-mode
# restart, then /reload-plugins
```

The marketplace revision is moving: inspect its resolved revision/version before activation and stop if it is not the pinned commit. Use the pinned npm MCP-only path when an exact revision cannot be proven. The plugin registers 11 tools and six lifecycle hooks; MCP-only has no auto-routing.

### Global-package hosts

After explicit approval:

```bash
npm install -g context-mode@1.0.169
```

Then add only the named host's MCP/plugin and hook entries from the pinned docs. The pinned `scripts/postinstall.mjs` may mutate Claude state under `~/.claude/plugins/installed_plugins.json` and `~/.claude/settings.json`, heal cached plugin `mcpServers` args, remove stale cached `.mcp.json`, and create compatibility symlinks. Preview and back up those cross-host paths and obtain approval; do not describe this as host-local package installation.

### Host-specific boundaries

- OpenCode/KiloCode use native `plugin: ["context-mode"]`; do not retain a legacy `mcp.context-mode` duplicate without an approved migration.
- Codex: prefer the marketplace plugin. Hooks are inactive until `[features].hooks = true` and gated `plugin_hooks = true` are enabled and trusted. Manual fallback is global npm plus `config.toml` and `$CODEX_HOME/hooks.json`; PreToolUse can deny but cannot rewrite args at this pin, and PreCompact is runtime-gated.
- OpenClaw: `npm run install:openclaw` mutates runtime state and needs approval for installer, state directory, native rebuild, and gateway restart.
- No-hook clients: Antigravity IDE and Zed have MCP plus model-guidance files only. Cursor rejects `sessionStart`; Kiro lacks `agentSpawn`.

## Safety and data boundary

`ctx_execute` is arbitrary code execution, not a security sandbox. Pinned `executor.ts` runs from the project root, preserves real `HOME` and most environment variables, and child processes retain normal user filesystem and network authority. `background: true` can leave a process running. Require explicit approval before arbitrary code, project/user file access, network activity, fetch/index, or background processes. `ctx_execute_file` reads a caller-selected file and requires file-access approval.

Hook capture and `ctx_search` can expose retained sensitive output through a shared `CONTEXT_MODE_DIR`; approve scope, permissions, sharing, retention, and purge policy first. Never index credentials, tokens, secrets, or private data without a reviewed handling plan.

## Tools, storage, and destructive boundaries

Pinned `src/server.ts` registers 11 tools:

```text
ctx_execute
ctx_execute_file
ctx_batch_execute
ctx_index
ctx_search
ctx_fetch_and_index
ctx_stats
ctx_doctor
ctx_upgrade
ctx_purge
ctx_insight
```

`ctx_execute` exposes detected JavaScript/TypeScript, Python, Shell, Ruby, Go, Rust, PHP, Perl, R, Elixir, and C# runtimes. `ctx_index`/`ctx_search` use SQLite FTS5. `ctx_fetch_and_index` defaults to a 24-hour cache (`force: true`/`ttl: 0` refreshes). `ctx_batch_execute` is bounded and indexes output. `ctx_purge` permanently deletes indexed content.

Session continuity is host-lifecycle-dependent (PreToolUse, PostToolUse, compaction, session start), not proof of MCP reachability. Native OpenCode/KiloCode tools are in-process. `CONTEXT_MODE_DIR` must be absolute and writable when set; clients should not silently share one database.

`context-mode upgrade`/`ctx_upgrade` may write hooks/settings, migrate storage, repair plugin paths, and remove duplicate entries: preview the diff and obtain approval. `statusline` prints only; adding it to settings is another write. `ctx_purge` requires separate destructive approval.

## Verification and honest measurement

After an approved change, restart the named host and perform separate gates:

1. Run `context-mode doctor`; record runtime, adapter, FTS5, version, and hook/plugin state.
2. Check the host listing. Verify Codex hook trust separately: `ctx stats` proves MCP reachability, not hook execution.
3. Run `ctx stats`.
4. Only with explicit code-execution approval, run this fixed no-file/no-network/no-background smoke:

   ```text
   ctx_execute(language: "javascript", code: "process.stdout.write(String(2 + 2))", timeout: 1000, background: false)
   ```

If recovery matters, test compaction/resume and report partial or unsupported lifecycle events.

Do not confuse claims with evidence:

| Statement | Classification |
|---|---|
| README says `~98%` with hooks and `~60%` without | upstream claim |
| `BENCHMARK.md`: 21 scenarios, 376 KB raw → 16.5 KB context (96%) | upstream self-report |
| Local `ctx_stats` for a fixed workload | observed runtime evidence |
| Same raw inputs, captured bytes, and hook state before/after | measured local evidence |

For local measurement, freeze workload, raw bytes, returned bytes, cache hits, and hook state for both runs; report exact commands/session and limitations. Never attribute savings to badges, package versions, or a successful MCP handshake.

## Real commands

Read-only inventory:

```bash
if command -v context-mode >/dev/null; then
  context-mode --help
  context-mode doctor
else
  echo "context-mode is not installed"
fi
```

Stop after recording output; do not call `upgrade` or edit hooks because a binary exists.

Approved MCP-only trial:

```bash
claude mcp add context-mode -- npx -y context-mode@1.0.169
```

This omits hooks and slash commands, so routing is not automatically enforced.

## Pinned source citations and license

- [README install matrix, commands, tools, benchmarks](https://github.com/mksglu/context-mode/blob/abb104847cbb66c2182816a72bb69455bc778b5e/README.md)
- [Package metadata and engines](https://github.com/mksglu/context-mode/blob/abb104847cbb66c2182816a72bb69455bc778b5e/package.json)
- [CLI and hook dispatch](https://github.com/mksglu/context-mode/blob/abb104847cbb66c2182816a72bb69455bc778b5e/src/cli.ts)
- [MCP tools and storage](https://github.com/mksglu/context-mode/blob/abb104847cbb66c2182816a72bb69455bc778b5e/src/server.ts)
- [Platform matrix](https://github.com/mksglu/context-mode/blob/abb104847cbb66c2182816a72bb69455bc778b5e/docs/platform-support.md)
- [Claude routing](https://github.com/mksglu/context-mode/blob/abb104847cbb66c2182816a72bb69455bc778b5e/configs/claude-code/CLAUDE.md)
- [Codex routing](https://github.com/mksglu/context-mode/blob/abb104847cbb66c2182816a72bb69455bc778b5e/configs/codex/AGENTS.md)
- [Benchmark methodology](https://github.com/mksglu/context-mode/blob/abb104847cbb66c2182816a72bb69455bc778b5e/BENCHMARK.md)
- [Postinstall and cross-host self-healing](https://github.com/mksglu/context-mode/blob/abb104847cbb66c2182816a72bb69455bc778b5e/scripts/postinstall.mjs)
- [Elastic License 2.0](https://github.com/mksglu/context-mode/blob/abb104847cbb66c2182816a72bb69455bc778b5e/LICENSE)

GitHub's API reports `Other`/`NOASSERTION`; the pinned `LICENSE` identifies Elastic License 2.0 (ELv2). Redistribution remains subject to ELv2 terms: a hosted/managed service exposing a substantial set of features is prohibited, and license-key circumvention or removing/obscuring protected functionality/notices is prohibited. Check the full license before redistribution or hosting.
