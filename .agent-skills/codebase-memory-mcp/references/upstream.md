# codebase-memory-mcp: pinned upstream evidence

Observed 2026-10-15. Repository: [DeusData/codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp/tree/8df0639c6268afe9888979e72b9797aa2cc1de7c), commit `8df0639c6268afe9888979e72b9797aa2cc1de7c`. GitHub metadata and the full root `LICENSE` both indicate MIT. This guide is independently authored; no upstream implementation is vendored.

## Runtime facts from source

The README describes a local C-backed MCP code-intelligence server: indexing and graph queries are local and need no hosted service/API key; its README at this pin advertises 17 MCP tools. The separate Go wrapper in `pkg/go/cmd/codebase-memory-mcp/main.go` documents `go install ...@latest`, pins wrapper version `0.11.0` in source, and downloads the prebuilt platform binary on first run. That means the wrapper install/first invocation has a network/download side effect. It does not mean every package-manager installation or version is equivalent: inspect the selected distribution path. Release v0.11.0 and the newer `main` tree are not identical in all features; the README says CBM Lens Beta on `main` is not in that release.

The configuration reference identifies per-project `.codebase-memory.json` for extension mapping, global XDG config, an SQLite `_config.db` for CLI-managed runtime settings, and cache/log paths. The sample `.codebase-memory.json` captured here configures test-impact rules, not a universal user config. Daemon/watcher settings may be read at startup; changing them can require a daemon restart. The tool can write indexes, logs, runtime config, architecture decisions and agent-client configuration. The README says indexes are retained on uninstall by default; `--delete-indexes` is a separate explicit destructive option.

## Route and operate

Choose this skill for the exact `DeusData/codebase-memory-mcp` product, MCP tools, its local index/daemon, or config. Route plain symbol lookup to `codebase-search`; route persistent narrative memory to `opencontext`, `llm-wiki` or `agent-memory-architecture`. Keep architecture graph extraction distinct from conversation-memory products.

Start with read-only repo/revision/config inventory. Before install or release download, client MCP registration, daemon/service startup, indexing, config writes, file watching, or deleting indexes, require explicit approval for the operation and target. Do not infer runtime state from README claims or a successful source preflight. Never expose secrets from environment/config.

The source map lists six SHA-256-hashed, commit-pinned files: README, complete MIT license, config example/reference, Go module and actual Go wrapper. See [`source.json`](source.json) for exact blob URLs and hashes.
