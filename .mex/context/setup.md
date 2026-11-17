---
name: setup
description: Dev environment setup and commands. Load when setting up the project for the first time or when environment issues arise.
triggers:
  - "setup"
  - "install"
  - "environment"
  - "getting started"
  - "how do I run"
  - "local development"
edges:
  - target: context/stack.md
    condition: when specific technology versions or library details are needed
  - target: context/architecture.md
    condition: when understanding how components connect during setup
grounds_to: []
last_updated: 2026-11-18
---

# Setup

## Prerequisites
- Python 3.11+ (`tomllib` stdlib required by `scripts/setup-mcp-hosts.py` and test scripts)
- Node.js 22.13+ & npm (required by `jev/*.mjs`, `ctx7`, and `@upstash/context7-mcp` provisioning)
- `git` and core developer tools (`mex-agent`, `zg`, `rtk`, `semble`, `~/.agents/venvs/openspace/bin/python`) when activating full workspaces

## First-time Setup
1. See [setup.md](../../setup.md) or [setup-all-skills-prompt.md](../../setup-all-skills-prompt.md) and install catalog skills into `~/.agents/skills`.
2. Activate global & project workspace + `harness2`: `python3 scripts/setup-workspace.py --project "$PWD"` (add `--custom-workflow --workflow-order ... --jev-profile ...` to isolate a repository).
3. Verify rule injection & frontmatter: `python3 scripts/setup-workspace.py --project "$PWD" --verify --json`.
4. Provision Context7 & multi-host MCP configs: `python3 scripts/setup-mcp-hosts.py --provision-context7 --repair --project "$PWD" --apply`.
5. Verify live stdio MCP handshakes across hosts: `python3 scripts/setup-mcp-hosts.py --verify --probe-context7 --project "$PWD" --json`.
6. Inspect unified workflow logs across global & isolated project flows: `jeo-skill flow-log doctor`, `jeo-flow-log summary`, `jeo-flow-log tail --custom-only`.

## Environment Variables
- `SKILLS_ROOT` (optional) — override shared skill root (default `~/.agents/skills`)
- `JEV_PROFILE` / `JEV_CATALOG_PATH` / `JEV_NO_CATALOG_CACHE` (optional) — control Jev profile, explicit catalog path, or disable `tmpdir()` catalog index caching
- `CONTEXT7_API_KEY` (optional) — written into managed `context7` MCP entries when exported cleanly in environment (never committed)
- `JEO_SKILL_STATE_DIR` (optional) — override state directory holding `workflow-events.jsonl` and `jev-usage.jsonl`
- `PYTHONDONTWRITEBYTECODE=1` (recommended) — keeps `.agent-skills/` clean of `__pycache__` artifacts

## Common Commands
- `python3 scripts/validate-catalog-projections.py` — validate `skills.json`, `skills.toon`, and README projections
- `python3 scripts/repair-skill-frontmatter.py --check` — verify skill frontmatter invariants without mutating files
- `python3 flatten_skills.py --dry-run` — enforce flat `.agent-skills/<name>/SKILL.md` layout
- `node --test jev/*.test.mjs` — run Jev harness, plugin, cursor, codex, lifecycle, and usage-ledger test suites
- `python3 -m unittest scripts/test_workflow_log.py scripts/test_setup_workspace.py scripts/test_jeox_regressions.py scripts/test_mcp_hosts.py scripts/test_openspace_routing.py scripts/test_context7_preflight.py scripts/test_setup_guide_regressions.py` — run Python regression suites

## Common Issues
- **PTY EOF / interactive prompt stalls in test runners:** When executing shell-fence tests under a PTY-allocating tool, pass `stdin=subprocess.DEVNULL` (`< /dev/null`) so `[ -t 0 ]` checks in `install.sh` do not pause for interactive stdin.
- **Gemini CLI strict MCP validation:** Never emit `"toolTimeout"` inside `~/.gemini/settings.json` `mcpServers`; use `scripts/setup-mcp-hosts.py --repair` to strip invalid keys automatically.
- **Symlinked Antigravity config (`~/.gemini/antigravity/mcp_config.json`):** Write to `~/.gemini/config/mcp_config.json` rather than replacing the managed symlink.
