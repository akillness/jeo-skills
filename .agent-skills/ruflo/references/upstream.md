# Ruflo pinned operator reference

This reference records the audited `ruvnet/ruflo` checkout at commit `a00b2855e5b8204aec61133d5fbc53060e1726b5` (MIT). The local preflight is offline-only and never invokes these commands, installs packages, reads secrets, or starts a service.

## Command and feature matrix

| Surface | Evidence-backed behavior | Side-effect boundary |
| --- | --- | --- |
| `ruflo --help`, `ruflo --version`, package metadata | CLI discovery and version/package identity | Read-only when invoked; does not establish runtime health |
| `ruflo init --help`, `ruflo init check` | Show initialization options or inspect markers | Read-only discovery/check; confirm exact implementation before relying on check output |
| `ruflo init wizard` / `ruflo init` | Creates directories, settings, MCP config, skills, commands, agents, helpers, runtime config, statusline metrics, memory DB, and optionally `CLAUDE.md` | Mutating; approval required; existing settings may be merged and existing MCP registrations are detected |
| `ruflo init --dry-run` where supported by the selected flow | Preview requested initialization | Read-only preview; verify the exact command's dry-run path before relying on it |
| `ruflo swarm init`, `swarm start`, `swarm status`, `swarm stop` | Create and operate coordinated workers; status reads swarm state | `init`, `start`, `stop` mutate state or launch workers; `status` is intended read-only |
| `ruflo hive-mind spawn`, `hive-mind status`, `hive-mind shutdown` | Generate a hive prompt and coordinate workers under a topology and consensus algorithm | Spawn/shutdown are mutating and may launch agents; status is read-only |
| `ruflo mcp start`, `mcp stop`, `mcp status`, `mcp logs`, `mcp restart` | Start or inspect the Ruflo MCP server | Start/restart open a server/port; logs/status are read-only; approval required for any server or port |
| `ruflo memory peek` | Reads resolved memory-store paths, row counts, and last write without initializing anything | Read-only; source explicitly avoids MCP authorization and initialization |
| `ruflo memory stats`, `memory list`, `memory retrieve`, `memory search` | Inspect memory statistics or entries | Treat as read-only unless the selected backend performs initialization; verify backend before use |
| `ruflo memory init`, `store`, `delete`, `purge`, `cleanup`, `compress`, `import`, `export`, `backup` | Initialize or change memory stores and files | Mutating; approval required |
| `ruflo cleanup --dry-run` | Enumerates Ruflo artifact paths and reports what would be removed | Read-only preview |
| `ruflo cleanup --force` | Removes Ruflo artifact directories/files and Ruflo-owned `.claude/helpers` | Destructive; approval, backup, and post-check required |
| npm package installation or postinstall | CLI `postinstall.cjs` patches reachable `agentdb` trees by copying compatibility directories and augmenting package exports | Mutating install hook; never run implicitly; approval required |

## Init write set and config guards

`executeInit()` calls directory creation and then conditionally writes settings, MCP config, skills, commands, agents, helpers, runtime config, statusline metrics, and `CLAUDE.md`. The executor eagerly creates `.swarm/memory.db` when a persistent memory backend is selected. Settings generation targets `.claude/settings.json`; with an existing file and no `--force`, it can merge hooks, environment variables, and Ruflo permission rules, while malformed JSON can be overwritten. MCP generation targets `.mcp.json`, detects parent/global `ruflo` or `claude-flow` registrations, and skips duplicates unless force mode is requested. Always show the file manifest and preserve unrelated configuration before an approved run.

The source directory table includes `.claude`, `.claude/commands`, `.claude/agents`, `.claude/skills`, `.claude-flow/data`, `.claude-flow/logs`, `.claude/sessions`, `.claude/hooks`, `.claude/workflows`, and runtime directories including `.swarm`. Generated helper files can include `.claude/helpers` scripts and `.claude-flow/memory-package.json`; exact optional components depend on the init options.

## Swarm and hive choices

The swarm command source lists `hierarchical`, `mesh`, `ring`, `star`, `hybrid`, `hierarchical-mesh`, and `pheromone-adaptive` topologies. Strategies include `specialized`, `balanced`, `adaptive`, `research`, `development`, `testing`, `optimization`, `maintenance`, and `analysis`. Hive Mind lists `hierarchical`, `mesh`, `hierarchical-mesh`, and `adaptive` topologies plus `byzantine`, `raft`, `gossip`, `crdt`, and `quorum` consensus. These are configuration choices, not evidence that workers are available or that a run completed.

## Memory and cleanup boundaries

