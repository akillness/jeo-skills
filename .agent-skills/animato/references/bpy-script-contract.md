# Generated-script contract

`POST /api/run` executes model-written Python with `bpy` and the script overwrites the uploaded
model **in place**. Treat every generated script as untrusted input to a local RCE endpoint:
keep a copy of anything you cannot re-upload, and never expose the server publicly.

`scripts/validate_bpy_script.py` is the static gate between "the model answered" and "the server
executes it". It is a cheap contract check, not a sandbox.

## Errors (execution is refused)

| Check | Why |
|---|---|
| `import bpy` present | anything else is not a Blender script |
| model import present (`import_scene.gltf` / `import_scene.fbx` / `wm.obj_import`) | the script must load the exact path from the prompt |
| `keyframe_insert(` present | without keyframes the export is a static model |
| `frame_start` **and** `frame_end` set | otherwise playback length is whatever the scene default was |
| export call present | otherwise the animation is never written back |
| glTF export has `export_animations=True` | glTF silently drops animation without it |
| FBX export has `bake_anim=True` | FBX silently drops animation without it |
| export format matches the uploaded suffix | exporting FBX over a `.glb` target breaks the preview URL |
| target is not `.obj` | `.obj` has no skeleton and cannot carry an animation |
| target path referenced (with `--model-path`) | catches scripts that animate a different or invented file; simple `NAME = "path"` constants are resolved |
| no removed Blender APIs | see the table below |
| no host-side calls | `subprocess`, `os.system`, `os.remove`, `shutil.rmtree`, `socket`, `requests`, `urllib.request`, `eval`, `exec`, `__import__` |

## Warnings (allowed, worth reading)

- `scene.render.fps` never set — playback speed depends on the scene default.
- no `bpy.ops.wm.read_factory_settings(use_empty=True)` — leftover scene state can leak into the export.
- the target path appears in the script but not inside an export call — confirm the overwrite target.
- `bpy.ops.wm.save_mainfile(...)` — Animato only needs the exported model, not a `.blend`.

## Removed APIs the gate rejects

| Call | Removed | Replacement |
|---|---|---|
| `bpy.context.scene.objects.link(` | 2.80 | `bpy.context.collection.objects.link()` |
| `bpy.context.scene.objects.active` | 2.80 | `bpy.context.view_layer.objects.active` |
| `bpy.context.scene.update(` | 2.80 | `bpy.context.view_layer.update()` |
| `bpy.data.lamps` | 2.80 | `bpy.data.lights` |
| `bpy.ops.import_scene.obj(` | 4.0 | `bpy.ops.wm.obj_import()` |
| `bpy.ops.export_scene.obj(` | 4.0 | `bpy.ops.wm.obj_export()` |
| `use_auto_smooth` | 4.1 | Smooth by Angle modifier |

This list mirrors the reason upstream ships a bpy 5.x cheat-sheet inside the prompt: models trained
on old tutorials keep emitting ≤3.x calls. Extend the list when a new stale call shows up twice —
one-off hallucinations belong in the prompt, not in the gate.

## Shape of a compliant script

`references/example-bpy-script.py` is a full example that passes the gate with zero warnings:
reset the scene → import from the exact path → pose-bone keyframes → frame range and fps →
export with the bake flag over the same path. Bone names, axes, and timing must come from the
`/api/prompt` dump for the specific model — never from the example.
