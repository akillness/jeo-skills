---
name: arnis
description: >
  Use when generating, converting, inspecting, or troubleshooting Minecraft worlds and schematics from real-world OpenStreetMap (OSM) and elevation data with Arnis. Covers bounding-box queries, digital elevation models (DEM), 3D building and roof geometry reconstruction, road, railway, and water feature voxelization, custom block palette mappings, and exporting to Anvil region files (.mca) or WorldEdit schematics (.schem). Route format-only skill linting to skill-standardization, map tile rendering to pmtiles, and general Godot voxel terrain to godot-voxel-tools.
allowed-tools: Bash Read Grep Glob
metadata:
  version: 1.0.0
  source: https://github.com/louis-e/arnis
  upstream_commit: 95594dbb5164d67d9a25a410a74c16f3c99b0d0d
---

# Arnis

## When to use this skill

Use when procedurally generating real-world cities, landscapes, or architectural landmarks inside Minecraft from OpenStreetMap (OSM) vector data and Digital Elevation Models (DEM). Arnis builds 3D voxel environments at 1:1 scale, reconstructing building heights, roof slopes, road networks, railways, and water bodies into native Minecraft world saves (`.mca`) or WorldEdit schematics (`.schem`).

### Route-outs
- For validating Agent Skills specification format, frontmatter, or directory structure, use `skill-standardization`.
- For cloud-native map tile archiving and vector tile hosting, use `pmtiles`.
- For general voxel engine terrain systems in Godot, use `godot-voxel-tools`.
- For game engine physics or collision geometry, use `jolt-physics`.

## Instructions

### 1. Offline environment and bounding box preflight

Before initiating large-scale data queries, run the offline preflight tool to verify CLI availability, validate coordinate bounds, and calculate estimated Minecraft block and chunk counts:

```bash
# Check CLI tooling availability
python3 "$SKILL_DIR/scripts/preflight.py" --json

# Validate bounding box coordinates and inspect voxel footprint
python3 "$SKILL_DIR/scripts/preflight.py" --bbox "126.97,37.56,127.00,37.58" --json

# Validate a custom palette configuration file
python3 "$SKILL_DIR/scripts/preflight.py" --palette "/absolute/path/to/palette.json" --json
```

The preflight tool calculates width, height, and chunk counts based on local geometry, checking for coordinate format errors and invalid block namespaces without making network requests.

### 2. Configure geographic bounding box

Define the target geographical area as comma-separated WGS84 coordinates:
$$\text{bbox} = \text{min\_lon}, \text{min\_lat}, \text{max\_lon}, \text{max\_lat}$$

Keep initial test runs bounded to approximately 500m × 500m to verify terrain height offsets and building palette mappings before scaling to entire metropolitan districts.

### 3. Customize block palette mappings

Create a custom JSON palette file to control material appearance:

```json
{
  "name": "urban_palette",
  "materials": {
    "default_wall": "minecraft:smooth_stone",
    "brick_wall": "minecraft:bricks",
    "concrete_wall": "minecraft:light_gray_concrete",
    "glass_window": "minecraft:glass_pane",
    "roof": "minecraft:dark_oak_stairs",
    "road": "minecraft:gray_concrete",
    "sidewalk": "minecraft:smooth_stone",
    "water": "minecraft:water"
  }
}
```

Ensure all block identifiers use full Minecraft namespaces (e.g. `minecraft:bricks`).

### 4. Generate full Minecraft world save

Run the Arnis generator to produce an Anvil region world:

```bash
arnis generate \
  --bbox 126.97,37.56,127.00,37.58 \
  --output ./SeoulWorld \
  --palette ./palette.json \
  --elevation srtm
```

The output directory contains `level.dat` and `region/r.*.*.mca` files ready to be copied into the user's Minecraft `saves/` folder.

### 5. Export as WorldEdit schematic

To import generated structures into an existing multiplayer server or creative world without overwriting natural terrain:

```bash
arnis export-schematic \
  --bbox 126.97,37.56,127.00,37.58 \
  --output ./landmark.schem \
  --palette ./palette.json
```

Load and paste the schematic in-game using WorldEdit:
```
//schem load landmark
//paste -a
```

## Examples

### Complete generation script with validation

```bash
# 1. Preflight check coordinate boundaries
python3 "$SKILL_DIR/scripts/preflight.py" --bbox "126.97,37.56,127.00,37.58"

# 2. Generate world save with elevation
arnis generate \
  --bbox 126.97,37.56,127.00,37.58 \
  --output ./MyCity \
  --elevation copernicus

# 3. Inspect generated world save
python3 "$SKILL_DIR/scripts/preflight.py" --world-dir ./MyCity
```

## Best practices

1. **Verify coordinate order:** Always format bounding boxes as `min_lon,min_lat,max_lon,max_lat` (longitude first, latitude second).
2. **Start with small bounding boxes:** Large urban areas contain hundreds of thousands of OSM building relations; test 1–2 square kilometer slices first.
3. **Use schematics for server builds:** Export `.schem` files to preserve surrounding custom builds and natural server biomes.
4. **Calibrate elevation baseline:** Review regional DEM relief to prevent mountain peaks from exceeding Minecraft's upper build limit ($Y=320$).

## References

- [OpenStreetMap and Elevation Processing](references/osm-and-elevation.md): OSM vector tag extraction, DEM scaling equations, and coordinate projections.
- [Block Palettes and Save Formats](references/palettes-and-schematics.md): Custom JSON palette schema, Anvil `.mca` structure, and WorldEdit `.schem` integration.
- [Sources and Provenance](references/sources.md): Upstream repository, Apache-2.0 license, and operational boundaries.
- [Evaluation Scenarios](evals/evals.json): Five behavioral evaluation prompts covering generation, palettes, DEM, and schematics.
