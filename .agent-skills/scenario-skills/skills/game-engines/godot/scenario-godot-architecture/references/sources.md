# scenario-godot-architecture: sources

Credentials come from the cluster notes. "Unverified" means the note could not confirm the person's
track record beyond the channel itself. Version facts come from `sources/godot-version-deltas.md`
(authoritative for 4.7.2). Live corrections are in `expert-notes.md`.

## Videos

| Expert                    | Credential                                       | URL                                                      | Best for                                                                              | Best timestamps                                                                                                       |
| ------------------------- | ------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| FAT Earth Studios         | indie studio, large 2D project (unverified)      | https://www.youtube.com/watch?v=zLdTvkLsmgA (2026-03-07) | real-project traps: negative scale, preload chains, offset vs position, static typing | 00:01:49 offset, 00:04:30 negative scale, 00:05:34 preload chains, 00:07:12 offscreen enablers                        |
| FAT Earth Studios         | same                                             | https://www.youtube.com/watch?v=V4SO7foDoW4 (2026-06-08) | MainGame coordinator, stable roots, layer order, process modes, `load_level`          | 00:03:00 folders, 00:04:56 ownership, 00:06:01 spawn markers, 00:07:44 layers, 00:08:57 pause, 00:10:13 load_level    |
| Godotneers                | Godot educator, long-form tutorials (unverified) | https://www.youtube.com/watch?v=W8gYHTjDCic (2023-10-03) | components, communication trade-offs, spawning under a stable parent                  | 00:06:05 components, 00:39:51 layers and masks, 00:54:16 autoloads, 01:05:16 spawn parent, 01:09:16 no best choice    |
| Godotneers                | same                                             | https://www.youtube.com/watch?v=4vAkTHeoORk (2024-01-28) | Resource data models, export-only breakage, `has_all` mutation                        | 00:12:57 dictionary DB problems, 00:33:06 `@onready`, 01:08:55 `has_all`, 01:13:35 to 01:18:00 folder scan in exports |
| Firebelley Games          | indie developer, shipped games (unverified)      | https://www.youtube.com/watch?v=rCu8vQrdDDI (2022-12-24) | composition, glue root script, component granularity                                  | 00:02:11 inheritance trap, 00:03:42 to 00:09:00 Health, Hurtbox, Velocity, 00:08:28 not 100 components                |
| Eric Peterson             | GodotCon 2025 speaker (event listing)            | https://www.youtube.com/watch?v=yB3Wv-Lr7pg (2025-07-19) | event bus rules: call down, signal up, event out                                      | 00:05:54, 00:08:31 rule, 00:10:31 buckets, 00:17:36 stateless, 00:23:18 event objects, 00:26:51 sequence caveat       |
| Sam Szuflita              | GodotCon 2025 speaker; shipped "This Side Up"    | https://www.youtube.com/watch?v=1qHPKg_Xovs (2025-08-21) | custom Resource as live global state                                                  | 00:01:47, 00:05:30 PlayerState, 00:06:11 dump and reload state, 00:06:44 caveat                                       |
| Mark Wilson (Chickensoft) | GodotCon 2025 speaker                            | https://www.youtube.com/watch?v=BgrHnJDt2ww (2025-08-07) | C# architecture stack, dependency injection, testable design, versioned saves         | 00:06:44 state ownership, 00:12:29 AutoInject, 00:13:01 ready order, 00:17:03 save early                              |
| Queble                    | Godot educator (unverified)                      | https://www.youtube.com/watch?v=u9aMR50yjCE (2025-02-13) | static scene constructors                                                             | 00:01:03 goal, 00:01:47 class_name and preload, 00:02:19 to 00:03:29 constructor                                      |
| DevWorm                   | Godot educator (unverified)                      | https://www.youtube.com/watch?v=zbAKzM-Odb4 (2024-10-23) | when to use a Resource, immutable stats                                               | 00:00:22 to 00:00:53 what a Resource is not, 00:19:04 immutable at runtime                                            |
| DevDuck                   | indie dev, 4+ years on an 11k-line project       | https://www.youtube.com/watch?v=4az0VX9ApcA (2024-08-02) | feature-first folders, `common/`, suffix naming                                       | 00:00:56, 00:02:34, 00:03:56 common, 00:06:15 suffix names                                                            |
| GDQuest                   | Godot training studio                            | https://www.youtube.com/watch?v=1VUDMFBpdZQ (2024-01-13) | GDScript vs C# vs C++ decision                                                        | 00:01:03 does not matter much, 00:04:04 when C#, 00:04:36 C# costs, 00:06:06 mix                                      |
| GDQuest                   | same                                             | https://www.youtube.com/watch?v=Qlq8pBB2htg (2023-12-15) | signals in editor vs code                                                             | 00:03:24 Callable connect, 00:06:16 broken connections                                                                |
| Boon Makes Games          | indie dev, benchmark author (unverified)         | https://www.youtube.com/watch?v=mNa0m2fvGOc (2023-09-24) | typed vs untyped GDScript speed (4.1 era)                                             | 00:01:39 bubble sort 116%, built-in sort unchanged                                                                    |
| Boon Makes Games          | same                                             | https://www.youtube.com/watch?v=hZvCCvo3AHc (2023-09-19) | C# vs GDScript speed (4.0/4.1)                                                        | 00:00:26 sort, 00:00:46 A*, 00:01:30 mix them                                                                         |
| BatteryAcidDev            | developer educator (unverified)                  | https://www.youtube.com/watch?v=c3Jf-av_5NE (2024-02-01) | Git branching and LFS for Godot                                                       | 00:00:27 baseline commit, 00:02:40 LFS, 00:10:23 branches, 00:22:52 upgrades                                          |
| Jacob Foxe                | Godot educator (unverified)                      | https://www.youtube.com/watch?v=8VC_QGpZEXk (2025-01-16) | style guide walk-through                                                              | 00:04:10 naming, 00:05:51 typing, 00:09:23 trailing commas, 00:17:01 parentheses                                      |

