---
name: gstack
description: >
  Operate garrytan/gstack, Garry Tan's role-based engineering sprint toolkit providing slash skills (/office-hours, /plan-ceo-review, /plan-eng-review, /plan-design-review, /review, /qa, /cso, /ship, /retro, /browse) and a fast persistent Bun/Playwright browser daemon ($B) with safety guardrails (/careful, /freeze, /guard). Use when setting up gstack across Claude Code, Codex, OpenCode, Cursor, Gemini, or Antigravity via ./setup, running role-based reviews or browser QA, or enabling command safety hooks. Do not use for Socratic TDD-first engineering (route to superpowers) or standalone Chrome DevTools traces (route to chrome-devtools-mcp). Triggers on: gstack, /office-hours, /plan-ceo-review, /qa, /cso, /browse, garrytan/gstack.
allowed-tools: Read Glob Grep Bash
compatibility: Git and Bun (v1.0+) required to compile the browse daemon; supports macOS Aside browser priority and cross-host setup. Preflight runs offline in Python 3.10+.
license: MIT
metadata:
  version: "1.0.0"
  source: https://github.com/garrytan/gstack
  upstream_commit: 0febbce1e4382b140a930f6a17c53234de2b05e7
  pinned_at: "2026-11-26"
---

# gstack (`garrytan/gstack`)

Source-pinned operator guide for `garrytan/gstack` (MIT), organizing specialized software sprint roles, persistent browser QA (`$B`), and destructive-action safety hooks into one composable setup.

## When to use this skill

- Installing or updating `gstack` across hosts (`./setup --host claude|codex|opencode|cursor|factory|kiro|copilot|agy|gemini|openclaw|hermes|auto`).
- Running role-framed reviews: `/office-hours` (product diagnostic), `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/review` (staff engineer), `/cso` (OWASP/STRIDE security audit), and `/retro`.
- Driving live headless Chromium verification via `/qa`, `/qa-only`, `/browse` (`$B`), `/benchmark`, and `/canary`.
- Activating safety rails (`/careful`, `/freeze <dir>`, `/guard`, `/unfreeze`) before risky refactoring or production operations.
- Routing out: use `superpowers` for Socratic TDD/subagent loops, `chrome-devtools-mcp` for DevTools MCP tracing, and `aside-browser` when native macOS Aside browser priority applies first.

## Instructions

1. **Run offline preflight first** to inspect `bun`, `git`, `claude`, and `codex` availability:
   ```bash
   python3 scripts/preflight.py --json
   ```

2. **Install and compile `$B` cleanly for your host**:
   - Clone upstream and run host-scoped setup (`--host` selects target runtime without dumping foreign templates everywhere):
     ```bash
     ./setup --host claude
     ```
   - Supports `claude`, `codex`, `opencode`, `cursor`, `factory`, `kiro`, `copilot`, `agy`, `gemini`, `openclaw`, `hermes`, and `auto`. Requires `bun` to build the persistent Playwright Chromium browser daemon (`$B`).

3. **Execute the sprint role cadence**:
   - **Think & Plan**: `/office-hours` -> `/plan-ceo-review` -> `/plan-eng-review` -> `/plan-design-review` (or `/design-consultation` / `/design-shotgun` / `/design-html`).
   - **Build & Verify**: `/review` (paranoid code & race check) -> `/investigate` (root-cause debugging) -> `/qa` (browser test + auto-fix + regression test) or `/qa-only` (report-only) -> `/cso` (OWASP + STRIDE audit).
   - **Ship & Monitor**: `/ship` -> `/land-and-deploy` -> `/canary` -> `/benchmark` -> `/retro`.

4. **Apply safety guardrails and browser boundaries**:
   - Enable `/careful` (warns before destructive rm/drop/force-push), `/freeze <dir>` (locks edits to a directory), or `/guard` (combines both) before high-risk changes; release with `/unfreeze`.
   - Always confirm explicitly with the user before running `/ship`, `/land-and-deploy`, or external deploys, and follow local browser priority (`aside-browser` first on macOS when Aside is active).

## Examples

- **Pre-release product + security + QA pass**:
  Run `/plan-eng-review` to lock architecture -> implement changes -> run `/review` + `/cso` -> run `/qa http://localhost:3000` -> ask confirmation before `/ship`.
- **Multi-host Codex + Claude install**:
  Verify `bun --version` -> run `./setup --host claude` and `./setup --host codex`.

## Best practices

- Use `/qa-only` when you want pure bug discovery without automatic code patches.
- Pair `/freeze <target-dir>` with `/investigate` during production incidents so fixes stay surgically scoped.
- Check `references/upstream.md` for the full 25+ slash skill inventory and `$B` daemon lifecycle details.

## References

- Pinned upstream skill matrix, browser daemon, and setup flags: [references/upstream.md](references/upstream.md)
- Pinned source provenance and file digests: [references/source.json](references/source.json)
- Offline manifest preflight helper: [scripts/preflight.py](scripts/preflight.py)
- Eval suite: [evals/evals.json](evals/evals.json)
