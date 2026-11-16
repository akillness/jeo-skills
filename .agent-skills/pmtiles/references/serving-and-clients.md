# PMTiles Serving and Client Integrations Reference

## 1. Cloud Object Storage and CORS Configuration

Because PMTiles relies exclusively on HTTP Range requests, it can be hosted on any static storage without application servers.

### AWS S3 CORS Configuration
```json
[
  {
    "AllowedHeaders": ["Range"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["Content-Range", "Content-Length", "ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

### Cloudflare R2 / GCS Notes
- **Cloudflare R2:** Zero egress fees make R2 the optimal public hosting choice for global PMTiles basemaps. Ensure public bucket CORS rules expose `Content-Range` and accept `Range`.
- **GitHub Pages:** Supports standard Range requests for archives up to 100MB (recommended for local or regional demo sets).

---

## 2. CLI Tooling (`go-pmtiles` / `pmtiles`)

The official Go-based `pmtiles` binary provides the primary operational toolkit:

### Inspection
```bash
# Print header fields, zoom levels, bounding box, and tile types
pmtiles show map.pmtiles

# Dump embedded JSON metadata block (attribution, vector layers, style rules)
pmtiles show map.pmtiles --metadata
```

### Conversion from MBTiles
```bash
# Convert existing SQLite MBTiles archive to PMTiles v3
pmtiles convert planet.mbtiles planet.pmtiles

# Specify custom tile compression (e.g., gzip or zstd)
pmtiles convert input.mbtiles output.pmtiles --tile-compression=gzip
```

### Extracting Spatial Subsets (Bounding Box)
```bash
# Extract a regional extract from a global planet file
pmtiles extract https://r2.example.com/planet.pmtiles seoul.pmtiles \
  --bbox=126.76,37.42,127.18,37.70 \
  --maxzoom=14
```

### Local Development Server
```bash
# Serve local PMTiles files with automatic CORS and TileJSON endpoint
pmtiles serve ./tiles/ --port 8080
# Tiles available at http://localhost:8080/{name}/{z}/{x}/{y}.mvt
```

---

## 3. Client Integrations

### MapLibre GL JS
```javascript
import maplibregl from "maplibre-gl";
import * as pmtiles from "pmtiles";

// 1. Register custom PMTiles protocol handler
const protocol = new pmtiles.Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

// 2. Reference PMTiles URL directly in map style sources
const map = new maplibregl.Map({
  container: "map",
  style: {
    version: 8,
    sources: {
      "protomaps": {
        type: "vector",
        url: "pmtiles://https://r2.example.com/planet.pmtiles"
      }
    },
    layers: [
      {
        id: "landuse",
        source: "protomaps",
        "source-layer": "landuse",
        type: "fill",
        paint: { "fill-color": "#e0e0e0" }
      }
    ]
  }
});
```

### Python Reader API (`pmtiles-python`)
```python
from pmtiles.reader import Reader, MmapSource

# Open local archive with memory mapping
with open("seoul.pmtiles", "rb") as f:
    source = MmapSource(f)
    reader = Reader(source)

    header = reader.header()
    print("Tile type:", header["tile_type"])
    print("Zoom range:", header["min_zoom"], "to", header["max_zoom"])

    # Fetch a specific tile (z, x, y)
    tile_bytes = reader.get(z=14, x=13958, y=6354)
```
