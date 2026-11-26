---
name: rete
description: >
  Build, inspect, host, and query caviri/rete single-file immutable .rete RDF knowledge graph archives via HTTP Range Requests, SPARQL 1.1, openCypher, SHACL, and OWL 2 QL reasoning across rete CLI, Python/JS-WASM libraries, and MCP. Use when creating .rete files from Turtle/N-Triples/N-Quads/TriG/RDF-XML/Jelly/JSON-LD/YAML-LD, reading Dataset Cards or community pyramids, running local or remote SPARQL over URLs, configuring S3/R2/GitHub Pages Range hosting, or connecting local rete.mcpb vs hosted MCP. Do not use for mutable local RocksDB ontology planning/diff workspaces (route to open-ontologies), geospatial vector/raster map tiles (route to pmtiles), or repository code-graph extraction (route to graphify). Triggers on: rete, .rete, rete-cli, rete-graph, caviri/rete, RDF archive, HTTP Range SPARQL, rete.mcpb.
allowed-tools: Read Glob Grep Bash
compatibility: Rust rete CLI (rete-cli 0.7.8) or Python/Node rete-graph 0.7.8 / Docker ghcr.io/caviri/rete (optional rete.mcpb). Offline preflight runs in POSIX Python 3.10+.
license: Apache-2.0
metadata:
  version: "1.0.0"
  source: https://github.com/caviri/rete
  upstream_commit: c38b7ffb304dfaeb9c8ad3a37dd6416678e198e0
  pinned_at: "2026-11-27"
---

# Rete (`caviri/rete`)

Source-pinned operator guide for `caviri/rete` (`v0.7.8`, Apache-2.0): single-file, immutable, HTTP Range-queryable RDF knowledge graph archives (`.rete`) with embedded Dataset Cards, label/full-text indexes, Louvain/type community pyramids, SPARQL 1.1, SHACL validation, and OWL 2 QL reasoning.

## When to use this skill

- Packaging RDF datasets (`.nt`, `.nq`, `.ttl`, `.trig`, `.rdf`/`.owl`/`.rdfxml`, `.jelly`, `.jsonld`, `.yamlld`, `.gz`, or directories) into self-describing `.rete` archives with `rete build`.
- Inspecting zero-download file metadata, Dataset Cards, schemas, predicates, or cost estimates (`rete info`, `rete card`, `rete card-url`, `rete schema`, `rete cost`, `rete verify`).
- Querying local files or remote HTTP Range URLs with SPARQL (`rete sparql`, `rete sparql-url`, `rete federate`), triple patterns (`rete query`, `rete query-url`), full-text/label search (`rete search`, `rete search-url`), openCypher (`rete cypher`), SHACL (`rete shacl`), or OWL 2 QL (`--reason`).
- Embedding `rete-graph` (`0.7.8`) in Python or JS/WASM, hosting `.rete` archives on S3/Cloudflare R2/GitHub Pages, or selecting between local offline `rete.mcpb` and the hosted public MCP endpoint.
- Routing out: use `open-ontologies` for mutable local ontology diffs/planning/certificates (`oo-cert`), `pmtiles` for geospatial map tile archives, `semantica` for ontology/semantic extraction pipelines, and `graphify` for source-code repository graphs.

## Instructions

1. **Run the offline preflight first** from `.agent-skills/rete` to verify manifest pin integrity and detect installed tools (`rete`, `cargo`, `python3`, `node`, `docker`) without executing upstream code:
   ```bash
   python3 scripts/preflight.py --json
   python3 scripts/preflight.py --json --repo /absolute/path/to/caviri-rete
   ```
   Read [references/upstream.md](references/upstream.md) and [references/source.json](references/source.json) before citing CLI flags, format limits, or client APIs.

2. **Distinguish the CLI binary from language libraries and check format compatibility**:
   - `pip install rete-graph` (PyPI `0.7.8`) and `npm install rete-graph` (npm `0.7.8`) install **in-process libraries only** — they do not provide the native `rete` CLI. Install the CLI separately via `cargo install rete-cli`, a signed `v0.7.8` release binary, or `ghcr.io/caviri/rete`.
   - Engine `0.7.8` writes binary format `0x08` and reads `0x05`–`0x08`; readers from `<= 0.6.x` cannot open `0x08` files.
   - Keep the default 6-permutation index (`--permutations 6`) unless explicitly optimizing size for a read profile tested against target readers.

