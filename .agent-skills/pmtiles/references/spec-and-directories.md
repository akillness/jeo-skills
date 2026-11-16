# PMTiles v3 Specification and Directory Architecture

## 1. PMTiles v3 Header Layout (Fixed 127 Bytes)

Every PMTiles v3 archive begins with a fixed 127-byte little-endian header:

| Offset (Bytes) | Length (Bytes) | Type | Field Name | Description |
|---|---|---|---|---|
| 0 | 7 | ASCII | `magic` | Exact string `"PMTiles"` (`0x50 0x4D 0x54 0x69 0x6C 0x65 0x73`) |
| 7 | 1 | uint8 | `version` | Specification version (must be `3`) |
| 8 | 8 | uint64 | `root_dir_offset` | Byte offset of root directory |
| 16 | 8 | uint64 | `root_dir_length` | Byte length of compressed root directory |
| 24 | 8 | uint64 | `json_metadata_offset` | Byte offset of JSON metadata block |
| 32 | 8 | uint64 | `json_metadata_length` | Byte length of compressed JSON metadata |
| 40 | 8 | uint64 | `leaf_dirs_offset` | Byte offset of leaf directories section |
| 48 | 8 | uint64 | `leaf_dirs_length` | Byte length of compressed leaf directories |
| 56 | 8 | uint64 | `tile_data_offset` | Byte offset where raw tile payloads begin |
| 64 | 8 | uint64 | `tile_data_length` | Total length of all tile data |
| 72 | 8 | uint64 | `addressed_tiles_count`| Total tile count including run-length expansions |
| 80 | 8 | uint64 | `tile_entries_count` | Number of distinct directory entries |
| 88 | 8 | uint64 | `tile_contents_count` | Number of distinct tile data blobs (deduplicated) |
| 96 | 1 | uint8 | `clustered` | `1` if entries are ordered by Hilbert tile ID |
| 97 | 1 | uint8 | `internal_compression`| `1`=None, `2`=Gzip, `3`=Brotli, `4`=Zstandard |
| 98 | 1 | uint8 | `tile_compression` | `1`=None, `2`=Gzip, `3`=Brotli, `4`=Zstandard |
| 99 | 1 | uint8 | `tile_type` | `1`=MVT (vector), `2`=PNG, `3`=JPEG, `4`=WEBP, `5`=AVIF |
| 100 | 1 | uint8 | `min_zoom` | Minimum pyramid zoom level (0–32) |
| 101 | 1 | uint8 | `max_zoom` | Maximum pyramid zoom level (0–32) |
| 102 | 4 | int32 | `min_lon` | Minimum longitude * 10,000,000 |
| 106 | 4 | int32 | `min_lat` | Minimum latitude * 10,000,000 |
| 110 | 4 | int32 | `max_lon` | Maximum longitude * 10,000,000 |
| 114 | 4 | int32 | `max_lat` | Maximum latitude * 10,000,000 |
| 118 | 1 | uint8 | `center_zoom` | Default viewing zoom |
| 119 | 4 | int32 | `center_lon` | Default center longitude * 10,000,000 |
| 123 | 4 | int32 | `center_lat` | Default center latitude * 10,000,000 |

---

## 2. Hilbert Tile Indexing

Standard web map tiles are addressed by coordinate tuples `(z, x, y)`. PMTiles maps every pyramid tile to a single 64-bit integer using a 2D Hilbert space-filling curve:

- **Locality Preservation:** Adjacent spatial tiles map to nearby 1D indices, maximizing disk read locality and compression efficiency.
- **Run-Length Encoding (RLE):** Identical consecutive tiles (such as empty ocean water tiles or desert tiles) share the same tile data offset with a `run_length > 1`.
- **Deduplication:** Multiple entries can point to identical `offset` and `length` within the tile data section, drastically shrinking file size for vector base maps.

---

## 3. Directory Layout and Range Request Budget

PMTiles is engineered so that clients require at most **two HTTP Range requests** to fetch any single tile in the world:

1. **Initial Header + Root Directory Fetch:**
   - The client issues a single range request for the first 16,384 bytes (`Range: bytes=0-16383`).
   - This single response delivers the 127-byte header and the entire compressed root directory.
2. **Direct Tile Retrieval (Small to Medium Archives):**
   - For regional or low-zoom maps, the root directory indexes all tiles directly.
   - Any tile request requires only one additional range request (`Range: bytes=<offset>-<offset+length-1>`).
3. **Leaf Directory Resolution (Global High-Zoom Archives):**
   - For global archives (hundreds of millions of tiles), the root directory points to leaf directory chunks.
   - At worst, resolving a tile involves: Header (cached) -> Leaf Directory (cached) -> Tile Byte Range.
