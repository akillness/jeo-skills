# Rete (`caviri/rete`) — Upstream Reference

- **Repository:** `https://github.com/caviri/rete`
- **Pinned commit:** `c38b7ffb304dfaeb9c8ad3a37dd6416678e198e0` (`2026-11-26T05:17:51Z`)
- **Workspace version:** `0.7.8` (Rust MSRV `1.87`, edition `2021`)
- **License:** `Apache-2.0` (`LICENSE`)
- **Homepage & Playground:** `https://caviri.github.io/rete/`

## 1. Architecture & Crates

`Cargo.toml` workspace members:
- `crates/rete-core` — single-file `.rete` format reader/writer, dictionary coding, 3/6 permutation tile layout, HTTP Range read trait, BLAKE3 content hashing, SPARQL/openCypher/SHACL/OWL 2 QL evaluation, Louvain & type community pyramids.
- `crates/rete-graph` — higher-level graph wrapper consumed by bindings.
- `crates/rete-cli` — native CLI binary `rete` (uses `tikv-jemallocator = 0.6.1` on non-MSVC targets so memory-bounded exports stay near `--memory-budget-mb`).
- `crates/rete-wasm` — `wasm32` bindings powering browser/Node JS (`clients/js`, npm `rete-graph`) and the desktop `rete.mcpb` MCP bundle (`clients/mcpb`).
- `crates/docgen`, `crates/bench` — documentation and benchmark tooling.
- Language bindings under `clients/` (`clients/python` PyO3/maturin `rete-graph`, `clients/js` npm `rete-graph`, `clients/r`, `clients/java`, `clients/blender`, `clients/chrome`, `clients/relay`, `clients/mcpb`, `clients/tauri`) consume workspace crates rather than vice versa.

## 2. Format & Compatibility (`0.7.8`)

From `docs/install.md` and `AGENTS.md`:
- **Format versions:** `0.7.8` **writes format `0x08`** and **reads `0x05` to `0x08`**. Older readers (`<= 0.6.x`) cannot open `0x08` files.
- **File sections:** 1 KiB fixed header, BLAKE3 content hash, shared dictionary (`IRIs`, blank nodes, typed/tagged literals), optional Dataset Card + build-info section (kept outside the content hash so identical RDF content hashes identically), optional label/full-text index (`--label-index`, `--text-index`), optional community pyramid (`louvain` or `types`, skippable with `--no-pyramid`), and triple/quad permutation tiles.
- **Permutations (`--permutations`):** Default is `6` (3 routing + 3 merge-join orders). Using `--permutations 3` reduces archive size only for compatible target readers; older readers reject unsupported permutation masks.
- **JSON output contract:** Rete-specific `--json` responses include `"schemaVersion": 1`. Standard SPARQL Results JSON and JSON-LD outputs keep their standard structures without adding `"schemaVersion"`.

## 3. Packaging Distinction

Installing a language binding does **not** install the native CLI:
- **Native CLI (`rete`):** `cargo install rete-cli` (pinned `0.7.8`), prebuilt `v0.7.8` release tarballs/zips (Linux/macOS/Windows x86-64/ARM64 with completions and `rete(1)` man page), or Docker `ghcr.io/caviri/rete`.
- **Python library (`rete-graph` 0.7.8):** `pip install rete-graph` (optional extras: `pandas>=1.5`, `rdflib>=6`; Python `>=3.9`).
- **JavaScript / WASM library (`rete-graph` 0.7.8):** `npm install rete-graph` (Node `>=18` + browsers; lazy byte-range reads over HTTP and local files; exports main ESM module, `./bundle`, `./bundle.min`, and Comunica integration).

## 4. CLI Command Groups (`rete <command> --help`)