3. **Build `.rete` archives reproducibly and safely**:
   - Use `--card`, `--title`, `--license`, `--source`, `--label-index`, and `--text-index` when publishing discoverable graphs; set `RETE_BUILD_RECORD=reproducible` for deterministic build-info bytes.
   - For large inputs exceeding RAM, pass `--memory-budget-mb <N>` and `--pyramid-algo types` (or `--no-pyramid` when only SPARQL/SHACL/triple patterns are needed). Note: JSON-LD is buffered whole and cannot run under `--memory-budget-mb`; convert large JSON-LD to N-Quads first.
   - Keep builds offline by default: map required remote JSON-LD `@context` files locally via `--context https://schema.org/=schema.jsonld` rather than enabling `--fetch-contexts` without explicit approval.
   - Keep a backup before modifying an existing archive with `rete recard --in-place` (use `--keep-curated` to preserve publisher card fields).

4. **Query locally or over HTTP Range URLs**:
   - Discover structure cheaply before scanning triples: run `rete card-url` -> `rete schema` / `rete predicates` -> `rete sparql-url` with explicit `LIMIT`.
   - For OWL 2 QL reasoning or SHACL validation on `.rete` files, verify whether rules were materialized (`--materialize`) or evaluated at query time (`--reason` / `rete shacl`).

5. **Enforce hosting and MCP privacy boundaries**:
   - Static hosting (S3, R2, GitHub Pages, Zenodo) must serve HTTP `Accept-Ranges: bytes`. Browser WASM clients additionally require CORS `AllowedHeaders: ["Range"]` and `ExposeHeaders: ["Content-Range", "Content-Length", "Accept-Ranges", "ETag"]`; avoid Hugging Face `resolve/` 302 redirect URLs in browser sync-XHR readers.
   - Never send private `.rete` files, internal URLs, or confidential RDF text to the hosted Hugging Face MCP (`https://katospiegel-rete.hf.space/mcp/`). For private or offline graphs, use the local `rete.mcpb` extension (Node + WASM) or local `rete serve` with explicit user approval.

## Examples

```bash
# Build a self-describing .rete archive with Dataset Card, label index, and reproducible metadata
RETE_BUILD_RECORD=reproducible rete build data.ttl \
  --card --title "Domain Graph" --license CC-BY-4.0 --label-index \
  -o domain.rete

# Inspect header, Dataset Card, and run a bounded SPARQL query locally
rete info domain.rete --json
rete card domain.rete --json
rete sparql domain.rete "SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 10"

# Inspect and query a published remote .rete file via HTTP Range Requests (no full download)
rete card-url https://example.org/graph.rete --json
rete sparql-url https://example.org/graph.rete "SELECT (COUNT(*) AS ?n) WHERE { ?s ?p ?o }"
```

```python
# In-process Python library usage (rete-graph 0.7.8; separate from native CLI)
import rete_graph

g = rete_graph.open("domain.rete")  # or an https:// URL
print(g.card())
rows = g.sparql("SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 5")
```

## Best practices

- Treat `.rete` as an immutable distribution artifact: verify integrity with `rete verify` before publishing and version URLs rather than mutating cached remote files in place.
- Start remote exploration with `rete card-url` and `rete estimate` so agents inspect classes, predicates, and byte budgets before issuing expensive unbound SPARQL queries.
- Prefer `--graph-per-file` or folder builds (`rete build corpus/ -o corpus.rete`) when tracking source provenance per file (`urn:rete:file:<path>`), unless unified blank nodes (`--shared-blank-nodes`) are genuinely needed for a split dump.
- Gate side effects explicitly: local server startup (`rete serve`), cloud bucket CORS edits, remote `@context` fetches (`--fetch-contexts`), and hosted MCP calls require user confirmation.

## References

- [Upstream engineering reference](references/upstream.md) — workspace crates, full CLI command groups, binary format compatibility (`0x05`–`0x08`), Python/JS-WASM/MCP details, and hosting rules.
- [Source provenance manifest](references/source.json) — pinned commit `c38b7ffb304dfaeb9c8ad3a37dd6416678e198e0` and SHA-256 digests verified by `scripts/preflight.py`.
- [Offline preflight helper](scripts/preflight.py) — offline manifest, tool discovery, and selected-file digest checker.
- [Evaluation scenarios](evals/evals.json) — behavioral prompts and routing checks (`authored: true, executed: false`).
