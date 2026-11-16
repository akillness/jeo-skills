# PMTiles Sources and Provenance

## Upstream Repository
- **Repository:** [https://github.com/protomaps/PMTiles](https://github.com/protomaps/PMTiles)
- **Organization:** Protomaps (Brandon Liu)
- **Specification:** PMTiles Version 3 Specification
- **Upstream Commit:** `aec8fa1341222fdddb3318e9ffa8e18e19b312f7`
- **Documentation:** [https://docs.protomaps.com/pmtiles/](https://docs.protomaps.com/pmtiles/)
- **License:** BSD-3-Clause

## Implementations and Ecosystem
- **Go CLI / Server (`go-pmtiles`):** [https://github.com/protomaps/go-pmtiles](https://github.com/protomaps/go-pmtiles)
- **JavaScript Client (`@protomaps/pmtiles`):** Browser-based PMTiles reader for MapLibre GL JS, Leaflet, and OpenLayers via HTTP Range Requests.
- **Python Library (`pmtiles`):** Python reader and converter tools (`pmtiles-python`).
- **TiTiler PMTiles Extension:** Dynamic tile serving and COG integration.

## Architectural Boundaries
- **Serverless Architecture:** PMTiles files are designed to live directly on cloud object storage (AWS S3, Cloudflare R2, Google Cloud Storage, Azure Blob Storage, or GitHub Pages) without persistent backend servers.
- **Offline Inspection:** `scripts/preflight.py` operates strictly offline with standard library tools, validating local archive 127-byte headers without remote calls or binary execution.
- **Range Request Requirement:** Any static host serving PMTiles must support HTTP `Range` requests and configure appropriate `Access-Control-Allow-Origin` (CORS) headers.
