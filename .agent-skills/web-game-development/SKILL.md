---
name: web-game-development
description: >
  Route Three.js and browser game-development requests into the narrowest matching
  sub-skill of the 19-skill MengTo/Skills game-development family — level
  authoring, map editing, cameras, enemy systems and AI, monster rigs, action
  combat, encounter design, inventory, hybrid/Vesperfall assets, VFX, audio
  feedback, mobile controls, performance tuning, QA, changelogs, and release.
  Use when a task touches any of those for a playable web game, and fetch the
  matching sub-skill before doing the work instead of improvising. Route
  Unity/C# engine work to `unity-gamedev-skill-pack` instead. Triggers on:
  three.js game, browser game, webgl game, isometric arpg, enemy AI, game
  camera, game inventory, game VFX, game audio feedback, ship web game,
  playtest web game, mobile threejs game, game encounter design, monster rig,
  hybrid game assets.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best for Three.js, WebGL, and browser-native game repositories where the task
  is choosing and fetching the correct upstream MengTo/Skills sub-skill. Not for
  Unity/C# or Unreal engine work, generic web-app (non-game) performance,
  CI/CD pipeline design, or Steam marketing ops — route those elsewhere.
license: MIT
metadata:
  tags: game-development, three.js, webgl, browser-games, skill-routing, skill-pack, mengto-skills
  version: "1.0"
  source: https://github.com/MengTo/Skills/tree/main/agent-skills/game-development
---

# Web Game Development

Use this skill when the real question is **"which upstream Three.js/browser game-development skill should own this task, and how do I get it installed?"**

