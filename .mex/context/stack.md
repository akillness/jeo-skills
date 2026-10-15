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
last_updated: 2026-10-14
---

# Stack

## Core Technologies
- **Python** — the router/bootstrap requires 3.9+; individual skill helpers have
  their own requirements. CI runs Python 3.11; resource regressions were also
  exercised locally on Python 3.14.
- **Markdown + YAML frontmatter** — the actual "source" this repo distributes: each
  `.agent-skills/<name>/SKILL.md` is a frontmatter block (`name`, `description`,
  `allowed-tools`, `metadata`) plus prose instructions an agent reads directly.
- **JSON** — the manifest format: `.agent-skills/skills.json` (catalog) and
  `skills-lock.json` (root-level, tracks installed-skill provenance/hashes).
- **Bash** — `install.sh`, the curl-able bootstrap installer.
- **Node.js / npx** — runs the optional Jev ESM harness/plugins, Node helper scripts,
  built-in `node:test` regressions, and the external `skills` installer. CI pins
  Node 24; this audit exercised Node 26 locally. There is no application bundle target.

## Key Libraries
- **PyYAML** (not regex/line-based parsing) — used by `scripts/repair-skill-frontmatter.py`
  and `scripts/validate-catalog-projections.py` to parse SKILL.md frontmatter correctly,
  including folded block scalars (`description: >-`). A prior regex-based parser could
  not see block scalars and corrupted 26 skill descriptions in place — see
  `context/decisions.md`.
- **Pillow** — the browser video renderer's image dependency. The installer CI
  matrix pins Pillow 12.2.0 alongside PyYAML 6.0.3 so resource regressions do not
  silently skip missing dependencies; the Python runner rejects skips in CI mode.
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
- **No additional test-runner dependency** — Python regressions use stdlib
  `unittest`; Node regressions use built-in `node:test`. Catalog gates remain
  standalone read-only commands. Browser/converter fixtures are hermetic; real
  FFmpeg/cwebp smoke evidence is distinct from full application verification.

## Version Constraints
CI pins Python to 3.11 (`actions/setup-python@v5`); `install.sh` only requires Python
3.9+ and `npx` to be present, and does not pin a Node.js version.
