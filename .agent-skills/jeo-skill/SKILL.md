---
name: jeo-skill
description: >
  Browse, group, relate, and selectively install the jeo-skills catalog through the
  lightweight `jeo-skill` CLI. Use when the user wants skills organized by web,
  infrastructure, game, creative media, CLI tools, AI/agents, engineering, research,
  business, or utilities; needs a frontend/backend/game-audio/game-VFX subcategory;
  wants overlapping skills connected instead of duplicated; or wants a category,
  bundle, or named skills installed without copying the full repository.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: Requires Python 3.9+ and npx only when installing skills
metadata:
  tags: skill-management, taxonomy, selective-install, categories, deduplication, cli
  version: "1.0.0"
  source: akillness/jeo-skills
---

# jeo-skill

## When to use this skill

Use this skill as the lightweight catalog front door when the user needs to:

- discover skills by primary category and focused subcategory;
- install only one skill, a curated bundle, or one category slice;
- inspect related or overlapping skills before choosing one;
- avoid a full `.agent-skills` checkout in an agent runtime;
- verify that the local catalog and the `jeo-skill` executable are usable.

Do not physically move skill folders to represent taxonomy. Agent skill discovery expects
`<skill-name>/SKILL.md`; category and relationship metadata belongs in the central catalog.

## Quick Start

### 1. Link the CLI once

From a source checkout or an installed copy of this skill:

```bash
python3 scripts/jeo-skill.py link
jeo-skill doctor
```

This creates only `~/.local/bin/jeo-skill`. It does not install the full catalog.

### 2. Browse and install

```bash
jeo-skill categories
jeo-skill list --category web
jeo-skill list --category game --subcategory audio

# Preview first; no files are installed.
jeo-skill install --bundle web-frontend --dry-run
jeo-skill install responsive-design react-best-practices --dry-run

# Install globally after reviewing the selection.
jeo-skill install responsive-design react-best-practices --global --yes
jeo-skill install --bundle game-web --global --yes
```

The CLI delegates installation to `npx skills add ... --skill ...`; it never copies the
whole repository unless the user explicitly selects every skill. Omit `--global` for a
project-local install. Use `--agent <runtime>` to target a specific supported runtime.

### 3. Treat overlap as a routing relationship

`jeo-skill related <name>` shows catalog relationship groups. Keep adjacent tools as
separate skills when their runtime or job differs—for example, human code-review judgment
versus the `ocr` CLI. Use a canonical alias only when ordinary prompts truly compete and
backward-compatible exact-name installation is required.

### Optional Jevgrep source discovery

For an explicit Jevgrep request, follow [jevgrep](../jevgrep/SKILL.md) for scoped
skill-document discovery through `jeo-skill explore` with an inert `--dry-run` and
a separate remote-content/cost gate. Catalog metadata search and selection remain
the default; the canonical skill owns setup, consent, and snippet verification.

## Runtime Installation Guide

Follow `setup-all-skills-prompt.md` for guided installation. The installer writes files;
runtime loading and account activation are separate checks.

| Runtime | Arg | Shared Root | Native Root | Scope | Auto-Load | Installation |
|---------|-----|-------------|-------------|-------|-----------|---|
| jeopi, JEO (`jeo-code`), OMP (`oh-my-pi`) | `jeopi`, `jeo`, `omp` → `universal` | `~/.agents/skills` or project `.agents/skills` | — | global/project | shared discovery | `jeo-skill install responsive-design --agent jeopi --global --yes` |
| GJC | `gjc` | `~/.agents/skills` | `~/.gjc/agent/skills` (global) or `.gjc/skills` (project) | global/project | native discovery | `jeo-skill install responsive-design --agent gjc --global --yes` |
| Antigravity CLI | `agy` or `antigravity-cli` | `~/.agents/skills` | `~/.gemini/antigravity-cli/skills` (global) or `.agents/skills` (project) | global/project | placement verified | `jeo-skill install responsive-design --agent agy --global --yes` |
| Antigravity IDE | `antigravity` | `~/.agents/skills` | `~/.gemini/config/skills` | global native projection | placement verified | `jeo-skill install responsive-design --agent antigravity --global --yes` |
| Aside (account-scoped) | `--agent aside` | — | `~/.aside/u/<account-id>/skills/user/` | per-account | ✗ manual | `jeo-skill install responsive-design django-patterns --agent aside --global --aside-account <id> --yes` |
**Key Points:**
- `~/.agents/skills` is the shared root for most runtimes; install there first.
- GJC and Antigravity global installs automatically project to native roots when the target is selected.
- Aside is account-scoped; use `--agent aside --aside-account <id>`.
- Other upstream runtime IDs pass through to the pinned installer; do not assume universal discovery or activation.
- **Placement ≠ Activation:** These commands only materialize skill files to roots. They do not authenticate, start, or verify that a runtime has loaded the skills. See your runtime's documentation for activation/registration steps (e.g., Claude Code plugin install, GJC CLI reachability, IDE skill auto-discovery).

## Installation Workflows

### Full Catalog (default, via setup-all-skills-prompt.md)

This command installs every catalog skill to the shared root. Follow the setup guide's
targeted runtime steps for native projections; this command alone does not perform them.

```bash
jeo-skill install --all --global --yes
```

### Selective Installation

Install specific skills or curated bundles:

```bash
# By name
jeo-skill install code-review django-patterns responsive-design --global --yes

# By category
jeo-skill install --category game --global --yes

# By curated bundle
jeo-skill install --bundle web-frontend --global --yes
```

