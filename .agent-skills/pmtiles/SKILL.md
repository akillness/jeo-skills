---
name: pmtiles
description: >
  Use when creating, inspecting, extracting, serving, or troubleshooting PMTiles single-file map tile archives on cloud storage or local disk. Covers PMTiles v3 specification, header inspection (min/max zoom, bounds, clustered directories), converting MBTiles or directories with the pmtiles CLI or go-pmtiles, configuring HTTP Range Requests on S3, R2, GCS, or GitHub Pages, client integration with MapLibre GL JS, Leaflet, OpenLayers, and Python readers. Route format-only skill linting to skill-standardization, raw cloud deployment to deployment-automation, and custom vector graphic shaders to paper-shaders.
allowed-tools: Bash Read Grep Glob
metadata:
  version: 3.0.0
  source: https://github.com/protomaps/PMTiles
  upstream_commit: aec8fa1341222fdddb3318e9ffa8e18e19b312f7
---

# PMTiles

## When to use this skill

Use when designing, generating, validating, or deploying PMTiles single-file map tile archives for serverless web mapping. PMTiles allows entire pyramids of vector (MVT) or raster (PNG, JPEG, WEBP, AVIF) map tiles to be stored in a single archive and served directly from static object storage via HTTP Range Requests without a tile server backend.

### Route-outs
- For validating Agent Skills specification format, frontmatter, or directory structure, use `skill-standardization`.
- For raw infrastructure provisioning of cloud buckets, DNS, or CDN distributions, use `deployment-automation`.
- For WebGL canvas rendering, pixel shaders, or paper texture effects, use `paper-shaders` or `canvas-ui`.
- For general vector tile schema styling rules, use `web-design` or `design-taste-frontend`.

## Instructions

### 1. Offline environment and archive preflight

Before serving or transferring archives, verify the local environment and validate the PMTiles v3 binary header:

```bash
# General tooling inventory check
python3 "$SKILL_DIR/scripts/preflight.py" --json

# Inspect and validate a specific local .pmtiles file offline
python3 "$SKILL_DIR/scripts/preflight.py" --archive "/absolute/path/to/map.pmtiles" --json
```

The preflight tool validates the 127-byte header, confirms the `PMTiles` magic number, checks version 3 compliance, and reports tile types, bounds, and compression modes without network calls or external process execution.

### 2. Converting MBTiles to PMTiles v3

Convert legacy SQLite-based MBTiles into cloud-optimized PMTiles:

```bash
# Standard conversion
pmtiles convert input.mbtiles output.pmtiles

# Optional: specify tile compression (gzip or zstd)
pmtiles convert input.mbtiles output.pmtiles --tile-compression=gzip
```

PMTiles clusters tile entries by Hilbert coordinate ordering and automatically deduplicates identical tile payloads (such as empty ocean or uniform terrain chunks).

### 3. Inspecting header fields and metadata

Examine the archive structure and embedded vector tile layer schemas:

```bash
# Display basic summary (zoom range, bounds, tile counts)
pmtiles show output.pmtiles

# Inspect JSON metadata block (vector_layers, attribution, fields)
pmtiles show output.pmtiles --metadata
```

### 4. Extracting geographic subsets (Bounding Box)

Create targeted regional extracts from global planet archives without re-rendering:

```bash
# Extract Seoul bounding box up to zoom level 14
pmtiles extract planet.pmtiles seoul.pmtiles \
  --bbox=126.76,37.42,127.18,37.70 \
  --maxzoom=14
```

This operation selectively slices the Hilbert directory tree and copies only the intersecting tile entries.

### 5. Configuring static cloud storage

Deploy PMTiles archives to AWS S3, Cloudflare R2, or Google Cloud Storage. Ensure your bucket CORS configuration permits browser Range requests:

- **Allowed Methods:** `GET`, `HEAD`
- **Allowed Headers:** `Range`
- **Exposed Headers:** `Content-Range`, `Content-Length`, `ETag`

### 6. Integrating web map clients

Render PMTiles vector tiles in browser clients using the official protocol handler:

```javascript
import maplibregl from "maplibre-gl";
import * as pmtiles from "pmtiles";

// Register PMTiles custom protocol handler
const protocol = new pmtiles.Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

// Initialize map with PMTiles source
const map = new maplibregl.Map({
  container: "map",
  style: {
    version: 8,
    sources: {
      "city-basemap": {
        type: "vector",
        url: "pmtiles://https://r2.example.com/seoul.pmtiles"
      }
    },
    layers: [
      {
        id: "buildings",
        source: "city-basemap",
        "source-layer": "building",
        type: "fill",
        paint: { "fill-color": "#4285f4", "fill-opacity": 0.7 }
      }
    ]
  }
});
```

## Examples

### Local preview with embedded tile server

```bash
# Launch lightweight local server with CORS support
pmtiles serve ./tiles/ --port 8080

# Access tile endpoint directly
curl -I http://localhost:8080/seoul/14/13958/6354.mvt
```

### Reading tile bytes with Python

```python
from pmtiles.reader import Reader, MmapSource

with open("map.pmtiles", "rb") as f:
    reader = Reader(MmapSource(f))
    header = reader.header()
    print(f"Zoom {header['min_zoom']} - {header['max_zoom']}, Type: {header['tile_type']}")
    tile_data = reader.get(z=10, x=872, y=397)
```

## Best practices

1. **Verify header before deployment:** Always run `scripts/preflight.py --archive <file>` to confirm header integrity and coordinate bounds prior to uploading to S3 or R2.
2. **Expose Content-Range headers:** Web browsers fail silently on HTTP 206 Partial Content responses if `Content-Range` is not explicitly listed in the storage bucket's `ExposeHeaders` CORS policy.
3. **Prefer Cloudflare R2 for public basemaps:** Cloudflare R2 does not charge egress bandwidth fees, making it significantly more cost-effective for high-traffic public map applications than AWS S3.
4. **Use `pmtiles extract` for regional testing:** Instead of building a custom tile pipeline from raw OpenStreetMap data, download an official Protomaps planet build and extract bounding box subsets.

## References

- [PMTiles v3 Specification and Directory Architecture](references/spec-and-directories.md): 127-byte header byte offsets, Hilbert indexing, and directory structure.
- [Serving and Client Integrations](references/serving-and-clients.md): S3/R2 CORS templates, CLI commands, MapLibre GL JS protocol registration, and Python reader API.
- [Sources and Provenance](references/sources.md): Protomaps upstream repository, BSD-3-Clause license, and architectural boundaries.
- [Evaluation Scenarios](evals/evals.json): Five behavioral evaluation prompts covering PMTiles workflows and route-outs.
