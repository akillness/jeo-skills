# Inventory and materials manifest

Both files are read and written by the Blender scripts next to this reference. Paths inside
`materials.json` are relative to that JSON file.

## inventory.json

Written by `inventory.py` next to `Before.blend`. Read it instead of dumping the scene.

| Key                        | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `source`, `before`         | The file that was imported or opened, and the packed `Before.blend` written next to the inventory                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `meshes`, `polygons`       | Mesh object count and total polygon count                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `dimensions`               | World bounding box size in scene units, `[x, y, z]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `geometry_sha256`          | Hash of every vertex, polygon, and object transform; `apply_materials.py` asserts it is unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `objects_without_material` | Object names with an empty slot; give them a material in Blender before applying, the script refuses them                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `materials.<name>`         | `objects` (slot count), `examples` (up to 3 object names), `bounds.lo` and `bounds.hi` (world space, composed from object parenting so hidden or excluded meshes are placed correctly; bone or vertex parents, constraints, and drivers are not applied; shot targets in film-config.md start from these), `base_color` (RGBA, `null` when unknown) with `base_color_source` (`principled` for an unlinked Principled Base Color, `linked:<NODE_TYPE>` when another node drives the socket so the palette is unknown, `viewport` for an author-set viewport color, `library` for a linked material, or `none`), `has_image_textures` |
| `linked_materials`         | `[{name, library}]`, library-linked materials the scripts do not inspect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `non_mesh_renderables`     | `[{name, type, materials}]`, objects that render but are not meshes (text, curves, metaballs, surfaces); `apply_materials.py` keeps their materials, so convert them to mesh before the inventory when they need PATINA                                                                                                                                                                                                                                                                                                                                                                                                              |
| `packed`, `pack_error`     | Whether every external file was packed into `Before.blend`, and Blender's message when one was missing: that texture renders as a placeholder in the original pass and sits outside the run fingerprint                                                                                                                                                                                                                                                                                                                                                                                                                              |

## materials.json

```json
{
  "output": "PATINA.blend",
  "provenance": {
    "model_id": "model_...",
    "team_id": "...",
    "project_id": "...",
    "jobs": { "plaster": { "job_id": "job_...", "seed": 3201, "cu": 17 } }
  },
  "materials": {
    "Wall_Cream": "plaster",
    "Wall_Ochre": "plaster",
    "Beam": "cedar",
    "Trim_Green": "steel"
  },
  "object_overrides": [{ "prefixes": ["Awning"], "family": "canvas" }],
  "families": {
    "plaster": {
      "maps": {
        "basecolor": "textures/plaster/basecolor.png",
        "normal": "textures/plaster/normal.png",
        "roughness": "textures/plaster/roughness.png",
        "metalness": "textures/plaster/metalness.png",
        "height": "textures/plaster/height.png"
      },
      "tile_span": 1.2,
      "normal_strength": 0.3,
      "bump_distance": 0.002,
      "roughness": [0.55, 0.95],
      "metalness": [0, 0],
      "roughness_is_smoothness": false,
      "basecolor_mode": "tint"
    }
  }
}
```

| Key                       | Default                | Effect                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `output`                  | required               | Output `.blend`; an existing file is refused, never overwritten                                                                                                                                                                                                                                                                                                               |
| `provenance`              | none                   | A JSON object with free-form contents (a string or list fails validation); stored as the `patina_provenance` custom property (a JSON string) on every generated material, beside `patina_family` and `original_material`                                                                                                                                                      |
| `materials`               | required               | Every material in the scene maps to a family, unless an override covers all of its objects                                                                                                                                                                                                                                                                                    |
| `object_overrides`        | `[]`                   | Object-name prefixes that send every material slot on a matching object to the named family, over the material mapping; the first listed match wins when prefixes overlap. The way to split one shared color across two surfaces, so check each overridden object's other materials in `inventory.json` `examples`: a brass rod slot on an `Awning` object becomes canvas too |
| `families.<f>.maps`       | required               | All five roles as paths under the manifest; each existing file is opened with Pillow when available and an unreadable one is refused; one file may serve several families but not both as a basecolor and as a data map (copy it), and one datablock is packed per file                                                                                                       |
| `tile_span`               | required               | Meters per texture repeat on the `PatinaUV` layer: 0.3 for a hand-sized detail, 1 to 2 for walls and paving                                                                                                                                                                                                                                                                   |
| `normal_strength`         | `0.25`                 | Normal map node strength                                                                                                                                                                                                                                                                                                                                                      |
| `bump_distance`           | `0.002`                | Height feeds a Bump node at this distance; there is no displacement, so geometry never moves                                                                                                                                                                                                                                                                                  |
| `roughness`, `metalness`  | `[0.3, 0.7]`, `[0, 0]` | The map's 0 to 1 range is remapped into these bounds; `[0.8, 1]` metalness for brass, `[0, 0]` for dielectrics, a narrow roughness range for a uniform finish                                                                                                                                                                                                                 |
| `roughness_is_smoothness` | `false`                | Inverts the roughness map first; settle it by looking at a known family, see the skill body                                                                                                                                                                                                                                                                                   |
| `basecolor_mode`          | `"tint"`               | `tint` multiplies the original palette color by the map's luminance variation, keeping the asset's colors; `replace` uses the PATINA basecolor as is                                                                                                                                                                                                                          |

Family names `ceramic`, `enamel`, and `plastic` add a coat layer, `glass` adds coat plus a little
transmission at IOR 1.46, and `leaf` adds subsurface. Other names get the plain PBR stack.

Validation runs before the scene is touched and lists every problem at once: a manifest that is not
a JSON object, an unmapped material, a non-string family name, an undefined family, a missing or
unreadable map file, a family missing a role, a range outside 0 to 1, a negative or non-numeric
`normal_strength` or `bump_distance`, an override without a non-empty list of non-empty string
`prefixes` and a string `family`, and a file used both as a basecolor and as a data map. Both
scripts exit 1 with a one-line `inventory failed:` or `apply_materials failed:` message after the
traceback on any failure, with or without Blender's `--python-exit-code 1`.

## Checks before the film

- Self-tile the basecolor of each family as a 2x2 sheet. A visible border means the generation
  carried tile edges: check that `tileSize` matched the resolution (128 for 1024, 256 for 2048),
  then regenerate that family with another seed, or crop the interior and re-tile locally before
  wiring it. The script does not detect borders.
- Open the output `.blend` once. The planar projection suits architecture; a curved prop, a UV seam,
  or wood grain running the wrong way is fixed by keeping that object's authored UVs or rotating its
  projection in Blender.
- The report sits next to the output with `.blend` replaced by `.materials.json` (`PATINA.blend`
  gives `PATINA.materials.json`; the script's printed result names it under `report`) and lists the
  geometry hash before and after, the material variants created, the packed image count (unique map
  files, so it can be below families times five), and `non_mesh_renderables`; the material count is
  original materials times families they map to, so 41 materials over 14 families produced 43
  variants in one project.
