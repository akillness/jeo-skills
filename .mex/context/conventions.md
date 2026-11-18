---
name: conventions
description: How code is written in this project — naming, structure, patterns, and style. Load when writing new code or reviewing existing code.
triggers:
  - "convention"
  - "pattern"
  - "naming"
  - "style"
  - "how should I"
  - "what's the right way"
edges:
  - target: context/architecture.md
    condition: when a convention depends on understanding the system structure
grounds_to: []
last_updated: 2026-11-18
---

# Conventions

## Naming
- Python maintenance/setup helpers live under `scripts/` using kebab-case filenames (`setup-workspace.py`, `setup-mcp-hosts.py`) and paired `test_*.py` unittest modules (`test_setup_workspace.py`, `test_mcp_hosts.py`, `test_jeox_regressions.py`).
- Jev modules and tests use ES module `.mjs` extensions under `jev/`.
- Root repository files are denied by default in `.gitignore`; every tracked root artifact (`!/setup-all-skills-prompt.md`) requires its own explicit allowlist line.

## Structure
- **SSOT Metadata:** `.agent-skills/skills.json` owns skill categories, tags, and relationships; never duplicate taxonomy metadata into individual `SKILL.md` frontmatter or hand-edit `.agent-skills/skills.toon` / README tables.
- **Shared-Root Symlinks:** Host skill roots link per-skill into `~/.agents/skills`; always use `scripts/skills-upgrade.sh` + `scripts/refresh-host-links.py` rather than per-host copy flags.
- **Byte-Identical Controller Mirrors:** `jev/plugins/shared/jev-controller.mjs` and its 6 host copies (`jev/plugins/*/shared/jev-controller.mjs`) must stay byte-identical.

## Patterns
- **Atomic Symlink-Safe Config Writes:** Never write directly in place or follow unexpected symlinks on user config files (`~/.claude.json`, `~/.codex/config.toml`, `~/.gemini/settings.json`, `~/.agents/rules/*`). Inspect via `lstat`, stage in a same-directory temp file (`0o600` on create, existing mode preserved on merge), validate syntax (`json.loads` / `tomllib.loads`), then `os.replace`.
- **SQLite FTS5 External-Content Synchronization:** Let `AFTER DELETE` triggers (`chunks_ad`) maintain `chunks_fts`; never combine manual `('delete', rowid, NULL, ...)` inserts with trigger-backed `DELETE FROM chunks`.
- **Project-Isolated Workflow Overrides:** Resolve `cwd` with `realpath`, walk ancestors stopping before `$HOME`, and honor `.harness2/workspace.json` `workflow.custom: true` without mutating global `~/.agents/rules/jeo-workflows.md`.

## Verify Checklist
- [ ] Run `PYTHONDONTWRITEBYTECODE=1 python3 scripts/validate-catalog-projections.py` and confirm zero `__pycache__` dirs inside `.agent-skills/`.
- [ ] Run `PYTHONDONTWRITEBYTECODE=1 python3 scripts/repair-skill-frontmatter.py --check` and `python3 flatten_skills.py --dry-run`.
- [ ] If any `jev/*.mjs` changed, copy updates to `~/.agents/jev/` and run `node --test jev/*.test.mjs`.
- [ ] If any `openspace` router script changed, run `route-hooks.py install` and `python3 -m unittest scripts/test_openspace_routing.py`.
- [ ] Confirm `git status -s` shows only allowlisted / intentional changes (`.gitignore` kept intact, `install.sh` Step 1 SHA-256 invariant unbroken).