This is a **routing pack**, not a reimplementation. The 19 real sub-skills live
upstream at [MengTo/Skills](https://github.com/MengTo/Skills/tree/main/agent-skills/game-development).
The job here is to:

1. classify the task honestly against the 19 sub-skills,
2. pick the single narrowest match (combine only when the task truly crosses a
   documented boundary),
3. fetch that sub-skill locally if it is not already installed,
4. sequence multi-skill work along the game lifecycle, and
5. route out to this repo's non-Three.js skills when they are the real owner.

Read [references/skill-routing-table.md](references/skill-routing-table.md) for
the full 19-skill decision table with upstream-grounded "use when" lines and
boundary notes.
Read [references/lifecycle-and-handoffs.md](references/lifecycle-and-handoffs.md)
for the prototype → systems → content → assets → feel → perf → QA → release
ordering and which sub-skills own each stage.
Read [references/route-outs.md](references/route-outs.md) before routing to
`unity-gamedev-skill-pack`, `game-performance-profiler`, `game-ci-cd-pipeline`,
`game-build-log-triage`, `game-demo-feedback-triage`, `steam-store-launch-ops`,
or `perfectpixel`.

## Explicit boundary against `unity-gamedev-skill-pack`

`unity-gamedev-skill-pack` curates external **Unity/C#** skill packs
(Addressables, Cinemachine, GAS, VContainer, UniTask, Wwise). This skill,
`web-game-development`, routes into the **Three.js / browser** game-development
family instead. If the engine is Unity or Unreal, stop here and use
`unity-gamedev-skill-pack` (or the engine-specific Unity/Unreal skills such as
`game-performance-profiler`, `game-ci-cd-pipeline`, `game-build-log-triage`
described in [references/route-outs.md](references/route-outs.md)). Do not
apply Three.js-authored sub-skill guidance to a Unity project or vice versa.

## When to use this skill

- The task is building, extending, or auditing a Three.js/browser action game
- You need to pick between two or more upstream game-development sub-skills
  and are not sure which one is narrowest
- The upstream sub-skill needed for the task is not yet installed locally
- You are sequencing a multi-stage slice (e.g. new enemy type touching content,
  rig, AI, combat, and VFX skills) and need the right order and boundaries
- You need an honest route-out to a Unity, generic-perf, CI/CD, build-log,
  demo-feedback, Steam-marketing, or sprite-generation skill instead

## When not to use this skill

- **The engine is Unity or Unreal** → use `unity-gamedev-skill-pack` (or the
  Unity/Unreal-specific skills in `references/route-outs.md`)
- **The task is generic web-app performance, not gameplay** → use
  `game-performance-profiler`'s non-game sibling or a general perf skill
- **The task is designing CI/CD or diagnosing a red build log** → use
  `game-ci-cd-pipeline` or `game-build-log-triage`
- **The task is triaging playtest/demo feedback into a fix list** → use
  `game-demo-feedback-triage`
- **The task is Steam store-page, wishlist, or launch-window strategy** → use
  `steam-store-launch-ops`
- **The task is generating 2D pixel-art sprite sheets from a text prompt** →
  use `perfectpixel`

## Instructions

### Step 1: Classify the request against the 19-skill table

Use [references/skill-routing-table.md](references/skill-routing-table.md).
Name the single narrowest sub-skill. If two skills seem to match, re-read the
"Important boundaries" rules there before combining them — most apparent
overlaps (enemy systems vs monster rig vs AI, combat vs encounters, hybrid
assets vs Vesperfall review vs VFX/audio, test-playable vs ship) are actually
one skill each owning a distinct concern.

### Step 2: Check whether the matched sub-skill is installed

```bash
ls "${SKILLS_ROOT:-$HOME/.agents/skills}" | grep -x "<matched-skill-name>" || echo "not installed"
```

### Step 3: Fetch the sub-skill if missing

Use `scripts/fetch-upstream-skills.sh`, which sparse-checkouts only
`agent-skills/game-development` from `https://github.com/MengTo/Skills.git`
and copies the requested sub-skill folder(s) into
`${SKILLS_ROOT:-$HOME/.agents/skills}` without deleting anything already there.

```bash
scripts/fetch-upstream-skills.sh --skill build-threejs-enemy-systems --skill tune-enemy-ai
```

Or fetch the entire family:

```bash
scripts/fetch-upstream-skills.sh --all
```

Always run with `--dry-run` first when the outcome is uncertain.

### Step 4: Sequence multi-skill work along the lifecycle

Use [references/lifecycle-and-handoffs.md](references/lifecycle-and-handoffs.md)
to order work: prototype → systems → content → assets → feel → perf → QA →
release. Do not build VFX/audio polish before the underlying system (combat,
encounter, enemy) is defined; do not ship before test-playable proof exists.

### Step 5: Route out honestly when this pack is not the right owner

Use [references/route-outs.md](references/route-outs.md). State the target
skill name and the one-line reason before handing off.

## Output format

Return a short **routing packet**:

```markdown
## Routing packet
- Matched sub-skill(s): <name(s)>
- Why this is narrowest: <one line, grounded in the routing table>
- Installed? <yes/no> — fetch command if no
- Lifecycle stage: <prototype|systems|content|assets|feel|perf|qa|release>
- Route-out (if any): <skill name + reason>
```

## Examples

### Example 1: New enemy type end to end

**Input**
> Add a new ranged enemy archetype with its own moveset, rig, AI behavior, and
> impact VFX to our Three.js ARPG.

**Output sketch**
- Matched sub-skills: `build-threejs-enemy-systems` (content/moveset contract)
  → `build-game-monster-system` (rig/socket/collider conformance) →
  `tune-enemy-ai` (perception/intent/attack choice) → `create-game-vfx`
  (impact feedback)
- Boundary note: enemy-systems owns portable content, monster-system owns rig
  conformance, tune-enemy-ai owns behavior — none of the three substitute for
  another
- Lifecycle stage: systems → content → feel

### Example 2: Mobile HUD regression

**Input**
> Our inventory drag-and-drop is broken on touch and the HUD overlaps the
> action buttons in portrait.

**Output sketch**
- Matched sub-skills: `build-mobile-threejs-games` (touch/HUD/orientation),
  `build-game-inventory` (drag/drop, non-drag alternatives)
- Lifecycle stage: content/feel, then QA
- Route-out: none — stays inside this pack

### Example 3: Unity project mistakenly routed here

**Input**
> Our Unity Addressables build keeps failing before a Steam release, fix it.

**Output sketch**
- Route-out: `unity-gamedev-skill-pack` (engine is Unity/C#, not Three.js) and
  `game-build-log-triage` for the failing build
- Do not apply any of the 19 Three.js sub-skills here

## Best practices

1. Start with the narrowest sub-skill; only combine skills when a documented
   boundary genuinely requires it.
2. Fetch sub-skills through `scripts/fetch-upstream-skills.sh` rather than
   hand-copying files, so provenance and sparse-checkout scope stay clean.
3. Never invent sub-skill content — this pack only routes; the upstream
   `SKILL.md` is the source of truth once fetched.
4. Sequence work along the lifecycle so polish (VFX/audio) never precedes the
   system it communicates.
5. Route out to Unity, perf, CI/CD, build-log, demo-feedback, Steam, or sprite
   skills honestly instead of stretching this pack to cover them.
6. Keep `--dry-run` as the default first run of the fetch script in unfamiliar
   environments.

## References

- [Skill Routing Table](references/skill-routing-table.md)
- [Lifecycle and Handoffs](references/lifecycle-and-handoffs.md)
- [Route-outs](references/route-outs.md)
- [MengTo/Skills game-development family](https://github.com/MengTo/Skills/tree/main/agent-skills/game-development)
