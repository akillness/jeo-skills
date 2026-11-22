# scenario-godot-animation: expert notes

What practitioners say, with the video id and timestamp, and what the live tests in Godot 4.7.2
showed. "Tested" points to `procedures.md`. Items marked [added] are this skill's own conclusions,
not a source's.

## 1. Code decides, the animation layer presents

- AnimationTree holds no game logic: code sets parameters and the tree only blends (WrMORzl3g1U
  00:01:40; jzuvd0Lstuw 00:05:14). Fair Fight's test: the controller must keep working with the tree
  removed (jzuvd0Lstuw 00:05:46, 00:07:57).
- When to skip the tree: Fair Fight argues trees do not scale for 100+ animations or networked,
  layered 3D and prefers code plus SkeletonModifier3D layers (xpoPfUKI9tw, jzuvd0Lstuw);
  RiftOfNostaria, Bitlytic and Chris build on trees (E6ajmQhOeo4, iElHZhOxGYA, WrMORzl3g1U). Fair
  Fight flags his own performance claim as invalid (xpoPfUKI9tw 00:21:09). Deciding condition
  [added]: prototype, 2D and a normal locomotion set favor the tree; very large move sets, rollback
  netcode or many stacked procedural layers favor code.
- Advance expressions read game state from a base node; conditions are true-only booleans
  (WrMORzl3g1U 00:02:13 to 00:02:46; RiftOfNostaria E6ajmQhOeo4 00:12:22). Expressions are cleaner,
  conditions are easier to inspect live (iElHZhOxGYA 00:04:31). Tested (P6): `not on_floor` works in
  an expression; the audit flags a condition written as a negation.
- Tested trap [added]: an expression transition left at the default `advance_mode` (Enabled) never
  fires. Only Auto evaluates expressions and conditions; Enabled is for `travel()` only. No error is
  printed.
- Tested trap [added]: two auto transitions true in the same frame. Ground to Fall (`not on_floor`)
  beat Ground to JumpUp (`jump_pressed`) at equal priority; `priority = 0` on the jump transition
  fixed it, so priority applies to auto-advance as well as travel in 4.7.2.

## 2. Layering and blends

- Use OneShot filters so an action does not stop the other tracks; put a state machine inside a
  BlendTree root (E6ajmQhOeo4 00:03:15, 00:15:47); save a subtree as a resource to reuse it
  (00:08:48).
- Docs: deterministic blending needs RESET tracks and a T-pose rest for humanoids
  (doc-animation-tree). Tested (P7): an unfiltered OneShot whose clip animates only the right arm
  drives every other bone to RESET (deterministic, the AnimationTree default) or freezes them at the
  fade-in pose (non-deterministic). Filtering the OneShot is the fix in both modes.
- Slow motion through a TimeScale node in a BlendTree wrapper, not `speed_scale` (iElHZhOxGYA
  00:05:37). Built in P6, not measured.
- Sync on blend spaces keeps walk and run in phase (doc-animation-tree, Sync Mode); blend mode
  Discrete for sprites (WrMORzl3g1U 00:14:14), Carry for same-length cycles (iElHZhOxGYA 00:01:11),
  Continuous for 3D.
- BlendSpace2D: an axis range larger than the points (plus or minus 1.1) biases diagonals; Y is
  inverted in 2D (WrMORzl3g1U 00:09:20, 00:13:09). Not tested here.
- Debug a silent tree in Scene > Remote by reading `parameters/...` (WrMORzl3g1U 00:07:42); copy
  property paths from the inspector because they shift when the root is wrapped (iElHZhOxGYA
  00:03:53, WrMORzl3g1U 00:04:23).
- Tree nodes are shared resources, parameters are per instance (doc-animation-tree). Tested (P6):
  editing a OneShot on one instance changed the other.

## 3. RESET and saved state