Memory path precedence is `--path`, then `CLAUDE_FLOW_DB_PATH`, then `CLAUDE_FLOW_MEMORY_PATH/memory.db`, then `cwd/.swarm/memory.db`. `memory peek` reads both resolved store files directly and creates nothing. Cleanup declares Ruflo artifact directories `.claude-flow`, `data`, `.swarm`, `.hive-mind`, `coordination`, and `memory`, plus `claude-flow.config.json`; it separately owns only `.claude/helpers`. The cleanup source explicitly says other `.claude` content, including agents, skills, commands, settings.local.json, memory.db, worktrees, and launch.json, must be preserved.

## Rename and compatibility

The root package is named `claude-flow` and exposes `claude-flow`; the v3 CLI package is `@claude-flow/cli` and exposes `claude-flow`, `claude-flow-mcp`, and an internal `cli` bin. The repository README and wrapper brand the product as Ruflo, while the wrapper delegates to `@claude-flow/cli` and checks wrapper/CLI versions. Init detects both `ruflo` and legacy `claude-flow` MCP keys, including historical dist-tag keys, to avoid duplicate registrations. Treat `ruflo` as the current operator name and `claude-flow` as a compatibility surface, not as proof of a separate engine.

## Setup prerequisites and platform limits

The CLI manifest declares Node `>=20.0.0`; normal operation also depends on the host client (Claude Code, Codex, or another MCP client), optional native packages, and permissions for any requested project writes. The README's Claude Code path requires Claude Code 2.1.287 or later. The source was audited statically on macOS; Windows/Linux behavior and optional native dependencies require separate verification. Do not claim cross-platform runtime success from this reference.

## Remote, telemetry, and install boundaries

The audited source contains HTTPS helpers in the appliance distribution code and raw GitHub restore references, so remote behavior is feature-dependent and must be approved. This static audit does not establish that every command performs telemetry, nor does package metadata prove network isolation. Do not call remote providers, use credentials, install packages, pull models/weights, publish, or start MCP/HTTP/WebSocket servers without explicit approval. The CLI postinstall is not read-only: it writes into installed `agentdb` package trees, even though failures are best-effort.

## Provenance and raw source citations

- [README.md](https://raw.githubusercontent.com/ruvnet/ruflo/a00b2855e5b8204aec61133d5fbc53060e1726b5/README.md)
- [LICENSE](https://raw.githubusercontent.com/ruvnet/ruflo/a00b2855e5b8204aec61133d5fbc53060e1726b5/LICENSE)
- [root package.json](https://raw.githubusercontent.com/ruvnet/ruflo/a00b2855e5b8204aec61133d5fbc53060e1726b5/package.json)
- [ruflo wrapper package.json](https://raw.githubusercontent.com/ruvnet/ruflo/a00b2855e5b8204aec61133d5fbc53060e1726b5/ruflo/package.json)
- [v3 CLI package.json](https://raw.githubusercontent.com/ruvnet/ruflo/a00b2855e5b8204aec61133d5fbc53060e1726b5/v3/@claude-flow/cli/package.json)
- [CLI wrapper](https://raw.githubusercontent.com/ruvnet/ruflo/a00b2855e5b8204aec61133d5fbc53060e1726b5/ruflo/bin/ruflo.js)
- [init command](https://raw.githubusercontent.com/ruvnet/ruflo/a00b2855e5b8204aec61133d5fbc53060e1726b5/v3/@claude-flow/cli/src/commands/init.ts)
- [init executor](https://raw.githubusercontent.com/ruvnet/ruflo/a00b2855e5b8204aec61133d5fbc53060e1726b5/v3/@claude-flow/cli/src/init/executor.ts)
- [swarm command](https://raw.githubusercontent.com/ruvnet/ruflo/a00b2855e5b8204aec61133d5fbc53060e1726b5/v3/@claude-flow/cli/src/commands/swarm.ts)
- [hive-mind command](https://raw.githubusercontent.com/ruvnet/ruflo/a00b2855e5b8204aec61133d5fbc53060e1726b5/v3/@claude-flow/cli/src/commands/hive-mind.ts)
- [memory command](https://raw.githubusercontent.com/ruvnet/ruflo/a00b2855e5b8204aec61133d5fbc53060e1726b5/v3/@claude-flow/cli/src/commands/memory.ts)
- [cleanup command](https://raw.githubusercontent.com/ruvnet/ruflo/a00b2855e5b8204aec61133d5fbc53060e1726b5/v3/@claude-flow/cli/src/commands/cleanup.ts)
- [postinstall patch](https://raw.githubusercontent.com/ruvnet/ruflo/a00b2855e5b8204aec61133d5fbc53060e1726b5/v3/@claude-flow/cli/scripts/postinstall.cjs)
- [appliance distribution HTTP helpers](https://raw.githubusercontent.com/ruvnet/ruflo/a00b2855e5b8204aec61133d5fbc53060e1726b5/v3/@claude-flow/cli/src/appliance/rvfa-distribution.ts)
