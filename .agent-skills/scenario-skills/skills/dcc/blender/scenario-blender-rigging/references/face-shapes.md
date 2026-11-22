# Face shape sets

Name lists read from the vendor pages on 2026-10-18. `bx_rig.SHAPE_SETS` holds the ARKit and viseme
sets; Roblox poses are frames of a joint rig, so no shape-key helper covers them.

## Apple ARKit: 52 blend shapes

Source:
[ARFaceAnchor.BlendShapeLocation](https://developer.apple.com/documentation/arkit/arfaceanchor/blendshapelocation).
Exact case, camelCase:

- Brow (5): `browDownLeft`, `browDownRight`, `browInnerUp`, `browOuterUpLeft`, `browOuterUpRight`.
- Cheek (3): `cheekPuff`, `cheekSquintLeft`, `cheekSquintRight`.
- Eye (14): `eyeBlinkLeft`, `eyeBlinkRight`, `eyeLookDownLeft`, `eyeLookDownRight`, `eyeLookInLeft`,
  `eyeLookInRight`, `eyeLookOutLeft`, `eyeLookOutRight`, `eyeLookUpLeft`, `eyeLookUpRight`,
  `eyeSquintLeft`, `eyeSquintRight`, `eyeWideLeft`, `eyeWideRight`.
- Jaw (4): `jawForward`, `jawLeft`, `jawOpen`, `jawRight`.
- Mouth (23): `mouthClose`, `mouthDimpleLeft`, `mouthDimpleRight`, `mouthFrownLeft`,
  `mouthFrownRight`, `mouthFunnel`, `mouthLeft`, `mouthLowerDownLeft`, `mouthLowerDownRight`,
  `mouthPressLeft`, `mouthPressRight`, `mouthPucker`, `mouthRight`, `mouthRollLower`,
  `mouthRollUpper`, `mouthShrugLower`, `mouthShrugUpper`, `mouthSmileLeft`, `mouthSmileRight`,
  `mouthStretchLeft`, `mouthStretchRight`, `mouthUpperUpLeft`, `mouthUpperUpRight`.
- Nose (2): `noseSneerLeft`, `noseSneerRight`.
- Tongue (1): `tongueOut`.

Sides:

- The blend shape pages do not say whose left: `eyeBlinkLeft` is "closure of the eyelids over the
  left eye".
- [ARFaceAnchor](https://developer.apple.com/documentation/arkit/arfaceanchor) defines the face's
  coordinate space: "the positive x direction points to the viewer's right (that is, the face's own
  left)".
- A Blender character faces -Y, so its own left is +X, the `.L` side. `shape_report` returns
  `left_is: "+X"` when the Left keys move that side.
- Every `Left`/`Right` pair is a mirror pair, `jawLeft`/`jawRight` and `mouthLeft`/`mouthRight`
  included: `mirror_shape_key` builds one from the other.

## Meta Lipsync: 15 visemes

Source:
[Viseme reference](https://developers.meta.com/horizon/documentation/unity/audio-ovrlipsync-viseme-reference/),
an archived Oculus Lipsync page based on the MPEG-4 viseme set. Exact spelling:

| Viseme | Phonemes  | Examples         |
| ------ | --------- | ---------------- |
| `sil`  | neutral   | silence          |
| `PP`   | p, b, m   | put, bat, mat    |
| `FF`   | f, v      | fat, vat         |
| `TH`   | th        | think, that      |
| `DD`   | t, d      | tip, doll        |
| `kk`   | k, g      | call, gas        |
| `CH`   | tS, dZ, S | chair, join, she |
| `SS`   | s, z      | sir, zeal        |
| `nn`   | n, l      | lot, not         |
| `RR`   | r         | red              |
| `aa`   | A:        | car              |
| `E`    | e         | bed              |
| `I`    | ih        | tip              |
| `O`    | oh        | toe              |
| `U`    | ou        | book             |

## Roblox dynamic heads: 50 FACS poses

Sources:
[FACS poses reference](https://create.roblox.com/docs/avatar/dynamic-heads/facs-poses-reference),
[dynamic head specifications](https://create.roblox.com/docs/avatar/dynamic-heads/specifications),
[create basic dynamic heads](https://create.roblox.com/docs/art/characters/facial-animation/create-basic-heads).

- Poses are joint poses, one per frame of the animation timeline: frame 0 holds the neutral face,
  poses start at frame 1. Each frame is mapped to its pose name as a custom property on the head
  mesh.
- Face joints sit under a `RootFaceJoint` (often named `DynamicHead`) parented to the R15 head
  joint. Roblox recommends fewer than 50 face joints.
- Marketplace validation rejects a head without the first 17 poses below (marked \*).

Names, PascalCase:

- \* `LeftEyeClosed`, `RightEyeClosed`, `EyesLookDown`, `JawDrop`, `Pucker`, `LeftLipCornerPuller`,
  `RightLipCornerPuller`, `ChinRaiser`, `ChinRaiserUpperLip`, `LeftCheekRaiser`, `RightCheekRaiser`,
  `LeftInnerBrowRaiser`, `RightInnerBrowRaiser`, `LeftLipCornerDown`, `RightLipCornerDown`,
  `LeftLowerLipDepressor`, `RightLowerLipDepressor`.
- `EyesLookLeft`, `EyesLookRight`, `EyesLookUp`, `LeftLipStretcher`, `LeftUpperLipRaiser`,
  `LipsTogether`, `RightLipStretcher`, `RightUpperLipRaiser`, `FlatPucker`, `Funneler`,
  `LowerLipSuck`, `LipPresser`, `MouthLeft`, `MouthRight`, `UpperLipSuck`, `LeftCheekPuff`,
  `LeftDimpler`, `RightCheekPuff`, `RightDimpler`, `JawLeft`, `JawRight`, `Corrugator`,
  `LeftBrowLowerer`, `LeftOuterBrowRaiser`, `LeftNoseWrinkler`, `RightBrowLowerer`,
  `RightOuterBrowRaiser`, `RightNoseWrinkler`, `LeftEyeUpperLidRaiser`, `RightEyeUpperLidRaiser`,
  `TongueDown`, `TongueOut`, `TongueUp`.

## Export

Measured in Blender 5.2.1 (`tests/scenario-blender-expert/test_live_face_shapes.py`): 52 ARKit keys
plus 15 visemes, 47 of them still at the Basis, exported to FBX and GLB and re-imported with every
name, every empty key and the `+X` left side kept. An exported file can therefore list all 52 names
and still animate nothing: run `shape_report` before export.
