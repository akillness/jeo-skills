---
name: ruflo
description: >
  Use when operating the source-pinned ruvnet/ruflo repository or Ruflo CLI for fit checks, offline preflight, initialization previews, Claude Code or Codex swarm and hive-mind orchestration, MCP registration, memory inspection, cleanup, rollback, or troubleshooting. Keep the rename boundary explicit: the root package and compatibility CLI expose claude-flow names while current Ruflo docs and the wrapper use ruflo. Separate read-only discovery from commands writing project files, Claude settings, MCP registrations, hooks, helpers, runtime configuration, CLAUDE.md, or memory databases; require approval before installs, package or model downloads, paid or remote calls, servers or ports, credentials, publishing, or destructive cleanup. Route agent-company control-plane work to paperclip, local tmux lifecycle management to agent-manager, graph-based provider-CLI orchestration to zeroshot, specification-first clarification to ooo, and recursive agent-harness optimization to harness2.
allowed-tools: Bash Read
compatibility: Requires Node.js 20+, npm/npx or a source checkout; Claude Code/Codex integration and optional dependencies are host-dependent.
license: MIT
metadata:
  version: "1.0.0"
  source: https://github.com/ruvnet/ruflo
  upstream_commit: a00b2855e5b8204aec61133d5fbc53060e1726b5
---

# Ruflo repository operator

## When to use this skill

Use this skill for source-grounded, approval-gated operation of ruvnet/ruflo: establish what is installed without invoking it, inspect a pinned checkout, preview initialization, choose swarm or hive topology and consensus, register MCP without overwriting existing entries, inspect memory/state, and clean up only Ruflo-owned artifacts. The helper is offline-only and never runs Ruflo, Claude Code, npm, npx, servers, hooks, or network calls.

Route agent-company planning and artifacts to `paperclip`; route local tmux process/session lifecycle to `agent-manager`; route graph-based provider-CLI runs and verification to `zeroshot`; route ambiguity reduction and immutable spec loops to `ooo`; route recursive agent-harness optimization to `harness2`.

## Instructions

1. Run the offline gate first. From the repository root run `python3 .agent-skills/ruflo/scripts/preflight.py --json`; from an installed skill root run `python3 "$SKILLS_ROOT/ruflo/scripts/preflight.py" --json` (`--help` lists options). It only discovers tools and inspects an explicitly supplied checkout; it never invokes upstream executables.
2. For a source audit, use `--repo PATH --expect-commit a00b2855e5b8204aec61133d5fbc53060e1726b5`; confirm the Git root, commit, and public markers before using any command from the reference.
3. Use `ruflo --help`, `ruflo --version`, or equivalent package metadata as read-only discovery. Do not infer runtime readiness from package presence, and do not run `npx ruflo` or `claude-flow` init during preflight.
4. Before `init`, show the exact target paths and generated components. Approval is mandatory because init can create `.claude/` directories, `.claude/settings.json` hooks and permissions, `.mcp.json`, helpers, skills, commands, agents, runtime config, statusline data, `.swarm/memory.db`, and `CLAUDE.md`; do not overwrite existing config without explicit approval.
5. For swarm or hive runs, record the requested topology and strategy first. Swarm supports hierarchical, mesh, ring, star, hybrid, hierarchical-mesh, and pheromone-adaptive; hive-mind also offers adaptive and consensus choices including byzantine, raft, gossip, crdt, and quorum. Approval is mandatory before spawning agents, starting servers, opening ports, or using credentials or remote providers.
6. Treat MCP registration as a separate approval gate. Inspect existing `.mcp.json`, parent and global Claude registrations, and legacy `claude-flow` keys; never overwrite or create duplicate registrations without approval.
7. Use `memory peek` for read-only store resolution. Treat `memory init`, store/delete/import/export, cleanup, and any command that writes `.swarm/memory.db`, `.claude-flow/data`, coordination, or session state as mutating and approval-gated.
8. For cleanup, preview first. Remove only Ruflo artifact paths and `.claude/helpers`; preserve unrelated `.claude` content, memory databases, worktrees, and user settings. Approval is mandatory for `--force`, rollback, deletion, publishing, installs, downloads, telemetry or remote calls, and any destructive operation.
9. When behavior is unclear, read the pinned source references and report observed versus unverified claims. Do not install dependencies, start a server, call a provider, or claim a live swarm result from static evidence.

## Examples

```sh
python3 .agent-skills/ruflo/scripts/preflight.py --json
python3 .agent-skills/ruflo/scripts/preflight.py --json --repo /work/ruflo --expect-commit a00b2855e5b8204aec61133d5fbc53060e1726b5
# then preview init target paths and ask approval before any write
```

## Best practices

- Keep the ruflo and claude-flow names visible when selecting binaries, MCP keys, and documentation.
- Prefer `memory peek`, status/list/help, and dry-run cleanup for evidence.
- Treat `package.json` postinstall as a mutating install hook: it patches reachable agentdb trees; never run package installation implicitly.
- Make backups and a file manifest before approved initialization or cleanup, and verify no unrelated settings changed afterward.
- Label vector-memory, consensus, throughput, and learning claims as configured or estimated unless a separately approved runtime capture proves them.

## References

- [Pinned Ruflo command, mutation, topology, memory, and safety matrix](references/upstream.md)
- [Pinned upstream README](https://raw.githubusercontent.com/ruvnet/ruflo/a00b2855e5b8204aec61133d5fbc53060e1726b5/README.md)
- [Pinned CLI manifest](https://raw.githubusercontent.com/ruvnet/ruflo/a00b2855e5b8204aec61133d5fbc53060e1726b5/v3/@claude-flow/cli/package.json)
- [Pinned initialization executor](https://raw.githubusercontent.com/ruvnet/ruflo/a00b2855e5b8204aec61133d5fbc53060e1726b5/v3/@claude-flow/cli/src/init/executor.ts)
- [Pinned MIT license](https://raw.githubusercontent.com/ruvnet/ruflo/a00b2855e5b8204aec61133d5fbc53060e1726b5/LICENSE)
