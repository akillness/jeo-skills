# Pinned upstream evidence

This reference records the upstream facts used by `okf-agent-memory`. It is intentionally pinned to one commit; a later upstream branch or release may differ.

- Repository: <https://github.com/okf-memory/okf-agent-memory>
- Reviewed commit: `ad7beb01b9d4294d8dd28c25494d274374985b69`
- Review date: 2026-10-15 (Asia/Seoul)
- License: upstream root `LICENSE` declares MIT.

## Commit-pinned source map

- [README.md](https://github.com/okf-memory/okf-agent-memory/blob/ad7beb01b9d4294d8dd28c25494d274374985b69/README.md): project scope, repository layout, build, bootstrap, MCP, and test entry point.
- [Embedded skill](https://github.com/okf-memory/okf-agent-memory/blob/ad7beb01b9d4294d8dd28c25494d274374985b69/.agents/skills/okf-memory/SKILL.md): upstream's agent-facing memory workflow.
- [Getting-started guide](https://github.com/okf-memory/okf-agent-memory/blob/ad7beb01b9d4294d8dd28c25494d274374985b69/docs/guides/GETTING_STARTED.md): install options, bootstrap targets, and MCP configuration.
- [CLI & MCP reference](https://github.com/okf-memory/okf-agent-memory/blob/ad7beb01b9d4294d8dd28c25494d274374985b69/docs/guides/CLI.md): command syntax, scope resolution, flags, and exit codes.
- [Security & privacy policy](https://github.com/okf-memory/okf-agent-memory/blob/ad7beb01b9d4294d8dd28c25494d274374985b69/docs/security/SECURITY.md): prohibited stored data, provenance, privacy, and memory-poisoning guidance.
- [AGENTS.md](https://github.com/okf-memory/okf-agent-memory/blob/ad7beb01b9d4294d8dd28c25494d274374985b69/AGENTS.md): repository-level contributor instructions.
- [go.mod](https://github.com/okf-memory/okf-agent-memory/blob/ad7beb01b9d4294d8dd28c25494d274374985b69/go.mod): pinned Go language/toolchain declaration and module requirements.
- [LICENSE](https://github.com/okf-memory/okf-agent-memory/blob/ad7beb01b9d4294d8dd28c25494d274374985b69/LICENSE): upstream MIT license text.

## Observed project contract

- Upstream describes `okf` as a Go executable for OKF v0.2 bundles, with local BM25 search, bundle validation, automated index/log bookkeeping, and a stdio MCP server.
- `okf bootstrap` scaffolds or updates four targets in a project: `knowledge/`, `.agents/skills/okf-memory/`, `AGENTS.md`, and `Makefile`. Treat it as a repository mutation, not a harmless probe.
- The documented project-memory loop is search-before-write, perform the work, record durable discoveries, then validate. The CLI exposes `search`, `show`, `create`, `update`, `relate`, `validate`, and `mcp` commands.
- The documented four-scope order is project (priority 100), vendor (70), user (50), system (10). Project-local search is the safe default; all-scope search can read additional bundle directories, including user and system memory.
- The security guide prohibits storing credentials, PII, raw conversation/chain-of-thought, transient scratchpads, and large raw dumps. It requires source provenance for external summaries and reserves `verified` attribution for human review.
- Upstream claims its CLI rejects path escapes outside the selected bundle. Do not treat that claim as a substitute for checking the actual checkout, target paths, symlinks, and resulting diff.

## Known documentation drift

At this pinned commit, `go.mod` declares `go 1.26.0`, while the getting-started guide says source builds require Go 1.22 or newer. These statements conflict. Before a source build, follow the pinned `go.mod` and verify the exact Go toolchain; do not repeat the guide's lower version as sufficient. Prefer a selected, verified release asset or an explicitly approved installation path rather than an unpinned `latest` download.

## Update procedure

When refreshing this skill, inspect the new commit's exact `LICENSE`, `go.mod`, CLI help/reference, bootstrap implementation, MCP behavior, security policy, and tests. Update the pinned links and preflight constant together. Do not infer that a new tag, API, or advertised capability is present from the repository name or README alone.
