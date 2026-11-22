# Engine facts for Blender exports

Each fact names its source. "Measured" means exported from Blender 5.2.1 with `bx_export.py` and
imported into the engine on 2026-10-18, or on the date given. Vendor pages were read on 2026-10-18
and 2026-10-20: check them again before relying on a number in a new engine version.

## Unity 6

Measured in Unity 6000.3.21f1, batch mode:

- `unity` (static FBX): scale 1, rotation 0, size kept (1.0 x 0.6 x 0.7 m crate, Y up).
- `unity_skeletal`: scale 1 on every node, 3 bones, blend shape `jawOpen` and clip `Rig|Wave` kept.
  Sampled at frame 12, the head joint sits within 4 mm of its Blender position, character facing +Z.
  - The armature node imports with X rotation 270 and its first bone with 90; they cancel.
  - Bake Axis Conversion: the pair becomes 90 and 270 and the character faces -Z.
  - Blender's Apply Transform (`bake_space_transform=True`): no change on the armature.
- `Name_LOD0..2` meshes under one parent: Unity added an LOD Group with 3 levels on import.
- An `unreal` FBX in Unity reads as file scale 0.01, node scale 100.
- Textures embedded in a `unity` FBX: the default import (Use Embedded Materials) shows the model
  untextured. Extract Textures into the model's folder, and the material gets its base color.
  - Two generated chests imported from GLB: 2048 x 2048 base color in Unity after extraction.
  - Before `export()` named packed images with their extension, extraction wrote `Image_0` with no
    extension, Unity never imported it, and the chest stayed untextured with no warning.
- Metallic and roughness (2026-10-20): an FBX whose two images link straight to the Principled
  inputs, imported with Extract Textures, gave a Standard material with the base color texture only,
  Metallic 0.00, Smoothness 0.50. Unity does not assign those maps from an FBX: assign the
  `extra_maps()` file by hand.

