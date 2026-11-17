# Arnis Sources and Provenance

## Upstream Repository
- **Repository:** [https://github.com/louis-e/arnis](https://github.com/louis-e/arnis)
- **Author:** Louis-E
- **Upstream Commit:** `95594dbb5164d67d9a25a410a74c16f3c99b0d0d`
- **Default Branch:** `main`
- **License:** Apache License 2.0
- **Language & Runtime:** Rust (2021 edition)

## Core Architecture
- **`arnis-core`:** Core procedural generation engine parsing OpenStreetMap XML/PBF data and Digital Elevation Models (DEM) into Minecraft block voxel matrices.
- **`arnis-cli`:** Headless command-line interface for batch processing, automated world creation, and schematic generation.
- **`arnis-gui`:** Interactive desktop application with map coordinate selector and visual block palette preview.

## Data Providers and Standards
- **Vector Geography:** OpenStreetMap (OSM) via Overpass API queries, Geofabrik regional extracts, or local `.osm.pbf` files.
- **Elevation Data:** USGS 3D Elevation Program (3DEP), Copernicus Global DEM (30m), and SRTM terrain height rasters.
- **Minecraft Specifications:** Anvil Region format (`.mca`), `level.dat` world save data, and Sponge/WorldEdit Schematics (`.schem`) supporting 1.18+ extended world heights (-64 to 320).

## Operational Boundaries
- **Offline Preflight:** `scripts/preflight.py` operates strictly offline with standard library tools, verifying binary availability, bounding box validities, and palette JSON integrity without network calls or external process execution.
- **Generation Footprint:** Generating large city districts (>2km x 2km) requires significant RAM and disk space (several gigabytes of voxel data). Generation should be tested with small bounding boxes before full regional builds.
