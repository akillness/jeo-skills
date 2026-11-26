---
name: beads
description: >
  Manage gastownhall/beads (bd), a distributed git-backed and Dolt-backed graph issue tracker built for coding agents with hash-based IDs, dependency edges, and JSON task queries. Use when initializing .beads/, finding unblocked work with bd ready --json, creating or claiming issues, wiring blocks or discovered-from dependencies, compacting memory, or syncing via bd dolt. Do not use for lightweight product specs (route to spec-kit) or git branch/worktree fleets (route to orca). Triggers on: beads, bd ready, bd create, bd dolt, graph issue tracker, gastownhall/beads.
allowed-tools: Read Glob Grep Bash
compatibility: Go/Homebrew/npm bd CLI and git (optional Dolt server for multi-agent sync and beads-mcp). Preflight runs offline in Python 3.10+.
license: MIT
metadata:
  version: "1.0.0"
  source: https://github.com/gastownhall/beads
  upstream_commit: 78624109904655d7a4609f27d34eb0982cd8963f
  pinned_at: "2026-11-20"
---

# Beads (`gastownhall/beads`)

Source-pinned operator guide for `gastownhall/beads` (`bd` CLI, MIT), a persistent dependency-graph issue tracker designed to replace flat markdown TODO lists across multi-agent coding sessions.

## When to use this skill

- Initializing `.beads/` in a repo (`bd init`, `bd init --stealth`, or `bd init --contributor`) and injecting agent workflow hooks (`bd prime`, `bd setup`).
- Discovering unblocked work (`bd ready --json`), claiming issues atomically (`bd update <id> --claim --json`), and tracking dependencies (`blocks`, `related`, `parent-child`, `discovered-from`).
- Managing hierarchical sub-issues (`bd-a3f8.1`), semantic memory compaction (`bd compact`), and Dolt synchronization (`bd dolt start|push|pull`).
- Routing out: use `spec-kit` for GitHub Spec-Driven specification templates, `orca` for parallel Git worktree execution, and `task-planning` for lightweight non-Dolt local task plans.

## Instructions

1. **Run offline preflight first** to confirm `bd`, `dolt`, `git`, and `go` availability:
   ```bash
   python3 scripts/preflight.py --json
   ```

2. **Initialize and verify project state safely**:
   - Shared repo tracker: `bd init` (ask before committing `.beads/` hooks or Dolt remotes into shared repos).
   - Local-only personal workflow without committing tracker files: `bd init --stealth`.
   - OSS fork workflow with separate planning database: `bd init --contributor`.
   - Inject concise agent instructions (`~1-2k` tokens): `bd prime` or `bd setup claude` / `bd setup cursor` / `bd setup aider`.

3. **Execute the agent task loop with `--json` output**:
   - Find ready tasks: `bd ready --json`
   - Inspect issue context and edges: `bd show <id> --json`
   - Claim before editing: `bd update <id> --claim --json`
   - Create discovered follow-ups: `bd create "Title" -t bug|feature|task -p 0..4 --json`
   - Link dependencies: `bd dep add <child-id> <parent-id>` (supports `blocks`, `related`, `parent-child`, `discovered-from`)
   - Close with verifiable rationale: `bd close <id> --reason "Fixed and tested" --json`

4. **Gate state-mutating sync, compaction, and MCP bridge actions**:
   - Require explicit user confirmation before `bd dolt push`, remote Dolt server start (`bd dolt start`), `bd compact` memory pruning, or installing `beads-mcp` (`integrations/beads-mcp`).
   - Do not fabricate `bd-*` hash IDs or mark issues closed without fresh verification output.

## Examples

- **Start-of-session work discovery**:
  Run `bd ready --json` -> inspect top priority issue with `bd show bd-a1b2 --json` -> claim via `bd update bd-a1b2 --claim --json`.
- **Log a newly discovered blocker mid-implementation**:
  Run `bd create "Fix migration lock" -t bug -p 1 --json` -> link `bd dep add bd-a1b2 <new-id>` so `bd ready` automatically blocks the downstream task until the migration fix closes.
- **Stealth mode in a team repo without `.beads/` commits**:
  Run `bd init --stealth` so issue history stays local while working against upstream PR branches.

## Best practices

- Always pass `--json` when calling `bd` from agent shells to avoid fragile text scraping.
- Prefer `bd prime` over bloated static markdown TODO prompts to keep context overhead low.
- Use `bd init --stealth` in third-party OSS repositories unless maintainers explicitly accept `.beads/` tracking files.

## References

- Pinned upstream summary and dependency/CLI reference: [references/upstream.md](references/upstream.md)
- Pinned source provenance and file digests: [references/source.json](references/source.json)
- Offline manifest preflight helper: [scripts/preflight.py](scripts/preflight.py)
- Eval suite: [evals/evals.json](evals/evals.json)
