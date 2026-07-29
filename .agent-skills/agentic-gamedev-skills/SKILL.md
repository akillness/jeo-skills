---
name: agentic-gamedev-skills
description: >
  Discover, select, and safely install focused skills from
  abagames/agentic-gamedev-skills. Use when a user explicitly wants that upstream
  collection, needs to choose among its mini-game design, Godot, crisp-game-lib,
  presentation, telemetry, or agent-workflow skills, or wants a pinned selective
  bundle install. Triggers on: agentic-gamedev-skills, abagames skills, install
  gamedev skill bundle, designing-mini-games, or upstream game skill inventory.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: Git, Bash, and an Agent Skills-compatible skill directory
metadata:
  tags: game-development, agent-skills, godot, browser-games, skill-installer, abagames
  version: "1.0.0"
  source: https://github.com/abagames/agentic-gamedev-skills
---

# Agentic Gamedev Skills

## When to use this skill

- List or install one or more skills from `abagames/agentic-gamedev-skills`.
- Choose the narrowest upstream workflow for mini-game design, implementation, presentation, tuning, or workflow research.
- Pin and refresh a local copy while preserving existing skills.

Do not activate this bundle wrapper for ordinary game implementation when a dedicated installed skill already owns the work. Select that skill directly. This wrapper owns discovery and safe installation of the upstream collection.

## Instructions

### Step 1: Classify the request

Choose exactly one mode:

1. **Inventory** — list available upstream skill names.
2. **Selective install** — install named skills only.
3. **Full bundle** — install every upstream skill after conflict review.
4. **Refresh** — update explicitly selected skills from a pinned ref.
5. **Route only** — identify the best sub-skill without installing anything.

### Step 2: Inspect the inventory

```bash
bash .agent-skills/agentic-gamedev-skills/scripts/install-upstream.sh --list
```

Use `references/inventory.md` for lane descriptions. Prefer one narrow skill. Examples:

- rules and control loops → `designing-mini-games` or `designing-minimal-game-rules`;
- Godot scaffolding/CLI/audio → the corresponding Godot skill;
- browser implementation and checks → `developing-with-crisp-game-lib`, `smoke-testing-web-games`, or `probing-web-game-mechanics`;
- presentation → `directing-game-visuals`, `maximizing-game-feel`, typography, or sound-kit skills;
- telemetry tuning → `evaluating-gameplay-balance`;
- reusable workflow extraction → the extraction, gating, or refinement skills.

### Step 3: Preview conflicts before mutation

The installer never overwrites an existing destination unless `--force` is explicit. Set an alternate root for project-local staging:

```bash
SKILLS_ROOT="$PWD/.agents/skills" \
  bash .agent-skills/agentic-gamedev-skills/scripts/install-upstream.sh \
  --skill designing-mini-games --skill evaluating-gameplay-balance
```

For a full bundle, list and compare names first; do not let `--all --force` replace locally customized skills without review.

### Step 4: Pin reproducible installs

```bash
REF=d632732fa0f09dfac9bb4d5fa2e5c8872f41cc10 \
  bash .agent-skills/agentic-gamedev-skills/scripts/install-upstream.sh \
  --skill designing-mini-games
```

The script stages a shallow checkout, validates each payload's `SKILL.md`, and then copies it. It does not install the upstream repository's separately referenced external skills.

### Step 5: Verify installed payloads

For every selected skill:

- confirm `<skills-root>/<name>/SKILL.md` exists and is non-empty;
- confirm frontmatter name matches the destination;
- preserve any referenced `assets/`, `references/`, `scripts/`, `tools/`, or `agents/` directories;
- invoke the installed skill with one representative prompt;
- record the upstream ref used.

### Step 6: Route out when another family owns the task

Use `unity-gamedev-skill-pack` for Unity/C#, `web-game-development` for broader Three.js game systems, `game-vfx` for engine-neutral effect design, and `rfxgen` for chiptune SFX generation. Do not install a broad bundle merely to answer a narrow conceptual question.

## Examples

### List only

```bash
bash .agent-skills/agentic-gamedev-skills/scripts/install-upstream.sh --list
```

### Install two skills globally without overwriting

```bash
bash .agent-skills/agentic-gamedev-skills/scripts/install-upstream.sh \
  --skill designing-mini-games \
  --skill smoke-testing-web-games
```

## Best practices

1. Prefer selective installs over the full collection.
2. Pin a commit in CI or shared-team setup.
3. Never silently overwrite an existing skill.
4. Keep upstream support directories intact.
5. Separate bundle management from actually executing a selected sub-skill.

## References

- `references/inventory.md` — current 25-skill inventory and routing summary.
- `references/upstream.md` — provenance, version, license, and update policy.
- [abagames/agentic-gamedev-skills](https://github.com/abagames/agentic-gamedev-skills)