Listed in the research file without a cluster note, so not used: Firebelley Games, "How to Build
Godot Editor Tools Like a Pro" (VyTys5oCdN8). Editor tooling belongs to
scenario-godot-pipeline-automation.

## Official documentation (retrieved 2026-10-02, docs.godotengine.org/en/stable)

| Page                           | URL                                                                                          | Best for                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Scene organization             | https://docs.godotengine.org/en/stable/tutorials/best_practices/scene_organization.html      | dependency injection, standalone scenes, configuration warnings, autoload vs node |
| Project organization           | https://docs.godotengine.org/en/stable/tutorials/best_practices/project_organization.html    | snake_case, case-sensitive PCK, `.gdignore` rules, `addons/`                      |
| Resources                      | https://docs.godotengine.org/en/stable/tutorials/scripting/resources.html                    | shared cache, inner-class warning, `_init` defaults                               |
| Static typing in GDScript      | https://docs.godotengine.org/en/stable/tutorials/scripting/gdscript/static_typing.html       | warnings, `as` vs `is`, safe lines, typed collections                             |
| GDScript style guide           | https://docs.godotengine.org/en/stable/tutorials/scripting/gdscript/gdscript_styleguide.html | naming, code order, formatting                                                    |
| C# API differences to GDScript | https://docs.godotengine.org/en/stable/tutorials/scripting/c_sharp/c_sharp_differences.html  | Identity structs, signal delegates, missing `preload`, `@onready`, `bind`         |

## Internal

- `sources/godot-version-deltas.md`: device ids (4.7), `store_*` returns bool (4.4), deep
  duplication (4.5), typed dictionaries (4.4), `.uid` (4.4), Jolt defaults, `class_name` after
  `--import`, C# platforms.
- Live evidence: `tests/live_evidence/godot-architecture/` (live runs, offline lint).
