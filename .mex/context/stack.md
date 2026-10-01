---
name: stack
description: Technology stack, library choices, and the reasoning behind them. Load when working with specific technologies or making decisions about libraries and tools.
triggers:
  - "library"
  - "package"
  - "dependency"
  - "which tool"
  - "technology"
edges:
  - target: context/decisions.md
    condition: when the reasoning behind a tech choice is needed
  - target: context/conventions.md
    condition: when understanding how to use a technology in this codebase
  - target: context/catalog-pipeline.md
    condition: when working with the manifest/TOON/README validation scripts specifically
grounds_to: []
last_updated: 2026-08-19
---

# Stack

## Core Technologies
- **Python 3.9+** — the runtime for every catalog tool (`jeo-skill.py`, all
  `scripts/*.py` validators/repair tools). CI pins `setup-python@v5` to 3.11.
- **Markdown + YAML frontmatter** — the actual "source" this repo distributes: each
  `.agent-skills/<name>/SKILL.md` is a frontmatter block (`name`, `description`,
  `allowed-tools`, `metadata`) plus prose instructions an agent reads directly.
- **JSON** — the manifest format: `.agent-skills/skills.json` (catalog) and
  `skills-lock.json` (root-level, tracks installed-skill provenance/hashes).
- **Bash** — `install.sh`, the curl-able bootstrap installer.
- **Node.js / npx** (bun in CI) — required only as the runtime for the external `skills`
  CLI package; there is no JS/TS application source of this repo's own (the two `.js`/
  `.ts` files at root, `run_python.js` and `test_parse.ts`, are small standalone
  utilities, not an app).

## Key Libraries
- **PyYAML** (not regex/line-based parsing) — used by `scripts/repair-skill-frontmatter.py`
  and `scripts/validate-catalog-projections.py` to parse SKILL.md frontmatter correctly,
  including folded block scalars (`description: >-`). A prior regex-based parser could
  not see block scalars and corrupted 26 skill descriptions in place — see
  `context/decisions.md`.
- **`npx skills` (Agent Skills CLI)** — the actual installer used by both `install.sh`
  and `.agent-skills/jeo-skill/scripts/jeo-skill.py`'s
  `install_command()`/`command_install()`. Neither this repo's tooling nor `jeo-skill`
  reimplements file placement; they only resolve *which* skills to pass to it.
- **argparse (stdlib)** — every CLI in this repo (`jeo-skill.py`, the `scripts/*.py`
  validators) uses stdlib `argparse` subparsers; no click/typer/fire.
- **urllib.request (stdlib)** — `jeo-skill.py`'s `download_catalog()` fetches
  `skills.json` over HTTPS from `raw.githubusercontent.com` when no local checkout is
  found, caching the result to `~/.cache/jeo-skill/skills.json`.

## What We Deliberately Do NOT Use
- **No regex-based frontmatter parsing** — replaced by PyYAML after it silently
  collapsed folded YAML block scalars into the literal string `">-"` for 26 skills; see
  `context/decisions.md`.
- **No category subfolders / no per-skill taxonomy duplication** — a skill's category,
  subcategory, tags, and relationships live only in `.agent-skills/skills.json`, never
  copied into the skill's own frontmatter or a wrapper folder.
- **No mutating scripts in CI** — `fix_frontmatter.py`, `repair-skill-frontmatter.py`,
  and `flatten_skills.py` must only run in CI with a non-mutating flag (`--check` /
  `--dry-run`); a prior CI configuration ran the mutating mode of two of these scripts,
  edited the checkout, and threw the result away every run (see `.github/workflows/ci.yml`
  comment and `context/decisions.md`).
- **No test framework (pytest/unittest/jest)** — validation is done by standalone
  scripts with a `main() -> int` entry point and a `--check`/`--self-test-*` flag,
  invoked directly by CI steps rather than collected by a test runner.

## Version Constraints
CI pins Python to 3.11 (`actions/setup-python@v5`); `install.sh` only requires Python
3.9+ and `npx` to be present, and does not pin a Node.js version.
