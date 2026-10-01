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
  - target: patterns/jeo-skill-install-flow.md
    condition: when actually installing/browsing skills rather than just setting up the repo
grounds_to: []
last_updated: 2026-10-01
---

# Setup

## Prerequisites
- Python 3.9+ (`install.sh` checks for `python3`; CI uses 3.11)
- Node.js + `npx` (`install.sh` checks for `npx`; required only when actually
  installing skills, not for browsing/validating the catalog)
- `pyyaml` (`pip install pyyaml`) — required for `scripts/repair-skill-frontmatter.py`
  and `scripts/validate-catalog-projections.py`

## First-time Setup

**As a catalog consumer** (installing skills into your own agent runtime):
1. `curl -fsSL https://raw.githubusercontent.com/akillness/jeo-skills/main/install.sh | bash`
   (or clone the repo and run `install.sh` locally) — installs only the lightweight
   `jeo-skill` router by default (`JEO_SKILLS_SELECTION=router`)
2. `jeo-skill doctor` — confirms the catalog resolves and Python/npx are usable
3. `jeo-skill categories` / `jeo-skill list --category web` — browse before installing
4. `jeo-skill install --bundle starter --dry-run`, then rerun without `--dry-run`
   (add `--global` for a user-wide install, or `--agent <runtime>` to target one
   runtime) — installs only the skills you actually selected

**As a catalog contributor** (editing skills or catalog tooling):
1. `git clone https://github.com/akillness/jeo-skills`
2. `pip install pyyaml`
3. Add/edit `.agent-skills/<name>/SKILL.md` and its matching entry in
   `.agent-skills/skills.json` (see `patterns/catalog-metadata-changes.md`)
4. `python3 scripts/validate-catalog-projections.py` to confirm manifest, TOON, README,
   and SKILL.md frontmatter all still agree

## Full Delegated Setup

`setup-all-skills-prompt.md` installs Graphify and Headroom as full-mode shared
tools. It installs `graphifyy` and `headroom-ai[proxy,mcp,code]` separately,
does not create `.graphify/` during setup, and reuses a configured Headroom
deployment when `headroom install status` succeeds. Only an absent/unconfigured
deployment receives `headroom deploy`, followed by `install status` and `doctor`.

When Claude Code is present, the installed Headroom adapter can add one owned
source-mutation `PreToolUse` hook. Its Graphify preflight is read-only; Ponytail
minimization is gated by an explicit numeric `context_usage_percent >= 60`.
Other client integrations must not be described as having the same hook unless
their provider supplies matching lifecycle and context fields.

## Environment Variables
- `JEO_SKILLS_CATALOG` (optional) — explicit `skills.json` override for all catalog
  commands. Missing, unreadable, directory, or invalid JSON paths fail rather than
  silently discovering another catalog. Unset it for automatic discovery.
- `JEO_SKILLS_SOURCE` (optional, `install.sh`) — override the source repo, default
  `https://github.com/akillness/jeo-skills`
- `JEO_SKILLS_SELECTION` (optional, `install.sh`) — `router` | `bundle` | `category` |
  `all`, default `router`
- `JEO_SKILLS_BUNDLE` (conditional, `install.sh`) — required when
  `JEO_SKILLS_SELECTION=bundle`, default `starter`
- `JEO_SKILLS_CATEGORY` / `JEO_SKILLS_SUBCATEGORY` (conditional, `install.sh`) —
  required/optional when `JEO_SKILLS_SELECTION=category`
- `INSTALL_GLOBAL` (optional, `install.sh`) — `true`/`false`, default `true`

## Common Commands
- `jeo-skill doctor` — verify catalog resolution + Python/npx availability (JSON report)
- `jeo-skill categories [--json]` / `jeo-skill list -c <category> -s <subcategory>` —
  browse the taxonomy
- `jeo-skill search "<query>"` / `jeo-skill related <name>` — find or relate skills
- `jeo-skill install <names...> [-b bundle] [-c category] [-s subcategory] [--global]
  [--dry-run] [--yes]` — selective install (delegates to `npx skills add`)
- `python3 scripts/validate-catalog-projections.py` — full catalog CI check (manifest,
  TOON, SKILL.md, README×2, frontmatter-freeze ledger)
- `python3 scripts/repair-skill-frontmatter.py --check` — non-mutating frontmatter audit
- `python3 flatten_skills.py --dry-run` — confirm the flat `<name>/SKILL.md` layout

## Common Issues
**Frontmatter shows `description: ">-"` after an edit:** don't hand-edit multi-line YAML
folded block scalars with a naive script; run `python3
scripts/repair-skill-frontmatter.py` (without `--check`) to recover it from
`skills.toon`/manifest/setup-prompt sources, then `--check` to confirm. See
`context/decisions.md`.

**`jeo-skill install` fails with "npx is required to install skills":** install
Node.js — `jeo-skill.py` has no fallback copy path, it always delegates to `npx skills
add`.

**`scripts/validate-catalog-projections.py` fails after adding/editing a skill:** almost
always a manifest ↔ README/TOON/frontmatter mismatch; it prints the exact
set-difference of missing/extra names via `_set_difference_message`. Run it locally
before opening a PR.

**A new skill folder isn't picked up:** confirm the path is exactly
`.agent-skills/<name>/SKILL.md` with the folder named identically to the manifest
`name` — anything else fails `safe_manifest_path()` and `flatten_skills.py --dry-run`.
