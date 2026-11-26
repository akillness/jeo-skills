---
name: thedotmack-mem
description: >
  Operate thedotmack/claude-mem, a persistent cross-session memory system for coding agents using lifecycle hooks, an HTTP worker daemon on localhost port 37777, SQLite FTS5 plus Chroma search, and progressive three-layer MCP retrieval. Use when installing claude-mem via npx or Claude Code plugins, configuring worker telemetry or OpenCode and Cursor adapters, querying prior observations via search, timeline, and get_observations, or triaging private memory capture. Do not use for repo-local living wikis (route to mex), structural code graphs (route to graphify), or personal Obsidian vaults (route to obsidian-second-brain). Triggers on: claude-mem, thedotmack-mem, session memory plugin, worker 37777, progressive memory retrieval.
allowed-tools: Read Glob Grep Bash
compatibility: Node.js, npm/npx, and a supported coding-agent host (Claude Code, OpenCode, Cursor, or Codex). Preflight runs offline in Python 3.10+.
license: Apache-2.0
metadata:
  version: "17.0.0"
  source: https://github.com/thedotmack/claude-mem
  upstream_commit: 9b3b78dfa53f80e7c9c447b9269ceda255ee99d9
  pinned_at: "2026-11-26"
---

# thedotmack-mem (`thedotmack/claude-mem`)

Source-pinned operator guide for `thedotmack/claude-mem` (`v17.0.0`, Apache-2.0). Note that this package uses the local name `thedotmack-mem` for skill evaluator compatibility while keeping upstream `claude-mem` commands and plugin paths verbatim.

## When to use this skill

- Installing or repairing `claude-mem` hooks, SQLite FTS5 stores, and the background worker service (`localhost:37777`).
- Running progressive three-layer memory queries (`search` -> `timeline` -> `get_observations`, or `smart_search` / `smart_outline` / `smart_unfold`) instead of loading raw history dumps.
- Configuring privacy tags (`<private>...</private>`), telemetry opt-outs (`npx claude-mem telemetry disable`), or cross-IDE integrations (`--ide opencode`).
- Triaging why `npm install -g claude-mem` failed to register hooks or why session context injection is missing.
- Routing out: use `mex` for repo-pinned `.mex/` structural wikis, `graphify` for code-and-doc graph clusters, `context-mode` for tool-output sandboxing, and `obsidian-second-brain` for curated vault notes.

## Instructions

1. **Run offline preflight first** before touching local plugin or `~/.claude-mem` state:
   ```bash
   python3 scripts/preflight.py --json
   ```
   Confirm `ok: true` and inspect which runtimes (`node`, `npx`, `claude`, `sqlite3`, `uv`) are present.

2. **Install via plugin or `npx` installer (never global `npm -g` alone)**:
   - Interactive CLI setup (recommended across hosts): `npx claude-mem install` (pass `--ide opencode` for OpenCode, or `--provider ...` when prompted).
   - Claude Code plugin marketplace path:
     - `/plugin marketplace add thedotmack/claude-mem`
     - `/plugin install claude-mem`
   - Do **not** install via `npm install -g claude-mem` expecting working hooks; the npm package alone ships the SDK/library without lifecycle hook registration or worker daemon setup.

3. **Respect the 3-layer progressive MCP search workflow**:
   - Step 1 (`search`): Fetch compact observation IDs, timestamps, titles, and token estimates (`~50-100` tokens/result).
   - Step 2 (`timeline`): Expand chronological context around a specific observation ID or anchor query.
   - Step 3 (`get_observations`): Fetch full observation details **only** for filtered IDs (`~500-1,000` tokens/result).
   - Use `save_memory` for explicit manual memories and `smart_search` / `smart_outline` / `smart_unfold` when symbol-aware AST lookup is enabled.

4. **Enforce privacy, telemetry, and backup boundaries**:
   - Wrap credentials, tokens, or sensitive terminal snippets in `<private>...</private>` tags so hooks strip them at capture time before writing to `~/.claude-mem/`.
   - Disable telemetry explicitly when policy requires offline privacy: `npx claude-mem telemetry disable` or `CLAUDE_MEM_ONLINE_OPTIN=false`.
   - Ask for user confirmation before deleting `~/.claude-mem/`, restarting shared background daemons, or sharing raw SQLite/Chroma files.

## Examples

- **Cross-session bug recall**:
  Call `search(query="token refresh race", limit=10)` -> pick matching observation IDs -> call `timeline(anchor=<id>, depth_before=3, depth_after=3)` -> call `get_observations(ids=[...])` to pull only the verified root cause and fix.
- **Privacy-hardened local installation**:
  Run `npx claude-mem telemetry disable`, review `~/.claude-mem/settings.json`, then run `npx claude-mem install` and verify the worker health endpoint on `http://localhost:37777`.
- **OpenCode adapter setup**:
  Run `npx claude-mem install --ide opencode` instead of manually editing hook templates.

## Best practices

- Always inspect `references/upstream.md` for the five lifecycle hooks (`SessionStart`, `UserPromptSubmit`, `PostToolUse`, `Stop`, `SessionEnd`) before mixing `claude-mem` with other session-memory hooks (`context-mode`, `mex`).
- Keep `get_observations` batch sizes small (3-5 IDs) so episodic memory never bloats the active context window.
- Never copy `~/.claude-mem` SQLite databases into git repositories or shared bundles without auditing for captured secrets.

## References

- Pinned upstream summary and command matrix: [references/upstream.md](references/upstream.md)
- Pinned source provenance and file digests: [references/source.json](references/source.json)
- Offline manifest preflight helper: [scripts/preflight.py](scripts/preflight.py)
- Eval suite: [evals/evals.json](evals/evals.json)
