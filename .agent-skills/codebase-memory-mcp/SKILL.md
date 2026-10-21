---
name: "codebase-memory-mcp"
description: "Operate DeusData/codebase-memory-mcp, the local code-graph and MCP server: inspect indexing, graph queries, daemon/config behavior, releases and client integration. Use when the user names this exact project or its CLI/MCP. Route plain symbol lookup to codebase-search and narrative/personal memory systems to opencontext, llm-wiki or agent-memory-architecture."
allowed-tools: Bash Read Grep Glob
compatibility: "Exact-repository guidance pinned in references/source.json. Offline preflight checks selected source hashes and PATH command presence only; it does not prove installed release, MCP registration, daemon health or runtime behavior."
metadata:
  version: "1.0.0"
  source: "https://github.com/DeusData/codebase-memory-mcp"
  upstream_commit: "8df0639c6268afe9888979e72b9797aa2cc1de7c"
---

# codebase-memory-mcp

Use for the named local code-graph/MCP project. Read [pinned upstream findings](references/upstream.md) for the wrapper's download behavior, config writes and limits.

## Instructions

1. Confirm the repo/commit against [`references/source.json`](references/source.json). For a checkout, from repo root run `python3 .agent-skills/codebase-memory-mcp/scripts/preflight.py --repo /absolute/nonsymlink/checkout --json`; `--repo` must be an explicit absolute nonsymlink directory. For installed skill-root inventory, from that skill directory run `python3 scripts/preflight.py --json`. This standalone stdlib helper requires Python 3.10+ on POSIX (macOS/Linux; use WSL2 on Windows because native Windows fails closed) and makes no subprocess/network calls, writes, or secret reads. It compares SHA-256 of selected pinned files and checks PATH command-name presence only (not versions); it never compares Git HEAD/the whole revision or verifies runtime. Exit 0 means valid input and selected-file checks pass (command presence is informational); 1 means a selected file is missing/mismatched; 2 means bad input. Without `--repo`, it reports unverified inventory.
2. Classify the request: code graph/index, CLI/daemon settings, release wrapper, or MCP client integration. For a generic code search question, route to `codebase-search`.
3. Inspect actual distribution/version before recommending installation. The pinned Go wrapper downloads the release binary on first run; do not treat wrapper installation as offline. Check exact package-manager, release or source path separately.
4. Require explicit approval before downloading/installing, registering MCP configuration, starting daemon/watchers, indexing a project, writing config/index/logs/ADRs, updating, or deleting caches/indexes. For deletion, identify exact paths and preserve indexes unless user explicitly authorizes their removal.
5. Report observed commit and package path, exact config/index/client effects, and whether a daemon or MCP client was actually exercised. Do not call a pin check a functional test.

## Examples

- “Inspect the MCP tool startup path in this checkout without installing it.”
- “Does the Go install path download anything?” Check the pinned wrapper source and explain first-run download behavior.
- “Uninstall CBM and delete its indexes.” Pause to confirm exact project/cache scope and explicit destructive approval.

## Best practices

- Separate the local C backend from the Go bootstrap wrapper and from MCP-client setup.
- Use source-level settings and the current process state, not default assumptions from a docs page.
- Keep project source, config values, logs and credentials private; report names/paths, not secrets.
- Preflight hashes selected files only; it does not attest Git HEAD or application health.

## References

- [Pinned source facts, config model, and caveats](references/upstream.md)
- [Source pins and hashes](references/source.json)
- [Offline preflight contract](scripts/preflight.py) (added by repository maintainer)
- [Codebase search](../codebase-search/SKILL.md) and [agent-memory architecture](../agent-memory-architecture/SKILL.md).

- [Authored routing and boundary scenarios](evals/evals.json), not executed model-quality results.
