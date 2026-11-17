# Arnis Block Palettes and Minecraft Save Formats Reference

## 1. Block Palette Customization

Arnis allows full control over voxel styling via custom JSON palette files:

```json
{
  "name": "modern_urban",
  "version": 1,
  "materials": {
    "default_wall": "minecraft:smooth_stone",
    "brick_wall": "minecraft:bricks",
    "concrete_wall": "minecraft:light_gray_concrete",
    "glass_window": "minecraft:glass_pane",
    "residential_roof": "minecraft:dark_oak_stairs",
    "commercial_roof": "minecraft:gray_concrete",
    "primary_road": "minecraft:gray_concrete",
    "secondary_road": "minecraft:polished_andesite",
    "sidewalk": "minecraft:smooth_stone",
    "pedestrian_walkway": "minecraft:stone_bricks",
    "rail_track": "minecraft:rail",
    "water": "minecraft:water",
    "grass": "minecraft:grass_block",
    "tree_trunk": "minecraft:oak_log",
    "tree_foliage": "minecraft:oak_leaves"
  },
  "rules": [
    {
      "match": { "building:material": "brick" },
      "block": "minecraft:bricks"
    },
    {
      "match": { "building:material": "glass" },
      "block": "minecraft:tinted_glass"
    }
  ]
}
```

---

## 2. Minecraft Save Formats

Arnis can output both full independent worlds and modular schematics:

### Full World Save (`Anvil .mca` + `level.dat`)
- **Structure:**
  ```
  MyGeneratedWorld/
  ├── level.dat          # NBT root with spawn point and world settings
  └── region/            # Chunk data containers
      ├── r.0.0.mca      # 32x32 chunks (512x512 blocks)
      └── r.0.1.mca
  ```
- **Height Coordinates:** Modern Minecraft (1.18+) supports vertical ranges from $Y=-64$ to $Y=319$ (384 blocks). Arnis builds bedrock at $Y=-64$ and places typical terrain surface at $Y \approx 62$ unless offset.

### WorldEdit / Sponge Schematic (`.schem`)
- **Use Case:** Importing generated city blocks directly into an existing Minecraft server without overwriting surrounding player builds.
- **In-Game Usage:**
  ```
  //schem load my_city
  //paste -a
  ```
- **Compatibility:** Fully compliant with WorldEdit, FastAsyncWorldEdit (FAWE), and Axiom.

---

## 3. CLI Command Matrix

```bash
# Generate full world save from bounding box
arnis generate \
  --bbox 126.97,37.56,127.00,37.58 \
  --output ./MyWorld \
  --palette ./palette.json \
  --elevation srtm

# Export directly as WorldEdit schematic
arnis export-schematic \
  --bbox 126.97,37.56,127.00,37.58 \
  --output ./city_center.schem \
  --palette ./palette.json

# Preview estimated chunk counts and data boundaries offline
arnis inspect-bounds --bbox 126.97,37.56,127.00,37.58
```
