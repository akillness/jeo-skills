# Cinema 4D-exported Mixamo FBX support

Since v0.1.7, the FBX loader accepts Mixamo character FBXs that were opened and
re-exported by Cinema 4D (and similar exporters that rewrite joint
transforms). Pass the file wherever a Mixamo rig is expected — `--rig`, or
**Mixamo Rig FBX** in the Blender add-on. It does not need to be re-saved in
Blender first.

Contributed by [@yng47](https://github.com/yng47) in
[#8](https://github.com/MaxLiu22/Motion2MixamoRig/issues/8).

## What changed

### Rest pose from bind matrices

Original Mixamo FBXs encode each joint's bind orientation in `PreRotation`.
Cinema 4D can bake that orientation into `Lcl Rotation` and drop
`PreRotation`. Rebuilding the rest pose from the local Euler properties alone
then gives a different joint frame, worse further down the hierarchy: a bad
rest pose and broken skinning, even with no animation applied.

The loader now reconstructs the rest pose in this priority order:

1. FBX `Pose` / `PoseNode.Matrix`, when present.
2. Skin-cluster `TransformLink`, for joints with no usable Pose record. When
   several meshes link the same joint, the matrix closest to all the others is
   used (rotation matrices are not averaged).
3. Local FBX transform properties, for joints without a bind matrix (usually
   end-site bones).

For a joint with a bind-world matrix, the local bind transform is derived
relative to its parent, and its rigid rotation is extracted from the matrix
(scale and shear removed). Animation rotations stay **deltas relative to the
bind orientation**. In the GLB, each joint node stores the recovered bind
transform and the animation channel stores the delta.

For original Mixamo FBXs this produces the same rest pose as before (see
[Validation](#validation)).

### One glTF skin per mesh piece

FBX skin clusters can store different inverse-bind matrices for each geometry
object, while a glTF skin has a single inverse-bind-matrix accessor. Earlier
versions reused the first geometry's matrices for every mesh piece, so joints
looked right in Blender while the mesh separated or collapsed. Each geometry is
now exported as its own glTF mesh node and skin; the joint hierarchy and the
animation are shared. This keeps the GLB and the preview renderer, which
already used per-geometry matrices, in agreement.

Visible effect in Blender: the character imports as one mesh object per FBX
geometry (for Y Bot, `skinned_mesh_0_Alpha_Surface` and
`skinned_mesh_1_Alpha_Joints`) instead of a single `skinned_mesh`. The armature
is still named `mixamo`.

## Usage

```bash
m2mr run --video assets/video/dance.mp4 --rig path/to/c4d-export.fbx
m2mr run --image assets/image/pose.jpg --rig path/to/c4d-export.fbx

# Reuse a previous extraction while changing the rig
m2mr run --skeleton outputs/<previous-run>/skeleton_motion.npz --rig path/to/c4d-export.fbx
```

## Validation

On a test pair (original Mixamo FBX and its Cinema 4D export):

| Check | Original Mixamo FBX | Cinema 4D FBX |
|---|---:|---:|
| Core bones | 25 | 25 |
| Full rig bones | 33 | 33 |
| Maximum full-rig rest-FK matrix error | `1.7e-14` | `3.2e-14` |
| Rest-skin error (cm) | `6.5e-14` | `2.0e-13` |

A Cinema 4D GLB smoke test confirmed that all seven mesh pieces receive their
matching skin matrices.

No regression for original Mixamo rigs: the same `skeleton_motion.npz` (787
frames) run on Y Bot before and after the change gives

- per-bone rotations within `4e-7` (float rounding),
- `rest_skin_error_cm` of `1.4e-5` (was `9.9e-5`),
- skinned vertex positions in Blender within `0.5 µm` on frames 1, 100, 300,
  and 600,
- and the same add-on import result (collection, FPS, frame range, hidden
  joint spheres).

`run.json` reports `rest_fk_error` and `rest_skin_error_cm` for every run;
both should stay near zero with a Cinema 4D rig too. Check a real motion run
visually in Blender as well.