### Project-Local Installation

Install within the current project (`./.agents/skills`):

```bash
jeo-skill install responsive-design react-best-practices --yes
```
### Upgrade from Old PATH-Based Router

**Upgrade note:** Run this from the checked-out `jeo-skills` repository root. The commands use `JEO_SKILLS_SOURCE="$PWD"` to reference the local checkout, not a global installation.

```bash
cd /path/to/checked-out/jeo-skills
JEO_SKILLS_SOURCE="$PWD" JEO_SKILLS_SELECTION=router JEO_SKILLS_AGENT=universal INSTALL_GLOBAL=true JEO_SKILLS_DRY_RUN=true bash ./install.sh

# Refresh the shared router; preserve its existing CLI link
JEO_SKILLS_SOURCE="$PWD" JEO_SKILLS_SELECTION=router JEO_SKILLS_AGENT=universal INSTALL_GLOBAL=true JEO_SKILLS_DRY_RUN=false bash ./install.sh
# Verify the installed router directly, not an unrelated PATH command
python3 "$HOME/.agents/skills/jeo-skill/scripts/jeo-skill.py" doctor

# Re-install your selected skills with the new router
jeo-skill install responsive-design django-patterns --global --yes

# For GJC/Antigravity CLI, re-project to native roots:
# For GJC native projection:
jeo-skill install responsive-design django-patterns --agent gjc --global --yes
# For Antigravity CLI native projection:
jeo-skill install responsive-design django-patterns --agent antigravity-cli --global --yes
```

### Aside Account Access

Each Aside account requires explicit account ID and optional home path:

```bash
# List available Aside accounts
ls ~/.aside/u/

# Install skills for a specific account
jeo-skill install responsive-design --agent aside --global \
  --aside-account <account-id> --yes

# Optional: custom Aside home (defaults to ~/.aside)
jeo-skill install responsive-design --agent aside --global \
  --aside-account <account-id> --aside-home /path/to/aside --yes
```

### GJC and Antigravity CLI Native Projection

After installing to the shared root, project to native runtimes:

```bash
# Install to shared root first
jeo-skill install code-review django-patterns --global --yes

# Project to GJC native root (both global and project-local)
jeo-skill install code-review django-patterns --agent gjc --global --yes
jeo-skill install code-review django-patterns --agent gjc --yes  # project-local .gjc/skills

# Antigravity CLI supports global native and project-local installation
jeo-skill install code-review --agent agy --global --yes
jeo-skill install code-review --agent agy --yes  # project-local .agents/skills

# Project to Antigravity IDE global root
jeo-skill install code-review --agent antigravity --global --yes
```

**Important:** Use `--dry-run` before multi-skill installs to preview exactly what will be
installed and copied.

## Recovery from Broken Links

If a previous installation left a broken or stale symlink in `~/.local/bin/jeo-skill`:

```bash
# Inspect the current link
ls -la ~/.local/bin/jeo-skill

# Check where the linked file actually is
find ~/.agents/skills -name "jeo-skill.py" -type f

# If the path is wrong or missing, force re-link after confirming intent
python3 ~/.agents/skills/jeo-skill/scripts/jeo-skill.py link --force
jeo-skill doctor
```

Do not force-link unless you have verified:
1. The destination jeo-skill.py exists and is readable.
2. The current broken symlink is from a previous (now invalid) installation path.
3. The re-linked version will point to the shared router.

## Verification

After any installation or upgrade:

```bash
jeo-skill doctor
jeo-skill categories --json  # Verify catalog is accessible
```

`doctor` reports `ok: false`, includes actionable `errors`, and exits nonzero when
`npx` is missing or Node.js is unavailable, unsupported (below 22.20), or fails its
version check. `linked` is reported separately: an unlinked checkout CLI can still
pass the prerequisite check. Browsing requires only Python; `categories` does not
check installation tools. Search accepts non-negative `--limit` values (`0` returns
no matches); negative values are rejected.

`JEO_SKILLS_CATALOG=/path/to/skills.json` overrides catalog discovery for all browse,
install, and doctor commands. An explicit path must be readable and valid: a missing
file or directory is an error, never a silent fallback to the checkout or remote
catalog. Unset the variable to restore automatic discovery.

## Examples

```bash
# Web design and frontend implementation
jeo-skill list -c web -s design
jeo-skill install --bundle web-frontend --global --yes

# Focused game workflows
jeo-skill list -c game -s motion-vfx
jeo-skill related game-vfx
jeo-skill install game-vfx rfxgen --global --yes

# CLI-only discovery
jeo-skill list -c cli-tools --interface cli

# Full global installation (all skills to shared root)
jeo-skill install --all --global --yes
```

## Best practices

- Install by name or curated bundle before installing an entire category.
- Use `--dry-run` to preview every multi-skill installation.
- Run `jeo-skill doctor` after any installation to verify linkage.
- Keep one central taxonomy projection; do not add category wrapper folders.
- Connect neighboring skills with relationship groups rather than duplicating instructions.
- Keep heavy upstream apps, models, MCP servers, and runtimes on-demand inside each skill.

## References

- Catalog: `.agent-skills/skills.json`
- Compact projection: `.agent-skills/skills.toon`
- Agent Skills installer: `npx skills --help`
- Setup automation: `setup-all-skills-prompt.md`
- Catalog validator: `scripts/validate-catalog-projections.py`