Verified from `crates/rete-cli/src/main.rs` and `docs/cli.md`:
- **Build & Transform:**
  - `build <inputs...> -o <out.rete>` — ingests `.nt`, `.nq`, `.ttl`, `.trig`, `.rdf`/`.owl`/`.rdfxml`, `.jelly` (+ `.gz`), `.jsonld`, `.yamlld`, stdin (`-`), or folders (each visible file becomes `<base><path>`, default `urn:rete:file:`, sorted deterministically). Flags include `--format`, `--merge-files`, `--collapse-graphs`, `--graph-per-file`, `--graph-base`, `--shared-blank-nodes`, `--quoted-triple-syntax rdf12|rdf-star`, `--context IRI=FILE`, `--fetch-contexts`, `--memory-budget-mb`, `--materialize`, `--reason`, `--card`, `--card-file`, `--label-index`, `--text-index`, `--pyramid-algo louvain|types`, `--no-pyramid`, `--type-predicate`, `--no-card-costs`, `--progress`. Set `RETE_BUILD_RECORD=reproducible` to strip volatile machine/wall-time fields.
  - `merge`, `convert`, `export` (`--sanitize-iris`), `recard` (`--in-place`, `--keep-curated`), `repyramid`.
- **Inspect & Verify (Local & Remote):**
  - `info`, `stats`, `verify`, `validate`, `estimate`, `cost`, `manifest`, `graphs`
  - `card`, `card-url`, `card-audit`, `schema`, `predicates`, `communities`, `progressive`
- **Query, Search & Reasoning:**
  - `sparql`, `sparql-url`, `federate`
  - `query`, `query-url`, `bgp`, `reach`, `why`, `why-url`, `summary`, `summary-url`
  - `search`, `search-url`, `cypher` (openCypher subset)
  - `shacl`, `shacl-url`, `reason` (`--verify-card`)
- **Serving:**
  - `serve` — starts an HTTP / SPARQL endpoint locally (gate behind explicit user approval).

### Sharp Build Edges (`docs/cli.md`)
- **JSON-LD & YAML-LD:** Builds are offline by default. Remote `@context` IRIs fail unless mapped locally (`--context https://schema.org/=schema.jsonld`) or explicitly allowed via `--fetch-contexts`. JSON-LD is buffered whole rather than streamed, so it is rejected under `--memory-budget-mb` (convert to N-Quads first).
- **Jelly streams:** `.jelly` and `.jelly.gz` (1.0/1.1 row layout & 1.2 column layout) stream under `--memory-budget-mb`; generalized RDF, optional 1.2 RDF Message streams, lookup tables > 1,048,576 entries, and `rete export` to Jelly are unsupported.

## 5. Agentic / MCP Surfaces (`docs/agents.md`, `clients/mcpb`, `clients/relay`)

- **Hosted MCP Server (public catalog & public URLs only):** `https://katospiegel-rete.hf.space/mcp/` (stateless streamable HTTP, 18 tools across Discover/Query/Validate/Author/Media/Connector). **Never pass private `.rete` graphs or confidential RDF text to the hosted endpoint.**
- **Local Desktop Extension (`rete.mcpb`):** Architecture-neutral WASM + Node bundle running completely offline on local private `.rete` files (`chat:<name>` or granted folders) and remote HTTP Range URLs. Supports async jobs (`start_query`, `query_status`, `query_result`, `cancel_query`), partitioned extractions (`partition_by`), SHACL validation, and interactive `graph_view` MCP App visualizations.
- **Claude Code Plugin:** Marketplace & plugin manifests in `.claude-plugin/marketplace.json` and `.claude-plugin/plugin.json` (`rete-graph@rete`), paired with repo playbooks under `skills/`.

## 6. Hosting & CORS Requirements

- Static servers (S3, Cloudflare R2, GitHub Pages, Zenodo, Nginx/Caddy) must support HTTP byte-range requests (`Accept-Ranges: bytes`).
- Browser WASM clients require CORS headers permitting `Range` in `AllowedHeaders` and exposing `Content-Range`, `Content-Length`, `Accept-Ranges`, and `ETag` in `ExposeHeaders`.
- Avoid Hugging Face `resolve/` 302 redirect URLs in browser synchronous XHR readers; serve from direct Range-enabled endpoints with CORS configured.
