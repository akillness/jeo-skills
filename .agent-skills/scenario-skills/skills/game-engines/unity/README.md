# Unity Expert Skills

Agent skills that let Claude (Claude Code) or Codex drive Unity 6.3 LTS the way the experts in the
best tutorials, conference talks and official documentation do. Built on 2026-09-24 with the same
method as [Blender Expert Skills](../../dcc/blender/README.md): transcripts of top-rated videos,
cited expert notes, then skills with tools and review rubrics, graded blind against the same model
without them. Every procedure was also run live in Unity. Start with the lead skill,
`scenario-unity-expert`.

## Skills

| Skill                                | Use it when                                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scenario-unity-2d`                  | building a 2D game in Unity 6.3 URP: pixel-art or HD sprite import and PPU, sprite atlases, Tilemaps, Rule Tiles and reskins, the 2D Renderer and 2D... |
| `scenario-unity-animation`           | a Unity 6.3 task involves character animation or cameras: Mixamo or mocap humanoid import and retargeting, Animator Controllers, blend trees, layers... |
| `scenario-unity-architecture`        | structuring Unity 6.3 C# code: ScriptableObject data vs runtime state, events and services, inventory, health, save and load, Input System actions...   |
| `scenario-unity-expert`              | an agent drives Unity 6.3 (6000.3) on a Mac for any task: batch mode and -executeMethod jobs, a running editor (the user's GUI editor or a headless...  |
| `scenario-unity-gameplay`            | building or debugging Unity gameplay systems: enemy AI that patrols, chases and attacks, NavMesh baking and agents (AI Navigation 2), feet sliding...   |
| `scenario-unity-mobile`              | a Unity 6.3 game targets Android or iOS: phone frame budget, overheating after 20 minutes, 'my game stutters on phones', ASTC or ETC2 textures...       |
| `scenario-unity-performance`         | a Unity 6.3 game is slow or stutters: low fps, frame spikes, hitches when entering areas or on first effects, GC spikes, too many draw calls or...      |
| `scenario-unity-pipeline-automation` | automating a Unity 6.3 content pipeline or build: importing an art drop (FBX, PNG) with AssetPostprocessor rules and naming conventions, generating...  |
| `scenario-unity-rendering-lighting`  | setting up URP (or choosing URP vs HDRP), configuring URP assets and quality tiers for PC and phones, lighting a stylized or realistic Unity scene...   |
| `scenario-unity-shaders`             | a Unity 6.3 URP task involves shaders: hand-written HLSL, Shader Graph water, toon, dissolve or outline, Custom Function nodes, a renderer feature...   |
| `scenario-unity-ui`                  | building or fixing game UI in Unity 6.3: main menu, settings screen (resolution, quality, volume, key rebinding), HUD, health bar, minimap frame...     |
| `scenario-unity-vfx`                 | making or fixing real-time VFX in Unity 6.3: explosions, fireballs, projectiles with muzzle, trail and impact, spells, slashes, shockwaves, smoke...    |
| `scenario-unity-web`                 | a Unity 6.3 game must run in a browser: 'export to WebGL', Web build settings or Build Profiles, gzip or Brotli, Decompression Fallback, server...      |
| `scenario-unity-world-building`      | building a Unity 6.3 level or open world: terrain from code or heightmaps, procedural islands, erosion, splat and foliage rules, trees and grass...     |

## Status

- 14 skills (the lead `scenario-unity-expert`, which carries the shared Python toolkit `ut_*` and
  the C# AgentKit, plus 13 specialists) written from 203 expert videos (84 h) and 76 documentation
  pages, each with references, a `ut_<domain>.py` module and C# editor or runtime code.
- Verified live: every procedure was run in Unity 6000.3.21f1 on macOS (Apple Silicon), 447 live
  tests and checks across the 14 skills: batch mode, a live editor bridge, the Unity CLI, captures
  that were looked at, EditMode and PlayMode tests, a development player, and macOS, Web, signed
  Android AAB and iOS Xcode export builds, with Web builds loaded in headless Chrome. Each skill's
  `references/procedures.md` records the result of every procedure.
- Blind-graded written scenarios (round 1, 12 production briefs): 63 % without the skills (113/180),
  97 % with them (174/180); all 12 scenarios improved. One grader per scenario, so read it as a
  direction, not a statistic. The grades measure written plans, not finished games, and were taken
  before a refactor round that fed every gap back into the skills; the refactored skills were not
  re-graded.
- Not run: installs on phones, store uploads, Apple signing (Xcode lacked the iOS platform
  component), real purchases and ads, Safari, GitHub Actions on a runner, Unity Accelerator,
  windowed GPU captures. Each skill lists what it could not run.

## Requirements

- Unity 6.3 LTS (6000.3.x; tested on 6000.3.21f1), installed through Unity Hub under
  `/Applications/Unity/Hub/Editor`. Tested on macOS (Apple Silicon) only.
- A signed-in Unity Hub for batch mode: a Personal license activates only by signing in, and must go
  online every 30 days. Without it, batch runs exit with "Access token is unavailable".
- Python 3.9+ (system `python3`) for the runner-side toolkit; the core uses the standard library.
  Optional: Pillow and numpy (faster image checks, drawing helpers), Playwright with an installed
  Chrome (Web browser checks), the Android and iOS Build Support modules and Xcode (mobile builds).

The lead skill `scenario-unity-expert` explains the execution channels: batch mode with
`-executeMethod` jobs, a running editor over the Unity CLI, the Test Framework and command-line
builds.

## Install

```bash
npx skills add scenario-labs/skills --skill scenario-unity-expert scenario-unity-2d scenario-unity-animation scenario-unity-architecture scenario-unity-gameplay scenario-unity-mobile scenario-unity-performance scenario-unity-pipeline-automation scenario-unity-rendering-lighting scenario-unity-shaders scenario-unity-ui scenario-unity-vfx scenario-unity-web scenario-unity-world-building
```

The installer puts the skills side by side, which the specialists need: they import the lead skill's
`scripts/`. In the installer picker (`npx skills add scenario-labs/skills`), the family is the
"Expert tools: Unity" group. Update with `npx skills update`.

## Provenance

Ported from
[edemaistre/unity-expert-skills](https://github.com/edemaistre/unity-expert-skills/tree/v0.1), built
on 2026-09-24, with these changes: the `scenario-` prefix on every skill name, this repository's
frontmatter (`name`, `description`, `license`), no version line in the skill bodies, the
sibling-install line in each `SKILL.md`, and paths into the build project made relative.

Inside references, code comments and revision notes, "v0.1" and "v0.2" name the two internal build
rounds (first build, then the refactor after blind grading); both are included here. The C#
AgentKit's `Version` constants, reported as `agentkit` in job results, are internal protocol
markers.

Paths such as `tests/code/...`, `tests/projects/...` or `archive/tests/...` inside the skills point
to the build project (tests, live evidence) on the author's machine; they are provenance only and
are not part of this repo.
