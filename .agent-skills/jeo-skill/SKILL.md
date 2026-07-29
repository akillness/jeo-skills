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

## Instructions

### 1. Link the CLI once

From a source checkout or an installed copy of this skill:

```bash
python3 scripts/jeo-skill.py link
jeo-skill doctor
```

This creates only `~/.local/bin/jeo-skill`. It does not install the full catalog.

### 2. Browse before installing

```bash
jeo-skill categories
jeo-skill list --category web
jeo-skill list --category game --subcategory audio
jeo-skill search "responsive React design"
jeo-skill related code-review
```

The catalog uses ten stable primary categories:

- `web`: frontend, backend, design, API, data, testing, accessibility, performance
- `infrastructure`: deployment, environment, observability, security, cloud/data, automation
- `game`: client, web, server, design/UI, audio, animation, motion/VFX, sprite/image,
  art resources, storytelling, tooling, QA/performance, release
- `creative-media`: image, video, motion, audio, presentation, diagram, capture, storytelling
- `cli-tools`: developer, AI, media, automation, search, benchmark CLIs
- `ai-agents`: orchestration, agent frameworks, skill authoring, evaluation, planning/review
- `engineering`: code quality, testing, architecture, documentation
- `research`: academic, web research, data analysis, benchmarking
- `business`: marketing, support, publishing
- `utilities`: knowledge, files, Git, workspace, project management, general utilities

### 3. Prefer the narrowest install

```bash
# Preview first; no files are installed.
jeo-skill install --bundle web-frontend --dry-run
jeo-skill install --category game --subcategory audio --dry-run

# Install globally after reviewing the selection.
jeo-skill install responsive-design react-best-practices --global --yes
jeo-skill install --bundle game-web --global --yes
```

The CLI delegates installation to `npx skills add ... --skill ...`; it never copies the
whole repository unless the user explicitly selects every skill. Omit `--global` for a
project-local install. Use `--agent <runtime>` to target a specific supported runtime.

### 4. Treat overlap as a routing relationship

`jeo-skill related <name>` shows catalog relationship groups. Keep adjacent tools as
separate skills when their runtime or job differs—for example, human code-review judgment
versus the `ocr` CLI. Use a canonical alias only when ordinary prompts truly compete and
backward-compatible exact-name installation is required.

### 5. Verify observable behavior

```bash
jeo-skill doctor
jeo-skill categories --json
jeo-skill install --bundle starter --dry-run
```

`doctor` must resolve a valid catalog and report Python/npx availability. A dry run must
print the exact selected skill names and installation command without changing the system.

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
```

## Best practices

- Install by name or curated bundle before installing an entire category.
- Keep one central taxonomy projection; do not add category wrapper folders containing
  duplicate `SKILL.md` files.
- Connect neighboring skills with relationship groups rather than duplicating instructions.
- Keep heavy upstream apps, models, MCP servers, and runtimes on-demand inside each skill.
- Run `--dry-run` before any multi-skill install and report the resolved selection.

## References

- Catalog: `.agent-skills/skills.json`
- Compact projection: `.agent-skills/skills.toon`
- Agent Skills installer: `npx skills --help`
- Catalog validator: `scripts/validate-catalog-projections.py`
