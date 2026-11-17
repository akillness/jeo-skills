# `jeo-skills` Setup Guide

Quickstart entrypoint for provisioning curated AI agent skills, **Jev**, **Harness²** workspaces, global-default vs per-project isolated workflows (`openspace → rtk → semble → jev → mex`), and multi-host MCP servers (including **Context7**).

For the full reference installation prompt with every optional pack and SHA-256 verification pins, see [setup-all-skills-prompt.md](setup-all-skills-prompt.md).

---

## 1. Install Catalog Skills & Symlink Shared Root

Run the interactive or targeted catalog installer from a checked-out copy of `jeo-skills`:

```bash
export SKILLS_ROOT="${SKILLS_ROOT:-$HOME/.agents/skills}"
bash ./install.sh
```

Or check/upgrade already-installed skills and host links in place:

```bash
bash scripts/skills-upgrade.sh
python3 scripts/refresh-host-links.py
```

---

## 2. Activate Jev Control Plane & Host Hooks

Provision Jev into `~/.agents/jev` and verify your configured profile before binding hooks (replace `<profile>` and `<agent>` such as `claude`, `codex`, `agy`, `cursor`, `jeopi`, or `pi`):

```bash
mkdir -p ~/.agents/jev
cp -f jev/jev-harness.mjs jev/jev-plugin.mjs ~/.agents/jev/
cp -f .agent-skills/skills.json ~/.agents/jev/skills.json
# Or, on a fresh setup, initialize a profile first:
# bash jev/jev-setup.sh --profile "${JEV_PROFILE:-agy}" --agent "${JEV_AGENT:-codex}" --mode systemone
node ~/.agents/jev/jev-harness.mjs --profile "${JEV_PROFILE:-agy}" status
node ~/.agents/jev/jev-plugin.mjs doctor --agent "${JEV_AGENT:-codex}" --profile "${JEV_PROFILE:-agy}"
```

To bind persistent hooks across supported hosts (example: Codex, Claude, Agy, Cursor):

```bash
node ~/.agents/jev/jev-plugin.mjs hooks-install --agent codex --profile "${JEV_PROFILE:-agy}" --apply
```

---

## 3. Configure Global Default vs. Per-Project Isolated Workflows (`Harness²` + Rules)

By default, `scripts/setup-workspace.py` establishes the **global workflow** (`~/.agents/harness/workspace.json` + `~/.agents/rules/jeo-workflows.md`) flowing **`openspace → rtk → semble → jev → memory (.mex / jeox / zg)`** and configures `<project>/.harness2/workspace.json` (`workflow.custom: false`) to inherit global defaults:

```bash
python3 scripts/setup-workspace.py --project "${PROJECT_DIR:-$PWD}" --dry-run
python3 scripts/setup-workspace.py --project "${PROJECT_DIR:-$PWD}"
python3 scripts/setup-workspace.py --project "${PROJECT_DIR:-$PWD}" --verify
```

### Isolate a Specific Project Workflow

When a repository needs its own skill order, its own Jev profile (or `jev` disabled), or its own local `.agents/skills` root without changing global defaults for other repositories:

```bash
python3 scripts/setup-workspace.py \
  --project /path/to/custom-project \
  --custom-workflow \
  --workflow-order rtk,semble,mex \
  --jev-profile off
```

Behavior guaranteed once isolated (`"custom": true` in `.harness2/workspace.json` and `customWorkflow: true` in `.agents/rules/jeo-workflows.md`):

- Future global or default `setup-workspace.py` runs **preserve** that project's custom `.agents/rules/jeo-workflows.md` and `workflow` config rather than overwriting it.
- Both `jev-plugin.mjs` and OpenSpace `route_prompt.py` inspect ancestor `.harness2/workspace.json` from `cwd` (stopping before `$HOME` and rejecting symlinks) and honor per-project enable/profile/order flags while writing unified telemetry to `~/.local/state/jeo-skill/workflow-events.jsonl`.
- To restore global inheritance later, run:

```bash
python3 scripts/setup-workspace.py --project /path/to/custom-project --reset-project-workflow
```

---

## 4. Provision & Verify MCP Servers Across Hosts (Including Context7)

Provision `@upstash/context7-mcp` locally (npm `--ignore-scripts`, zero OAuth prompt required), repair any stale or relative binary references (such as legacy `~/.local/bin/ouroboros` or `Gemini CLI` unsupported `toolTimeout`), and register `context7`, `openspace`, `jeox`, `zvec_grep`, `aside`, `semble`, and `headroom` across installed hosts (`claude`, `codex`, `gemini`, `antigravity-cli`/`antigravity-ide`, `cursor`, `opencode`, `pi`, `gjc`, `jeopi`):

```bash
# Optional: set CONTEXT7_API_KEY in your shell env for higher Context7 rate limits
# export CONTEXT7_API_KEY="ctx7sk-..."

python3 scripts/setup-mcp-hosts.py --provision-context7 --repair --project "${PROJECT_DIR:-$PWD}" --dry-run
python3 scripts/setup-mcp-hosts.py --provision-context7 --repair --project "${PROJECT_DIR:-$PWD}" --apply
```

Note on host specifics enforced automatically:
- **Gemini CLI** (`~/.gemini/settings.json`): omits `toolTimeout` cleanly (strict schema validation rejects it).
- **Antigravity IDE** (`~/.gemini/antigravity/mcp_config.json`): preserves the symlink to `~/.gemini/config/mcp_config.json` when linked.
- **OpenCode v2** (`~/.config/opencode/opencode.json`): writes under `mcp.servers` if v2 object exists or keeps v1-compatible `mcp` shape cleanly.
- **Pi** (`~/.pi/agent/mcp.json`): sets `"exposure": "direct"` on `context7` and `jeox` so tools are immediately callable.
- **Aside** (`~/.aside/u/*/settings.json`): audited read-only; never overwritten by scripts.

Verify live JSON-RPC `initialize` + `tools/list` handshakes across all managed stdio MCP servers and run a live `Context7` (`resolve-library-id`) probe:

```bash
python3 scripts/setup-mcp-hosts.py --verify --probe-context7 --project "${PROJECT_DIR:-$PWD}" --json
```

---

## 5. Full Catalog, Code Graph & Test Verification

```bash
PYTHONDONTWRITEBYTECODE=1 python3 scripts/validate-catalog-projections.py
PYTHONDONTWRITEBYTECODE=1 python3 scripts/repair-skill-frontmatter.py --check
node --test jev/*.test.mjs
python3 -m unittest scripts/test_setup_workspace.py scripts/test_mcp_hosts.py scripts/test_jeox_regressions.py scripts/test_workflow_log.py
python3 scripts/jeox.py build --full
```

---

## 6. Unified Flow Log Management (Global vs. Per-Project Isolated Flows)

All workflow events (`setup-workspace`, `openspace-route` / `openspace-skip`, `jev-route` / `jev-skip` / `jev-pretool`, `jeox-build` / `jeox-query` / `jeox-mcp`, `setup-mcp-hosts` / `mcp-verify`, `skills-upgrade`) are recorded in one single canonical ledger (`~/.local/state/jeo-skill/workflow-events.jsonl`, mode `0600`) tagged with `"flow_mode": "global" | "project-custom"`:

```bash
jeo-skill flow-log doctor
jeo-skill flow-log summary
jeo-skill flow-log tail -n 25
jeo-skill flow-log tail --custom-only
# Standalone symlink installed by setup-workspace:
jeo-flow-log summary
```