Documentation
([FBX Model tab](https://docs.unity3d.com/6000.0/Documentation/Manual/FBXImporter-Model.html),
[Materials tab](https://docs.unity3d.com/6000.3/Documentation/Manual/FBXImporter-Materials.html),
[LOD meshes](https://docs.unity3d.com/6000.0/Documentation/Manual/importing-lod-meshes.html)):

- Convert Units converts the file's scaling to Unity's; Bake Axis Conversion bakes the axis
  conversion into the asset data.
- Import BlendShapes; Blend Shape Normals: Import, Calculate, or None.
- Extract Textures writes the textures embedded in the model file into the project; Search Textures
  Globally (off by default) looks past the model's folder.
- LODs: name meshes `Name_LOD0` (most detailed), `_LOD1`, `_LOD2`. Grouped and named this way, the
  FBX import creates the LOD Group.
- [Metallic mode](https://docs.unity3d.com/6000.0/Documentation/Manual/StandardShaderMaterialParameterMetallic.html)
  (Standard): the Metallic texture holds "Red channel: Metallic values" and "Alpha channel:
  Smoothness values".
  [URP Lit](https://docs.unity3d.com/Packages/com.unity.render-pipelines.universal@17.0/manual/lit-shader.html):
  Smoothness source Metallic Alpha "Uses the alpha channel from the Metallic Map texture".
- [Texture import](https://docs.unity3d.com/6000.0/Documentation/Manual/texture-type-default.html),
  sRGB (Color Texture): "Disable this property if the texture stores information that you need the
  exact value for."

## Unreal Engine 5

Not imported into Unreal by this skill's tests. From Epic's documentation:

- [FBX static mesh pipeline](https://dev.epicgames.com/documentation/en-us/unreal-engine/fbx-static-mesh-pipeline-in-unreal-engine):
  - collision meshes `UBX_` (box), `UCP_` (capsule), `USP_` (sphere), `UCX_` (convex), named
    `UCX_[RenderMeshName]_##`, the render mesh part identical to the mesh's name; more hulls take
    further numbers (`UCX_Tree_01_00`);
  - LODs import with the base mesh or one by one in the Static Mesh Editor, with "Import LODs" on;
    every LOD shares the pivot and occupies the same space.
- [FBX import options](https://dev.epicgames.com/documentation/en-us/unreal-engine/fbx-import-options-reference-in-unreal-engine):
  - Convert Scene Unit converts the FBX units to centimeters;
  - Auto Generate Collision "will not be used if custom collision is detected in the FBX file";
  - One Convex Hull per UCX "forces all UCX meshes to receive one convex hull"; off, the engine may
    decompose a UCX mesh into several.
- No page read states a vertex limit for a convex hull.
  [Collision setup](https://dev.epicgames.com/documentation/en-us/unreal-engine/setting-up-collisions-with-static-meshes-in-unreal-engine)
  calls higher Max Hull Verts "more precise" and "more complex". `collision()` caps hulls at 64
  vertices by its own choice. Measured in Blender 5.2.1 (2026-10-26): a generated 17,500-triangle
  side table hulled to 12,270 faces with open edges at near-duplicate points; capped at 64 vertices,
  124 closed faces within 3 mm of its bounds.
- Metallic and roughness maps are masks: the 4.27
  [mobile textures](https://dev.epicgames.com/documentation/en-us/unreal-engine/textures-for-mobile-platforms?application_version=4.27)
  page says sRGB "should be enabled on all Texture maps except for Normal Maps and Masks". Uncheck
  sRGB on the `extra_maps()` files.
- [FBX import errors](https://dev.epicgames.com/documentation/en-us/unreal-engine/fbx-import-errors-in-unreal-engine):
  "Found multiple roots. The importer only supports one root per mesh."
- [FBX skeletal mesh pipeline](https://dev.epicgames.com/documentation/en-us/unreal-engine/fbx-skeletal-mesh-pipeline-in-unreal-engine):
  the pivot is at the root bone.
- [glTF support](https://dev.epicgames.com/documentation/en-us/unreal-engine/gltf-file-format-support-in-unreal-engine):
  Unreal 5 imports glTF and GLB.

## Godot 4

Measured in Godot 4.7.2, headless import:

- `godot` (GLB): root and every node at scale 1, rotation 0; Skeleton3D with 3 bones, 1 blend shape,
  AnimationPlayer with `Wave`; the 2 m character is 2 m on Y.
- `web` (GLB with `EXT_meshopt_compression` required) fails: "glTF: Buffer 1 has no data and cannot
  be loaded". Godot does not decode the compressed buffer: use `godot`.
- Collision objects from `collision()`, one GLB:
  - the `box` shape, `-convcolonly`: StaticBody3D with a ConvexPolygonShape3D of 8 points, a box;
  - an L-shaped mesh, `-convcolonly`: one ConvexPolygonShape3D of 10 points, its hull, not a
    decomposition;
  - `-colonly`: StaticBody3D with a ConcavePolygonShape3D (trimesh);
  - a Cube empty named `-colonly` arrives as a plain Node3D through GLB: no BoxShape3D.

Documentation:

- [Available formats](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/importing_3d_scenes/available_formats.html):
  "glTF 2.0 (recommended)"; FBX goes through ufbx.
- [Model export considerations](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/importing_3d_scenes/model_export_considerations.html):
  Y-up, right-handed, -Z forward; in Blender the asset's front faces -Y; apply modifiers and object
  transforms before export.
- [Node type customization](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/importing_3d_scenes/node_type_customization.html):
  name suffixes after `-`, `$` or `_`, case-insensitive:

| Suffix               | Import result                                          |
| -------------------- | ------------------------------------------------------ |
| `-noimp`             | node or animation removed                              |
| `-col`, `-convcol`   | mesh kept, static collision child (trimesh or convex)  |
| `-colonly`           | mesh removed, StaticBody3D with the trimesh shape      |
| `-convcolonly`       | mesh removed, StaticBody3D with one convex shape       |
| `-occ`, `-occonly`   | Occluder3D, mesh kept or removed                       |
| `-navmesh`           | navigation mesh, original removed                      |
| `-rigid`             | RigidBody3D                                            |
| `-vehicle`, `-wheel` | VehicleBody3D and VehicleWheel3D children              |
| `-loop`, `-cycle`    | animation clip loops                                   |
| `-alpha`, `-vcol`    | material with alpha, material with vertex color albedo |

- [Import configuration](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/importing_3d_scenes/import_configuration.html):
  Generate LODs, in the Meshes section, builds lower-detail variants for distance.

### Headless check

Measured on Godot 4.7.2 with a generated chest after `ground(width=0.9)`: rotation 0, scale 1, size
0.9 x 0.84 x 0.76, floor 0.000, all four maps present. A folder holding the GLB, this `check.gd` and
a `project.godot` containing `config_version=5`:

```bash
godot --headless --path /abs/proj --import # imports the GLB, then quits
godot --headless --path /abs/proj -s check.gd
```

```gdscript
extends SceneTree

# Loads every .glb at the project root; prints each node's rotation and scale, each mesh's
# world size and floor height, and the textures its materials received.
func _init() -> void:
	for f in DirAccess.get_files_at("res://"):
		if f.ends_with(".glb"):
			print("== ", f)
			var root: Node = load("res://" + f).instantiate()
			_walk(root, Transform3D.IDENTITY)
			root.free()
	quit()

func _walk(n: Node, xf: Transform3D) -> void:
	if n is Node3D:
		xf = xf * n.transform
		print("%s rot=%s scale=%s" % [n.name, n.rotation_degrees, n.scale])
	if n is MeshInstance3D:
		var box: AABB = xf * n.get_aabb()
		print("  size=%s floor=%.3f" % [box.size, box.position.y])
		for s in n.mesh.get_surface_count():
			var m := n.mesh.surface_get_material(s) as BaseMaterial3D
			if m:
				print("  albedo=%s normal=%s metallic=%s roughness=%s cull=%d" % [m.albedo_texture != null,
					m.normal_texture != null, m.metallic_texture != null, m.roughness_texture != null, m.cull_mode])
	for c in n.get_children():
		_walk(c, xf)
```

`cull=2` is `CULL_DISABLED`: the material is double-sided, as generated GLBs often are.

## Roblox

Not imported into Roblox Studio by this skill's tests. From the Creator Hub:

- [Mesh specifications](https://create.roblox.com/docs/art/modeling/specifications):
  - a single mesh cannot exceed 20,000 triangles;
  - watertight geometry, no exposed holes or backfaces, no zero thickness; quads preferred, no
    n-gons;
  - skinning: at most 4 influences per vertex; bones frozen (scale 1, rotation 0); root at 0,0,0
    with no influences; one animation track per mesh.
- [Export requirements](https://create.roblox.com/docs/art/modeling/export-requirements), Blender
  FBX: Path Mode Copy with Embed Textures, Apply Scalings "FBX Unit Scale", Add Leaf Bones off, Bake
  Animation off unless the file carries animation.
- [Texture specifications](https://create.roblox.com/docs/art/modeling/texture-specifications):
  albedo, normal, roughness, metalness and emissive mask; OpenGL tangent-space normal maps only;
  metalness and roughness "Single Channel Grayscale (8-bit)". PBR textures go on a SurfaceAppearance
  added to the mesh in Studio.
- [SurfaceAppearance](https://create.roblox.com/docs/reference/engine/classes/SurfaceAppearance):
  ColorMap, MetalnessMap, NormalMap, RoughnessMap. The pages read here do not say whether the 3D
  Importer takes metalness and roughness from an FBX: set them on the SurfaceAppearance.
- [R15 characters](https://create.roblox.com/docs/art/characters/specifications): 15 meshes named
  with `_Geo` (Head_Geo, UpperTorso_Geo, LeftUpperArm_Geo, and so on); triangle budgets DynamicHead
  4,000, torso 1,750, each arm and each leg 1,248, total 10,742.

## three.js and the web

[GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html):

- `EXT_meshopt_compression` and `KHR_meshopt_compression` need `setMeshoptDecoder()`.
- `KHR_draco_mesh_compression` needs `setDRACOLoader()`; `KHR_texture_basisu` needs
  `setKTX2Loader()`.
- `EXT_texture_webp`, `EXT_texture_avif`, `KHR_mesh_quantization` and `KHR_texture_transform` load
  with no extra decoder.

Measured: the `web` preset wrote the test character at 12 KB against 21 KB for `godot`, with
`EXT_meshopt_compression` required.

## Apple AR Quick Look

No Apple documentation page states USDZ limits. Apple's WWDC sessions and staff forum answers give
guidance only: about 100,000 polygons, one set of 2048 x 2048 textures, files under 25 MB, and the
"too large to open" error follows memory use, not file size. The `usdz` preset caps textures at 2048
through Blender's USDZ Texture Downsampling.

## Blender 5.2 exporters

- [Export operators](https://docs.blender.org/api/current/bpy.ops.export_scene.html):
  `apply_scale_options` is `FBX_SCALE_NONE` (All Local), `FBX_SCALE_UNITS` (FBX Units Scale),
  `FBX_SCALE_CUSTOM` or `FBX_SCALE_ALL`; `bake_space_transform` is "experimental option, use at own
  risk, known to be broken with armatures/animations"; `add_leaf_bones` appends a final bone to each
  chain; glTF `export_yup` defaults to True.
- [USD](https://docs.blender.org/manual/en/latest/files/import_export/usd.html): a `.usdz` extension
  writes a USDZ package; UDIM textures cannot go in one.
- Measured in 5.2.1: the STL importer names its object after the file, so `round_trip` matches a
  lone mesh to the file's only mesh, whatever its name.
- Measured in 5.2.1 (2026-10-20), FBX and material maps: base color, normal (through a Normal Map
  node) and emission travel. Metallic and roughness travel only when an image links straight to the
  input. The glTF importer's layout, one image through Separate Color (green to roughness, blue to
  metallic), loses both: a generated chest re-imported with Metallic 0 and Roughness 0.5. The
  `godot` and `gltf` GLBs keep all five.
