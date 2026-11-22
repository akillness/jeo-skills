# GUI paths

Menus and panels for the same work, for a human or a computer-use agent. Studio's current UI has the
tabs Home, Model, Avatar, UI, Script and Plugins. The `⋯` button is in the Animation Editor's
playback controls. Each row names the scripted substitute an agent uses instead (procedures in
`references/procedures.md`).

## Animation Editor

| Task                                                            | Path                                                                                                                                                              | Scripted substitute                                                               |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Open the editor                                                 | Avatar tab > Clip Editor (or Window > Avatar), then select a rig                                                                                                  | AnimClip.keyframes or AnimClip.curves (P2, P3)                                    |
| Insert a test rig                                               | Avatar or Home tab > Character (Rig Builder)                                                                                                                      | `Players:CreateHumanoidModelFromDescriptionAsync` (P1)                            |
| Import an FBX animation                                         | anchor the rig's HumanoidRootPart, select the rig, `⋯` > Import > From FBX Animation, pick the file, rig source "selected" (Mykaiju, NI7GXKLwk6U 00:30:00)        | Blender samples to a KeyframeSequence (P10); checks in `characters.md`, section 5 |
| Import from video                                               | enable the Live Animation Creator beta, then `⋯` > Import > Live Animation Creator (one person, under 15 s, stable camera)                                        | none                                                                              |
| Add an event                                                    | right-click the timeline at the frame > Add Animation Event                                                                                                       | KeyframeMarker or MarkerCurve (P2, P3)                                            |
| Set the priority                                                | `⋯` > Set Animation Priority                                                                                                                                      | `KeyframeSequence.Priority`, `track.Priority`                                     |
| Loop                                                            | Looping button in the playback controls                                                                                                                           | `KeyframeSequence.Loop`                                                           |
| Rename the last keyframe `End` (default-animation replacements) | right-click the final keyframe > Rename Key Keyframe > `End`                                                                                                      | `names = {[t] = "End"}` in AnimClip.keyframes                                     |
| Convert to curves                                               | Curve Editor icon at the top left of the timeline (confirms the KeyframeSequence to CurveAnimation conversion; quaternion tracks become Euler and cannot go back) | AnimClip.curves                                                                   |
| Save                                                            | `⋯` > Save or Save As (KeyframeSequence in ServerStorage, link in the rig's AnimSaves)                                                                            | keep authoring clips in ServerStorage                                             |
| Publish                                                         | `⋯` > Publish to Roblox; in Asset Configuration pick the group under Creator for a group-owned experience                                                         | none: uploads are out of scope for agents                                         |

After an FBX animation import, delete the `RBX_MICROBONE_NODES` folder from Workspace (Mykaiju,
NI7GXKLwk6U 00:29:02). Check the clip length readout: 24 fps clips read seconds:frames, 42 frames as
1:18 (00:29:10).

## Import and rigs

| Task                             | Path                                                                                          | Scripted substitute                                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Import a rigged model            | Home tab > Import (3D Importer), Rig General > Rig Type (R15 or Custom)                       | after a Custom import, `AnimRig.prepareImport` (`characters.md`, section 1); AnimRig.build for part rigs (P10) |
| Adaptive Animation joint mapping | Avatar tab > Adaptive Animation > Remap Rig > Create, then assign joints in the visual picker | HumanoidRigDescription properties (P11, partial)                                                               |
| T-pose for Adaptive Animation    | Adaptive Animation toolbar > T-pose mode > Enforce T-pose                                     | none                                                                                                           |
| Avatar Auto Setup                | Avatar tab > Avatar Setup (runs Marketplace validation)                                       | none (scenario-roblox-assets)                                                                                  |
| Show bones and joints            | View > Show Constraint Details (or the Animation Editor's joint view)                         | AnimRig.joints and AnimRig.tree                                                                                |

## Faces

| Task                | Path                                                                    | Scripted substitute |
| ------------------- | ----------------------------------------------------------------------- | ------------------- |
| Face Editor         | Animation Editor track list > Face button (rig with a dynamic head)     | AnimFace.clip (P7)  |
| Face capture        | Animation Editor, camera-based capture (see the Animation capture page) | none                |
| Check a custom head | Avatar Setup > Check Face presets                                       | none                |

## Character controllers and graphs

| Task                                    | Path                                                                                                                          | Scripted substitute                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Enable the Character Controller Library | File > Beta Features > AvatarAbilities Character Controller Library, then Avatar tab > Avatar Settings > Movement > Abilities | none: the beta toggle is GUI-only                                           |
| Animation Graph Editor                  | Avatar tab > Graph Editor                                                                                                     | `AnimationGraphDefinition` instances exist (L14); editing is GUI            |
| Server Authority                        | Workspace > AuthorityMode in the Properties window                                                                            | none: plugin-level Luau cannot read AuthorityMode (RobloxScript capability) |

## Blender (human path)

- Scene properties: Frame Rate 24, Start 0, End = last frame. Every action has a Fake User (F).
- File > Export > FBX: Object Types Armature, Scale 1.00, Apply Scalings All Local, Forward -Z, Up
  Y, Apply Unit, Use Space Transform, Add Leaf Bones off, Bake Animation with Key All Bones, NLA
  Strips off, All Actions off, Force Start/End Keying, Sampling Rate 1, Simplify 0 (Mykaiju,
  NI7GXKLwk6U 00:24:30, 00:25:51).
- The same export runs headless:
  `blender -b --factory-startup --python scripts/blender_roblox_anim.py -- export --blend in.blend --out out.fbx`.