- RESET must be named exactly `RESET`; turn on Reset On Save (Blargis ghYilg9cq-I 00:01:01,
  00:03:14; DevWorm GMyw3eHDw7s 00:38:30). A blind-accepted "Create RESET tracks" from a .blend is
  wiped on reimport: author it upstream, or save the clip to file with Keep Custom Tracks
  (ghYilg9cq-I 00:02:39).
- Key a known state at t=0 of every clip that changes a property another clip also changes
  (GMyw3eHDw7s 00:13:09).
- Tested (P2, A1): the audit flags animated paths missing from RESET. Tested (P3): an imported glTF
  has no RESET until `animation/import_rest_as_RESET` is on.

## 4. Import and retargeting

- Put the loop hint in the clip name so it survives re-export: `-loop`, `-cycle`, also as a prefix
  (CoderNunk 0wMONEpEXpQ 00:11:26 to 00:12:15). Tested (P3): suffix hints are stripped by the scene
  importer; a `loop` prefix loops through GLTFDocument and stays in the name; case does not matter.
- Humanoid BoneMap, then one library for every character (Quilled nb6uSeEZFCI 00:02:22 to 00:05:08).
  Make the loaded library unique per character or they all move together (00:05:08); Skip Import on
  the second character's own AnimationPlayer (00:04:36). Tested (P5): a 1.15x body plays the shared
  library with 0 unresolved tracks. Tested: two players holding the same library object played Walk
  and Idle independently, so the "all characters move together" effect was not reproduced; `unique`
  matters when one character's clips are edited at runtime [added].
