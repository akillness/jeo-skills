# scenario-godot-animation: sources

Credentials as recorded by the research pass ("unverified": the channel was not checked against a
public record). Godot versions are those shown in the source. Researched 2026-10-01 to 2026-10-02;
notes in `notes/animation/` of the build project. Live checks: Godot 4.7.2.stable on 2026-10-02.

## Videos

| Expert               | Credential                                                    | Source                                                                                                                         | Best for                                                              | Best timestamps                                    |
| -------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | -------------------------------------------------- |
| CoderNunk            | Godot and Blender indie developer, educator (unverified)      | How to Import Animations Into Godot Consistently, https://www.youtube.com/watch?v=0wMONEpEXpQ (4.4/4.5, 2025)                  | Blender to Godot pipeline, loop hints, split character and clip files | 00:00:19, 00:01:23, 00:11:26 to 00:12:15, 00:14:22 |
| Quilled              | Godot and Blender hobbyist (unverified)                       | Import Animations in Godot 4 with Animation Retargeting, https://www.youtube.com/watch?v=nb6uSeEZFCI (4.2/4.3, 2024)           | BoneMap, shared library, Skip Import, Make Unique                     | 00:02:22, 00:02:55, 00:04:36, 00:05:08             |
| FinePointCGI (Mitch) | software developer, Godot tutor                               | Using Root Motion In Godot 4!, https://www.youtube.com/watch?v=fq0hR2tIsRk (4.0, 2023)                                         | root bone, root motion track, velocity from delta                     | 00:04:35, 00:11:39, 00:29:17, 00:29:53             |
| RiftOfNostaria       | indie developer (unverified)                                  | Ultimate Godot AnimationTree Tutorial, https://www.youtube.com/watch?v=E6ajmQhOeo4 (4.4/4.5, 2025)                             | BlendTree root, OneShot filters, subtree resources                    | 00:03:15, 00:08:48, 00:12:22, 00:15:47             |
| Bitlytic             | indie Godot developer (unverified)                            | Why Animation Trees in Godot 4 are Unbelievably Useful, https://www.youtube.com/watch?v=iElHZhOxGYA (4.2/4.3, 2024)            | advance expressions, TimeScale, property paths                        | 00:01:11, 00:03:53, 00:04:31, 00:05:37             |
| Chris' Tutorials     | Godot educator (unverified)                                   | Animation Tree State Machine Setup w/ Conditions and BlendSpace2D, https://www.youtube.com/watch?v=WrMORzl3g1U (4.0/4.1, 2023) | conditions, BlendSpace2D ranges, Remote debugging                     | 00:01:40, 00:02:13, 00:07:42, 00:09:20             |
| Fair Fight           | Godot character-controller and netcode developer (unverified) | Watch this before using AnimationTree, https://www.youtube.com/watch?v=jzuvd0Lstuw (4.x, 2024)                                 | simulate in code, present in animation                                | 00:05:14, 00:05:46, 00:07:57                       |
| Fair Fight           | same                                                          | One Node Revolutionizes AAA Skeletal Animation in Godot 4.3, https://www.youtube.com/watch?v=xpoPfUKI9tw (4.3, 2024)           | SkeletonModifier3D layering                                           | 00:02:10, 00:21:09, 00:24:38, 00:28:34             |
| Fair Fight           | same                                                          | Advanced Godot's SkeletonModifier3D: create, debug and optimize, https://www.youtube.com/watch?v=XFZQNsFejwk (4.4/4.5, 2025)   | modifier output lifetime, track caching, global-pose overlays         | 00:02:04, 00:04:03 to 00:06:45, 00:12:16, 00:14:07 |
| Lukky                | Godot developer (unverified)                                  | Inverse Kinematics, Godot 4.6 Tutorial, https://www.youtube.com/watch?v=MbaPDWfbNLo (4.6, 2026)                                | 4.6 IK family, determinism, influence, poles                          | 00:02:02, 00:04:46, 00:07:49, 00:09:30             |
| MeroDev              | Godot developer (unverified)                                  | Procedural Animation In Godot 4.6, https://www.youtube.com/watch?v=17xi4vDqQJk (4.6, 2026)                                     | procedural stepping, deterministic legs                               | 00:02:28, 00:05:59, 00:07:42, 00:09:20             |
| Queble               | Godot developer and tutor (unverified)                        | make better animations with Tweens in Godot!, https://www.youtube.com/watch?v=KUyQzjpRsU8 (4.4, 2025)                          | kill guard, ease and transition, tween vs player                      | 00:01:14, 00:01:48, 00:02:54                       |
| MrEliptik            | shipped indie developer, juice and UI consultant              | How I animate UI easily in my game Lexispell, https://www.youtube.com/watch?v=aagPe4dvM2M (4.6, 2026)                          | UI tweens, stagger, AutoTween                                         | 00:03:32, 00:04:04, 00:05:38                       |
| DevWorm              | Godot educator (unverified)                                   | A Guide to the ANIMATION PLAYER in Godot 4.4+, https://www.youtube.com/watch?v=GMyw3eHDw7s (4.4, 2025)                         | AnimationPlayer craft, RESET, gating on animation_finished            | 00:13:09, 00:22:58, 00:38:30                       |
| DevWorm              | same                                                          | How to Make SMOOTH CUTSCENES in Godot 4, https://www.youtube.com/watch?v=Fyb7LlBphps (4.1/4.2, 2023; dated)                    | flag and timer cutscenes (counter-example)                            | n/a                                                |
| Nathan Hoad          | indie developer, author of the Dialogue Manager addon         | How I make cut-scenes for my game, https://www.youtube.com/watch?v=G_TN8jz4v9o (4.x, 2024)                                     | dialogue-driven cutscenes that await game code                        | 00:01:58, 00:03:08                                 |
| Blargis              | Godot and Blender hobbyist (unverified)                       | Godot RESET Tracks Explained, https://www.youtube.com/watch?v=ghYilg9cq-I (4.0/4.1, 2023)                                      | RESET naming, Reset On Save, imported RESET wiped                     | 00:01:01, 00:02:39, 00:03:14                       |

