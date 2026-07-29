---
name: threejs-animation
description: >
  Implement and debug Three.js motion with AnimationMixer, clips and actions, GLTF
  animation playback, skeletal rigs, morph targets, cross-fades, and frame-rate-independent
  procedural animation. Use when playing or blending model animations, driving bones or
  morphs, creating timeline motion, or fixing animation lifecycle and performance issues.
  Triggers on: Three.js animation, AnimationMixer, AnimationAction, AnimationClip, GLTF
  animation, skeletal animation, bones, morph targets, crossfade, procedural motion.
allowed-tools: Bash Read Write Edit Glob Grep
license: MIT
metadata:
  tags: three.js, animation, animation-mixer, gltf, skeleton, morph-targets, webgl
  version: "1.0"
  source: https://github.com/CloudAI-X/threejs-skills/tree/main/skills/threejs-animation
---

# Three.js Animation

Use this skill for the animation implementation itself: clip selection, mixer ownership,
blending, skeleton/morph driving, and time-step correctness. Use `threejs-loaders` to
load the model and `web-game-development` when game-state or combat design—not the
animation API—is the primary problem.

## When to use this skill

- Play, pause, seek, loop, or blend `AnimationClip` data through `AnimationMixer`
- Attach GLTF clips to a loaded scene and clean mixers up with the model lifecycle
- Animate skeletal bones, morph target influences, or lightweight procedural movement
- Fix actions that do not play, snap during transitions, speed up with frame rate, or leak

## Instructions

### Step 1: Identify the animation owner and clock

1. Inspect the model's `gltf.animations`, root object, and current render-loop owner.
2. Create one mixer per animated root and advance it once per frame with elapsed **delta**
   time, not a fixed per-frame amount.
3. Preserve action references by semantic name; do not index an exported clip array
   blindly because asset revisions can reorder clips.

```js
const mixer = new THREE.AnimationMixer(gltf.scene);
const clips = new Map(gltf.animations.map((clip) => [clip.name, clip]));
const idle = mixer.clipAction(clips.get("Idle"));
idle.reset().fadeIn(0.2).play();

const clock = new THREE.Clock();
function update() {
  mixer.update(clock.getDelta());
  renderer.render(scene, camera);
  requestAnimationFrame(update);
}
update();
```

### Step 2: Transition actions without visual discontinuities

Set loop and clamp behavior deliberately, reset an incoming action before playing it,
and use cross-fades only when clips share a compatible pose/rig.

```js
function transition(from, to, duration = 0.2) {
  to.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
  from.crossFadeTo(to, duration, false);
}
```

For one-shot actions, listen for the mixer's `finished` event and transition back to a
known idle action. Remove listeners during feature teardown.

### Step 3: Choose the narrowest animation mechanism

| Need | Default mechanism |
|---|---|
| Authored transform/property keys | `AnimationClip` + keyframe tracks |
| Imported character animation | `AnimationMixer` + `clipAction` |
| Per-frame idle motion or UI response | Delta-time procedural update |
| Facial expressions or mesh deformation | `morphTargetInfluences` |
| Runtime bone adjustment | Bone transform after mixer update |
| Layered additive pose | Additive clip only after validating reference pose |

Apply procedural bone offsets after `mixer.update(delta)` so the authored clip does not
overwrite them. Keep expensive IK, physics, or retargeting behind a measured budget.

### Step 4: Dispose animation state with the feature

Call `mixer.stopAllAction()` and `mixer.uncacheRoot(root)` when the animated root is
permanently removed. Do not uncache a root shared by another scene or instance.

### Step 5: Verify animation behavior

- Test at a low and high frame rate; duration and travel must remain consistent.
- Test transition interruption, one-shot completion, and rapid action changes.
- Confirm named clips exist and report a useful error when an expected asset export changes.
- Verify cleanup by mounting/unmounting the scene repeatedly without growing listeners or
  retained mixer actions.

## Examples

### Animate a morph target

```js
const face = gltf.scene.getObjectByName("Face");
face.morphTargetInfluences[0] = 0.75;
```

Validate that the mesh has morph targets and use a named index map from the asset rather
than a magic number when the export includes multiple expressions.

### Drive a simple procedural bob

```js
const elapsed = clock.getElapsedTime();
mesh.position.y = baseY + Math.sin(elapsed * 2) * 0.1;
```

Store `baseY` separately. Incremental position changes accumulate drift and make mixing
with authored animation difficult.

## Best practices

1. Update mixers exactly once per frame with `delta` seconds.
2. Prefer exported clips for authored movement; procedural offsets should be additive and
   localized.
3. Name clips at export time and validate names at load time.
4. Avoid cloning a rig or mixer without checking shared skeleton and material ownership.
5. Profile skinned meshes and morph targets on target hardware before multiplying them.

## References

- [Three.js Animation source coverage](https://github.com/CloudAI-X/threejs-skills/tree/main/skills/threejs-animation)
- [AnimationMixer documentation](https://threejs.org/docs/#api/en/animation/AnimationMixer)
- [Three.js manual: animation system](https://threejs.org/manual/#en/animation-system)
