# Arnis OpenStreetMap and Elevation Processing Reference

## 1. OpenStreetMap (OSM) Vector Feature Mapping

Arnis ingests OpenStreetMap vector geometries (points, ways, relations) and converts them into voxel coordinates:

```
[OSM Raw Tags] ---> Parser / Filter ---> 3D Geometry Extrusion ---> Voxel Grid Mapping
  building=yes           roof:shape=gabled          height: 15m            minecraft:bricks
```

### Building Extraction and Height Extrusion
- **Level Detection:** When `building:levels` is specified, building height defaults to $\text{levels} \times 3.5\text{m}$.
- **Direct Height:** The `height` tag (e.g. `12.5m` or `40ft`) takes precedence over level estimates.
- **Roof Geometry Synthesis:**
  - `flat`: Uniform horizontal slab ceiling.
  - `gabled`: Two-sloped roof meeting along a central ridge line.
  - `hipped`: Four-sloped roof sloping downwards to the walls.
  - `pyramidal`: Slopes converging to a single central vertex.
  - `dome`: Stepped hemispherical voxel shell.

### Transportation and Infrastructure Layers
- **Highways & Roads:**
  - `motorway`, `trunk`, `primary`: Multi-lane gray concrete or polished blackstone surfaces with white/yellow carpet lane markings.
  - `secondary`, `residential`: Gray concrete or cobblestone roadway with smooth stone sidewalks.
  - `footway`, `pedestrian`: Stone brick or cobblestone pathways.
- **Railways:** `railway=rail` generates stone ballast beds, oak slab ties, and iron rails.
- **Water Bodies:** `natural=water` and `waterway=river` carve water basins lined with sand, clay, or gravel, filled with source water blocks.

---

## 2. Digital Elevation Models (DEM) and Terrain Normalization

Real-world elevation datasets provide raster grid height values that must be scaled and mapped into Minecraft's vertical coordinate limits:

```
World Elevation (meters)                    Minecraft Y Axis (Blocks)
  +8848m (Mount Everest)   --- Scaled --->    Y=319 (Max Build Height)
   +50m  (City Ground)     --- Scaled --->    Y=63  (Base Surface)
     0m  (Sea Level)       --- Mapped --->    Y=62  (Sea Level)
   -10m  (Seabed)          --- Mapped --->    Y=52  (Ocean Floor)
                           --- Clamped --->   Y=-64 (Bedrock Floor)
```

- **Vertical Scaling Modes:**
  - `1:1 Real Scale`: 1 meter of real-world height equals 1 Minecraft block (optimal for moderate terrain, small hills, and urban cityscapes).
  - `Compressed Scale`: Non-linear or proportional vertical compression when regional relief exceeds the 384-block build envelope (-64 to 320).
- **Interpolation:** Bilinear or Bicubic resampling smooths discrete 30m DEM grid points into continuous voxel hillsides, preventing jarring jagged steps.

---

## 3. Coordinate Projection and Bounding Boxes

To minimize distortion and preserve right angles on buildings, Arnis projects WGS84 geographic coordinates `(latitude, longitude)` into a local conformal metric space:

- **Bounding Box Definition:** `--bbox <min_lon>,<min_lat>,<max_lon>,<max_lat>`
- **Center Origin:** The center of the bounding box is typically mapped to Minecraft world spawn `(X=0, Z=0)`.
- **Orientation:** North aligns with negative Z (`-Z`), South with positive Z (`+Z`), East with positive X (`+X`), and West with negative X (`-X`).