- Blender side: Rigify Limb Segments = 1 and Game Friendly single root before export (0wMONEpEXpQ
  00:00:19, 00:01:23); NLA push-down so one glb carries all clips (nb6uSeEZFCI 00:00:32 to
  00:02:20). Not run here (Blender is the blender-* skills' job).
- Tested [added]: bone names with `:` are imported with `_` (Skeleton3D refuses `:` and `/`; in a
  probe, `add_bone("a:b")` failed with a malformed error string, "Formatting error ... not all
  arguments converted"). A BoneMap must name the imported bones: one built from `mixamorig:` names
  renamed nothing and printed nothing.
- Tested [added]: Normalize Position Tracks stores Hips keys in hip-height units and sets
  `Skeleton3D.motion_scale` to the hip height; the mixer multiplies back on playback, so a taller
  retargeted body walks a longer stride. Anything reading raw keys must multiply by `motion_scale`.
- Tested [added]: a glTF written by GLTFDocument puts every animated joint in every clip (the
  3-track wave came back with all joints), so partial clips do not survive a round trip; the layer
  must come from a filter, not from missing tracks.
- Fair Fight caches `find_track` lookups in a bone-to-track map (1.5 to 1.7x on large rigs, about 3x
  on Mixamo) and says this needs identical track layouts, so he disables Remove Immutable Tracks on
  import (XFZQNsFejwk 00:04:03 to 00:06:45). Tested (P5): after a default import (Remove Immutable
  Tracks on) the library clips still shared one layout here; in a probe, the option removed constant
  tracks equal to rest and collapsed other constant tracks to one key. Check the layout with
  `anim_audit.gd:library` before relying on it.

## 5. Root motion

- Root motion needs a real root bone; Hips as root wobbles (FinePointCGI fq0hR2tIsRk 00:04:35 to
  00:05:56). Divide by delta before assigning velocity and do not redeclare `velocity` (00:29:53,
  00:29:17). The clip still walks in place in the player until the root motion track is assigned
  (00:11:39 to 00:12:28).
- Tested (P8): 1.2 m per loop, body travel 3.6 m in 3 s, Root bone zeroed in the pose,
  `motion_scale` scales root motion.
- Choice [added]: player-driven locomotion (velocity from input, blend position from speed) keeps
  control responsive; root motion suits one-shot moves (dodge, climb, vault) and cutscene beats
  where the feet must stay planted. Mixamo clips need a Root inserted upstream for root motion.

## 6. Skeleton modifiers and IK

- 4.6 added a real IK family on SkeletonModifier3D: TwoBoneIK3D for arms and legs, FABRIK3D and
  CCDIK3D for chains (Lukky MbaPDWfbNLo 00:00:00 to 00:02:35, 00:02:02). Installed 4.7.2 also has
  JacobianIK3D and SplineIK3D.
- IK is a layer over animation with `influence` as the blend (MbaPDWfbNLo 00:08:25 to 00:09:30;
  xpoPfUKI9tw 00:02:10). IK solves position only: add CopyTransformModifier3D for hand rotation, a
  pole for the elbow or knee (MbaPDWfbNLo 00:07:49).
- Deterministic iterate IK when one iteration is taken, with an angle limit (MbaPDWfbNLo 00:04:46);
  deterministic for stepping legs (MeroDev 17xi4vDqQJk 00:02:28). Not tested (TwoBoneIK3D is
  analytic).
- Ground the targets with rays or SpringArm3D beams pointing down (MbaPDWfbNLo 00:05:13 to
  00:06:17). Tested (P10) with a FootPlacer modifier.
- Modifier output is discarded every frame (Fair Fight XFZQNsFejwk 00:02:04). Tested (P10): plain
  reads return the animated pose; read in `modification_processed` for one modifier's 100 percent
  result, or in `Skeleton3D.skeleton_updated` for the final pose after influence.
- Each modifier blocks exactly one feature; avoid several "level zero" modifiers toggled at runtime
  (xpoPfUKI9tw 00:24:38, 00:28:34). Compute global transforms incrementally (XFZQNsFejwk 00:14:07);
  blend overlays in global pose with per-chain Curve weights (00:12:16, 00:21:36).
- Procedural stepping: alternate leg pairs, a `top_level` marker wrapper that copies only X/Z
  position and Y rotation, targets offset ahead of the body; known failures are levitation, walls
  and clipping (17xi4vDqQJk 00:05:59, 00:06:32, 00:09:20, 00:07:42 to 00:08:49). Not tested here.

## 7. Tweens

- One owner per property: kill the old tween before creating a new one (Queble KUyQzjpRsU8
  00:02:54). Tested (P11): unguarded tweens fight (41.25 instead of 37.5).
- Pick ease and transition deliberately; linear defaults look bad (KUyQzjpRsU8 00:01:14). Tweens for
  subtle and unknown-start values, AnimationPlayer for authored multi-property curves (00:01:48).
  MrEliptik tweens all UI (aagPe4dvM2M 00:00:33); DevWorm drives UI with AnimationPlayer
  (GMyw3eHDw7s 00:50:19). Deciding condition [added]: is the start value known at design time, and
  is the motion reused across many nodes.
- UI: fade containers through `modulate.a`, not `visible` (aagPe4dvM2M 00:03:32); stagger with
  overlap and give focus before the intro ends (00:04:04, 00:04:38); scale amplitude down for big
  buttons (00:02:50). Tested (P11): stagger values.
- `custom_step` is the deterministic test hook; it does nothing inside `_init` (doc-tween-class;
  confirmed here after one frame).

## 8. Cutscenes

- Three ways: Nathan Hoad drives cutscenes from Dialogue Manager scripts whose mutations `await`
  game functions (G_TN8jz4v9o 00:01:58, 00:03:08); DevWorm uses hand flags and timers (Fyb7LlBphps,
  4.1/4.2 era, per-frame increments that ignore delta); one AnimationPlayer timeline [added].
  Deciding condition: dialogue-heavy 2D RPG favors the dialogue script; a camera-authored sequence
  favors the timeline.
- Gate hurt or attack clips on `animation_finished` plus a state flag, otherwise next frame's walk
  overwrites them (GMyw3eHDw7s 00:22:58).
- Tested (P13): discrete `current` tracks cut cameras, an Animation track drives the hero's own
  player, markers play a section, method calls are Deferred by default and pile up if nothing yields
  a frame.
