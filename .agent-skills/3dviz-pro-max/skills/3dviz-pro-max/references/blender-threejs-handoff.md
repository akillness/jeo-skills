# Blender and Three.js: design the handoff

Use this reference when a scene needs Blender-authored assets delivered through Three.js, or when a material, shape or animation changes during export. A small procedural scene may be simpler to build directly in Three.js. Choose tools around the object and interaction; this is not a mandatory two-tool pipeline.

## Start with the object's hardest decision

Identify the nearest useful camera view, meaningful silhouette, moving attachments and surface behavior. Decide what must remain editable or interactive at runtime. A sculpted creature, parameterized mathematical surface and explodable machine have different needs even if all use glTF.

Keep the editable source and the delivery asset distinct. Agree on stable part identifiers, units, axes, pivots, hierarchy and animation ownership before attaching interaction code. Record actual Blender version, exporter options, Three.js revision and renderer backend when they affect the handoff. Use the project's shared conversion and inspection commands where available; propose missing reusable tooling to the coordinating agent.

## Discover Blender only when it can improve the object

For substantial object creation or improvement, an early Blender availability check is useful when Blender can provide a concrete gain in topology, bevels and normals, UV layout, baking, material authoring or rigging. Keep a small edit or already-effective procedural Three.js asset in its existing stack. Tool availability does not decide the art direction, object language or interaction design.

Resolve a candidate executable in this order, stopping at the first usable result:

1. An executable path explicitly configured for the current project or job.
2. `blender` resolved from `PATH`.
3. On macOS, `/Applications/Blender.app/Contents/MacOS/Blender`, then the equivalent path under `~/Applications`.

