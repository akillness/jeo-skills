# Semantica pinned source notes

Observed 2026-10-16 (Asia/Seoul). Upstream: [semantica-agi/semantica](https://github.com/semantica-agi/semantica), full commit `815527ccca9a00b206dbf6f2cbf866e62d719ed6` (commit time 2026-10-15T13:48:08Z). Selected-file hashes appear in [`source.json`](source.json), not a whole-revision/runtime attestation.

## Setup and runtime

Pinned `pyproject.toml` declares Python `>=3.10,<3.14`. Package entrypoints include `semantica`, `semantica-server`, `semantica-worker`, `semantica-explorer`, and `semantica-mcp`. In a source checkout, project docs give `uv sync` for development and `pytest tests/` for contributor checks; these are not end-user install guarantees. Use the pinned docs/CLI's own `--help` and install only the needed extra. `semantica` has modular extras for providers, documents, graph DB connectors, vector stores, queues, cloud, SHACL, explorer and integrations; `[all]` pulls a broad set and should not be default advice.

The package is a Python knowledge-engineering framework, not a single graph database or ontology GUI. Graph stores are optional connectors; triplet stores and vector stores are distinct abstractions. The core supports RDF/rdflib and graph-oriented pipelines, while server, MCP, cloud, model and database paths have distinct optional prerequisites. The pinned pyproject specifically places `open-ontologies` behind an optional extra and notes its `shacl` extra affects shape checks; don't conflate that with this repository being the Open Ontologies Rust CLI.

`python -m semantica.mcp_server` enters `semantica.mcp_server:main`; this establishes an entrypoint, not a configured client, authorization, or live service. Inspect installed CLI help for exact subcommands and flags.

## License and safety

The full pinned root `LICENSE` is MIT. This grants permissions subject to its notice/disclaimer conditions; original operator docs do not copy upstream code. Before installing optional dependencies, downloading model assets, calling a hosted provider, sending documents to an API, connecting a database, changing MCP/client config, mutating graph/vector stores or deploying publicly, obtain explicit approval for the exact operation, data and destination, including costs. Do not expose credential values. Use local endpoints only when explicitly configured and authorized.

## Preflight helper contract

Expected helper: `python3 .agent-skills/semantica/scripts/preflight.py --repo /absolute/upstream --json`; from installed skill root: `python3 scripts/preflight.py --repo /absolute/upstream --json`. Intended stdlib/read-only, no subprocess/network/secret-file reads; tool checks are PATH discovery only, not version tests. Secure traversal requires Python 3.10+ on POSIX (Linux/macOS); use WSL2 on Windows. Native Windows returns an error rather than weakening symlink protection. Selected pinned public-file hashes do not verify Git HEAD, all source, dependency installation, provider configuration or runtime. `runtime_verified` is always false. Exit codes 0=offline checks passed, 1=missing/mismatched source, 2=invalid input. Do not use `--expect-commit` or claim runtime readiness.
