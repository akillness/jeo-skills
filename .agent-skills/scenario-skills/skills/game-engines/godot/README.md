# Godot Expert Skills

Agent skills that let Claude (Claude Code) or Codex drive Godot 4.7 the way the experts in the best
tutorials, conference talks and official documentation do. Built on 2026-10-02 with the same method
as [Unity Expert Skills](../unity/README.md) and
[Blender Expert Skills](../../dcc/blender/README.md): transcripts of top-rated videos, cited expert
notes, then skills with tools and review rubrics, graded blind against the same model without them.
Every procedure was also run live in Godot 4.7.2. Start with the lead skill,
`scenario-godot-expert`.

## Skills

| Skill                                | Use it when                                                                                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scenario-godot-2d`                  | building a 2D game in Godot 4.7: make a platformer or top-down controller that feels right (coyote time, jump buffer, jump height), TileMapLayer and...  |
| `scenario-godot-3d-world`            | building 3D levels and worlds in Godot 4.7: third-person or FPS controller, player stuck on stairs, spring arm camera clipping, blockout with CSG...     |
| `scenario-godot-animation`           | animating characters or scenes in Godot 4.7: AnimationPlayer clips and RESET, AnimationTree state machines and blend spaces built in code, Mixamo or...  |
| `scenario-godot-architecture`        | structuring Godot 4.7 game code: folders, scenes and nodes, signals or an event bus autoload, custom Resources for item data, components (health...      |
| `scenario-godot-audio`               | adding or fixing sound in Godot 4.7: audio buses and effects, volume sliders, 'too many sounds', combat audio with hundreds of enemies, sounds...        |
| `scenario-godot-expert`              | an agent drives Godot 4.7 on macOS or Windows for any task: headless --script jobs, --import, --check-only, command-line exports, GUT tests...           |
| `scenario-godot-gameplay`            | building gameplay systems in Godot 4.7: enemy AI that patrols, chases and attacks, state machines, behavior trees (LimboAI), NavigationAgent3D...        |
| `scenario-godot-multiplayer`         | a Godot 4 game goes online or co-op: host and join with ENet, WebSocket for a web build, RPCs (@rpc, rpc_id, any_peer), MultiplayerSpawner and...        |
| `scenario-godot-performance-export`  | a Godot game stutters, drops frames, hitches when entering new areas, overheats a phone, or must ship: profiling and Performance monitors, CPU or GPU... |
| `scenario-godot-pipeline-automation` | Godot 4.7 work must run without a mouse or at scale: batch import of hundreds of GLB props or an AI image-to-3D art drop, naming rules, import...        |
| `scenario-godot-rendering-lighting`  | lighting or rendering a Godot 4.7 3D scene: pick a renderer (Forward+, Mobile, Compatibility), choose GI (SDFGI, VoxelGI, LightmapGI, reflection...      |
| `scenario-godot-shaders`             | writing or fixing Godot 4.7 shaders: .gdshader code (spatial, canvas_item, particles, sky, fog), VisualShader graphs built in code, stylized or toon...  |
| `scenario-godot-ui`                  | building or fixing game UI in Godot 4.7: main menu, settings screen, HUD (health bar, ammo, minimap frame), Control layout, containers, anchors...       |
| `scenario-godot-vfx`                 | making or fixing particle effects and game feel in Godot 4.7: GPUParticles3D or GPUParticles2D explosion, fireball projectile with trail, impact...      |

## Status

- 14 skills (the lead `scenario-godot-expert`, which carries the shared Python toolkit `gd_*` and
  the GDScript AgentKit, plus 13 specialists) written from 216 expert videos (about 80 h, mostly
  2024 to 2026, Godot 4) and 74 documentation pages, each with references, a `gd_<domain>.py` module
  and GDScript kit code.
- Verified live: every procedure was run in Godot 4.7.2.stable on macOS (Apple Silicon):
  `godot --headless` jobs, `--import`, windowed captures that were looked at, GUT and gdUnit4 runs,
  real ENet clients and servers, macOS, Web (loaded in headless Chrome), Android APK and iOS
  Xcode-project exports. Per-skill counts as reported by each skill's own suite (the units differ,
  groups or checks, so they are not summed):

| Skill                                | Live and offline tests                                                              |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| `scenario-godot-expert`              | 23 live tests, 17 offline                                                           |
| `scenario-godot-architecture`        | 11 live groups (L1 to L10, L12; the C# check L11 not run), 30 GUT tests, 17 offline |
| `scenario-godot-2d`                  | 18 live, 20 offline                                                                 |
| `scenario-godot-3d-world`            | 14 live groups, 11 offline                                                          |
| `scenario-godot-rendering-lighting`  | 15 live (P0 to P14)                                                                 |
| `scenario-godot-shaders`             | 17 live, 4 offline                                                                  |
| `scenario-godot-vfx`                 | 12 live, 6 offline                                                                  |
| `scenario-godot-animation`           | 11 live                                                                             |
| `scenario-godot-ui`                  | 13 live                                                                             |
| `scenario-godot-gameplay`            | 16 live                                                                             |
| `scenario-godot-audio`               | 12 live groups (18 jobs), 13 offline                                                |
| `scenario-godot-multiplayer`         | 14 live, 18 offline                                                                 |
| `scenario-godot-pipeline-automation` | 43 checks in 9 test files, 8 offline                                                |
| `scenario-godot-performance-export`  | 12 live (P1 to P12), 6 offline                                                      |

- Blind-graded written scenarios (round 1, 12 production briefs): 79 % without the skills (143/180),
  92 % with them (165/180). Ten of twelve scenarios improved, one tied (mobile) and one got worse
  (3D world, 13 vs 14). One grader per scenario and one answer per condition, so read it as a
  direction, not a statistic. The baseline agents were allowed to probe the installed Godot 4.7.2,
  which is why the gap is smaller than for the Unity and Unreal Engine skills. The grades measure
  written plans, not finished games, and were taken before a refactor round that fed every gap back
  into the skills; the refactored skills were not re-graded. One grader claim (OmniLight3D shadow
  mode) was found wrong by a live check.
- Not run: installs on phones, store uploads, Apple signing and notarization, Gradle AAB and
  bundletool, `xcodebuild` (Xcode lacked the iOS platform component), a .NET (C#) Godot build,
  Steam, Nakama, Colyseus, netfox and WebRTC P2P, the GUI-only editor steps (including MCP servers
  that open an editor window), godot-cpp and Rust builds, GitHub Actions on a runner, and real
  Scenario generation (synthetic assets stood in). Each skill lists what it could not run.

## Requirements

- Godot 4.7.2 standard build (tested on 4.7.2.stable; `brew install --cask godot`, or
  `winget install GodotEngine.GodotEngine` on Windows). No sign-in or license. Export templates for
  exports (`gd_env.install_templates()` downloads them, about 1.3 GB). Tested on macOS (Apple
  Silicon); on Windows, the toolkit's locks, process checks, project copies, headless jobs and a
  windowed capture were run on a GitHub-hosted runner (2026-10-13), not the live suites.
- Python 3.9+ (system `python3`; on Windows 3.15+, or `PYTHONUTF8=1` before it) for the runner-side
  toolkit; the core uses the standard library. Optional: Pillow and numpy (image checks), Playwright
  with an installed Chrome (Web browser checks), an Android SDK and JDK and Xcode (mobile exports),
  ffmpeg (audio analysis).
- GUT and gdUnit4 are downloaded on demand by the toolkit.

The lead skill `scenario-godot-expert` explains the execution channels: `godot --headless` jobs,
windowed capture runs, an editor MCP server, and GUT or gdUnit4 tests.

## Install

```bash
npx skills add scenario-labs/skills --skill scenario-godot-expert scenario-godot-2d scenario-godot-3d-world scenario-godot-animation scenario-godot-architecture scenario-godot-audio scenario-godot-gameplay scenario-godot-multiplayer scenario-godot-performance-export scenario-godot-pipeline-automation scenario-godot-rendering-lighting scenario-godot-shaders scenario-godot-ui scenario-godot-vfx
```

The installer puts the skills side by side, which the specialists need: they import the lead skill's
`scripts/` (Python toolkit and GDScript AgentKit). In the installer picker
(`npx skills add scenario-labs/skills`), the family is the "Expert tools: Godot" group. Update with
`npx skills update`.

## Provenance

Ported from
[edemaistre/godot-expert-skills](https://github.com/edemaistre/godot-expert-skills/tree/v0.1), built
on 2026-10-02, with these changes: the `scenario-` prefix on every skill name, this repository's
frontmatter (`name`, `description`, `license`), no version line in the skill bodies, the
sibling-install line in each `SKILL.md`, file paths in each `SKILL.md` turned into links, and US
spelling in the prose. To fit the 2500-word cap, the lead skill's toolkit signature block was
replaced by a link to the same API in `references/procedures.md` section 1, and its Godot 4.7 traps
and macOS notes moved unchanged to `references/traps.md`.

Inside references, code comments and revision notes, "v0.1" and "0.1" name the internal build round;
Python scripts still expose `__version__ = "0.1"`, an internal marker, not this repository's
release.

Paths such as `tests/code/...`, `tests/projects/...` or `tests/live_evidence/...` inside the skills
point to the build project (tests, live evidence) on the author's machine; they are provenance only
and are not part of this repo.