## Official documentation (retrieved 2026-10-02)

- Introduction to the animation features:
  https://docs.godotengine.org/en/stable/tutorials/animation/introduction.html
- Animation track types:
  https://docs.godotengine.org/en/stable/tutorials/animation/animation_track_types.html
- Using AnimationTree:
  https://docs.godotengine.org/en/stable/tutorials/animation/animation_tree.html
- Import configuration (3D scenes, animation):
  https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/importing_3d_scenes/import_configuration.html
- SkeletonModifier3D: https://docs.godotengine.org/en/stable/classes/class_skeletonmodifier3d.html
- Tween: https://docs.godotengine.org/en/stable/classes/class_tween.html

## Engine source and class reference read for this skill

- Godot 4.7.2 importer source (`editor/import/3d/post_import_plugin_skeleton_renamer.cpp`,
  `..._rest_fixer.cpp`, `..._track_organizer.cpp`, `resource_importer_scene.cpp`): import option
  names and the scene importer's loop-hint rule. Copies in
  `tests/projects/godot-animation/src_ref/`. The GLTFDocument prefix rule was observed live, not
  read in source.
- Godot 4.7.2 class XML: TwoBoneIK3D, IterateIK3D, IKModifier3D, RetargetModifier3D,
  CopyTransformModifier3D, LookAtModifier3D, SkeletonModifier3D, Skeleton3D, AnimationMixer,
  AnimationTree, AnimationNodeStateMachineTransition, AnimationNodeOneShot, BlendSpace1D/2D, Tween,
  AwaitTweener, SubtweenTweener, SpringArm3D.
- Version deltas collected for the Godot skills (`sources/godot-version-deltas.md`): `tween_await`
  4.7, `tween_subtween` 4.4, the 4.6 IK family, `_process_modification_with_delta`, Animation
  markers.