Probe the resolved executable directly as `"<resolved executable>" --version` with a short process timeout. Do not open a scene, run Python, start background mode or render during discovery. A missing `blender` entry on `PATH` means only that the PATH candidate is missing; it does not show that Blender is absent from an application directory or explicit configuration. Record one of three outcomes: **available** when the direct version probe exits successfully, **missing** when no candidate exists, or **unusable** when a candidate exists but cannot execute, times out or returns an error. The version probe identifies that executable only; it does not establish `bpy` behavior, enabled add-ons, GPU access, exporter support or a successful asset round trip. Blender documents its command-line arguments in the [official manual](https://docs.blender.org/manual/en/4.0/advanced/command_line/arguments.html), and its [macOS information](https://developer.blender.org/docs/handbook/bug_reports/making_good_bug_reports/macos_information/) documents the application-bundle executable location.

Do not install Blender automatically or keep a discovery process running as a service. Scope any later authorized Blender work to one job and reuse existing shared project commands before proposing a wrapper. Discovery itself has no render budget. If a later preview is authorized, declare bounded texture sizes, sample counts and output resolution for that job, then release the process and temporary resources when it finishes.

## Retrieve by the failing decision

Search the knowledge collection and read the matching record's applicability, limits and related records. These are starting queries, not a checklist every scene must complete.

| Decision | Useful search terms | Useful inspection |
| --- | --- | --- |
| Geometry survives export | evaluated modifier topology bevel normals | Silhouette, openings, edge highlights and export mesh |
| Surface detail survives | UV seam texel density bake padding tangent handedness | Close view, mirrored island and oblique highlight |
| Instances remain efficient and identifiable | Geometry Nodes realize instances glTF instancing | Instance transforms and selectable identity |
| Materials retain their meaning | Principled metallic roughness ORM linear color | Separate color, roughness and normal swatches |
| A shader needs conversion | procedural shader bake runtime reconstruction TSL | Static appearance versus time-dependent behavior |
| Lighting differs across tools | PMREM IBL direct shadows display transform | Same camera and declared comparison conditions |
| Transparent parts disappear | alpha mask blend transmission thickness attenuation | Front, oblique, edge and overlapping surfaces |
| Animation fights controls | skin morph animation mixer transform ownership | Attachment, pause, interruption and reset |
| Physics is part of the interaction | kinematic dynamic handoff compound collider fixed step | Visible contact and matching collider overlay |
| Parts need believable construction | functional assembly receiving flange modular socket cage | Mating surfaces, removal paths and attachments in motion |
| Surface relief needs the right representation | decal height displacement parallax collider boundary | Silhouette, grazing view and separate picking/contact geometry |
| The asset needs a decoder or texture transform | Draco Meshopt KTX2 texture transform atlas UV channel | Required dependencies, fallback and asymmetric UV fixture |
| Baked and live light are counted twice | lightmap ownership emissive receiver local probe | Isolate each illumination contribution under fixed exposure |
| Detail changes with camera or deformation | LOD screen error morph vertex correspondence | Threshold approach/retreat and marked target vertices |
| Animation needs interaction-safe behavior | root motion track mask event marker loop interruption | Pose ownership, interrupted gestures and event direction |
| Dense scenes need usable explanations | spatial label hierarchy small multiples provenance | Hidden-label discovery, comparison scale and source/model status |

Do not compensate for missing topology with noisy textures or for a color-space error by retinting every material. Isolate the changed responsibility first, then return to the intended art direction.

## Make transport choices explicit

For a feature that does not survive the chosen export route, choose a useful outcome: evaluate it into geometry, bake appropriate static data, reconstruct its runtime behavior, select a supported extension, or simplify the feature. Preserve the authored source so a delivery compromise does not become an irreversible modeling decision.

Core glTF provides geometry, hierarchy, materials, skins and bounded animation representations. Arbitrary authoring systems require an explicit conversion strategy; a successful load does not prove semantic equivalence. Consult the [glTF specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html), especially geometry, materials, animations and extensions, for the actual transport contract.

Three.js loader support is version-dependent. Check required extensions and decoder setup against the installed loader; the [GLTFLoader documentation](https://threejs.org/docs/pages/GLTFLoader.html) lists its supported extensions and decoder hooks. Keep unsupported-feature handling visible to the author instead of silently accepting a visually incomplete asset.

Treat color inputs, linear working values and display conversion as separate responsibilities. The [Three.js color-management guide](https://threejs.org/manual/en/color-management.html) distinguishes color textures from normal/roughness data and explains the output conversion. Different tone mapping and lighting configurations need not produce matching pixels.

## Give runtime state one owner

An animation mixer, interaction controller and physics solver should not each overwrite the same transform independently. Assign ownership by part and mode, with explicit transitions. Keep collision representation, render interpolation and scientific state separate where their responsibilities differ. A baked deformation can be useful playback without being an interactive simulation.

Define an action's result before choosing its gesture: preview, commit, cancel, undo and reset are application decisions. A changed mesh transform, snapped gizmo or finished clip alone does not establish that a domain action completed. Preserve the committed state through cancellation and interruption, and expose an appropriate alternative input path when the scene offers interaction.

Choose semantic anchors independently of their visual treatment. In-world signs, labels and cinematic cuts can carry the art direction while an equivalent inspectable interface preserves meaningful text, selection and provenance. The catalog should help explain a rich scene, not force every scene into the same panel layout.

Inspect one representative important asset through the whole route before repeating it across a large scene. Compare construction, surface, motion and interaction at the camera distances that matter. Reuse that diagnostic setup while allowing each object family its own artistic treatment.

There is one worked route in this repository. `scripts/hero-tier.py` drives it end to end: the proof harness writes a kit module's own geometry through `THREE.GLTFExporter`, then `templates/kits/blender/export-hero-tier.py` imports that GLB headless, joins it, smooths and bevels by angle, smart-projects one UV atlas, multiplies family-tuned procedural noise into each base colour and bakes colour, ambient occlusion and roughness with Cycles before re-exporting a GLB whose occlusion and roughness the exporter packs into one ORM texture. Read it as a concrete instance of the decisions above — evaluated geometry, UV/bake correspondence, procedural-shader bake, and one owner for the surface — not as the only shape a handoff can take. It was run on Blender 5.2.1 LTS and written against 4.2 LTS; the calls that moved between them are guarded, and a host without Blender reports the tier as unavailable rather than shipping a claim it cannot make.

Source review and structural checks remain distinct from observed exports and rendered behavior. Report unavailable tools or unrun checks accurately. The references above were read on 2026-09-08; verify the installed versions before applying API-specific advice.
