# Open Ontologies pinned source notes

Observed 2026-10-16 (Asia/Seoul). Upstream: [fabio-rovai/open-ontologies](https://github.com/fabio-rovai/open-ontologies), full commit `dfb09bf815326913d7d7822fa7228f2602fb4976` (commit time 2026-10-14T07:19:37Z). See [`source.json`](source.json) for selected raw-file hashes. Hash checks cover those selected files only, not Git HEAD, the complete revision, or runtime.

## Source-verified operation

- `Cargo.toml` defines Rust binary `open-ontologies`; dependency features include optional SQL/Postgres, DuckDB, embeddings, plugins and other modules. README's batch example is `printf 'load base.ttl\nplan proposed.ttl\n' | open-ontologies batch -`.
- The README shows independent certificate checking via `oo-cert asserted.tsv derivations.tsv` and Lean examples `cd lean && lake build`, then `lake exe oo-horn check ...`. The build/check examples are source-build/test paths, not a one-command product install. Confirm exact current binary flags with its own `--help` before use.
- The pinned root `.mcp/server.json` declares the OCI package `ghcr.io/fabio-rovai/open-ontologies:0.1.9` with `stdio` transport. It is a package declaration, not a `cargo run` development launch command; downloading/running that image and registering a client require approval. Keep any separate source-build path distinct, and do not infer an authenticated network service from this declaration.
- This project is a semantic analysis/plan/certification engine, not a GUI editor. The source presents supported RDF/OWL, SHACL and SPARQL workflows, but unsupported constructs, budget limits and incomplete/undetermined results remain relevant. A checker certificate's scope is tied to the encoded rules and artifact; distinguish user-supplied-rule conclusions from built-in-rule conclusions.

## License and safety

The full pinned `LICENSE` is MIT (copyright 2026 Fabio Rovai). Original operator prose may describe the project; do not copy upstream implementation or docs verbatim. Before installing/building, downloading images/dependencies, connecting a client, uploading ontology data, making paid provider calls, mutating a graph/database, or deploying publicly, obtain approval for that exact action, data and destination. Review the actual MCP transport and bind/security configuration before enabling it; do not presume stdio and HTTP exposure are equivalent. Never expose secrets.

## Preflight helper contract

Expected helper: `python3 .agent-skills/open-ontologies/scripts/preflight.py --repo /absolute/upstream --json`. From an installed skill root, use `python3 scripts/preflight.py --repo /absolute/upstream --json`. It is stdlib/read-only, with no network, subprocesses or secret-file reads; PATH discovery is not version verification. The helper's secure traversal requires Python 3.10+ on POSIX (Linux/macOS); on Windows use WSL2. Native Windows returns an error rather than weakening symlink protection. It compares selected pinned public-file hashes only; it does not verify Git HEAD, the complete revision, source execution or runtime. `runtime_verified` remains false. Exit codes: 0 offline checks passed, 1 missing/mismatched source, 2 invalid input. Do not pass `--expect-commit` or claim runtime readiness.
