# LEANN source-grounded notes

Inspected at commit `00710edff4aba84c41f4adfc75b79175b28132f2` on 2026-10-16. This is an original operator summary, not upstream documentation or a runtime test.

## What the project is

The README and implementation describe LEANN as a document/vector index that uses a graph to choose what to recompute during search, avoiding storage of every embedding. It supports local CLI workflows and multiple embedding modes. That graph is not an entity/relation knowledge graph. Do not describe LEANN as a database service or infer that all integrations are local/offline merely because local embedding is supported.

## Setup and CLI

The pinned README documents a Python environment created with `uv`, followed by `uv pip install leann`; it gives `leann build` and `leann search` as user-facing operations. The CLI parser at this pin defines `build [index_name] --docs ...`; default documents are the current directory, default backend is `hnsw`, and choices include `hnsw`, `diskann`, and `ivf`. Embedding mode choices include `sentence-transformers`, `openai`, `mlx`, and `ollama`. `search INDEX QUERY` supports `--top-k` (default 5). Build defaults to incremental update; `--force` requests a full rebuild. Check the actual checkout's help before relying on other options.

Illustrative approved workflow:

```bash
uv venv
source .venv/bin/activate
uv pip install leann
leann build handbook --docs ./docs
leann search handbook "sync behavior" --top-k 5
```

The README's source-build section notes platform-dependent native prerequisites: macOS DiskANN requires macOS 13.3 or later and uses Homebrew dependencies; Linux DiskANN has distro/toolchain requirements. The Linux README warns that uv hardlink installs can trip a hardened file loader in some builds and documents `UV_LINK_MODE=copy` as a workaround. These are setup caveats, not proof that a particular machine is compatible. Optional GPU backends require CUDA; don't select them without checking backend-specific requirements.

## Effects, data and limitations

- Building reads the selected documents, computes embeddings, and writes index artifacts. Confirm corpus scope, ignore rules, destination, and storage before execution.
- A remote embedding mode can transmit document text and incur charges. Keep credentials out of command lines and logs; confirm the endpoint and data policy first.
- Rebuild with `--force` only with explicit approval and a recovery plan. The CLI has cleanup/replacement behavior; do not assume the current index is preserved on every failure path.
- CLI `watch`, `rebuild`, index discovery, MCP and account-data readers are separate capabilities. Inspect their exact options and data access before using them; no connector or service operation is implicitly authorized by a general request to research LEANN.
- Upstream benchmark claims depend on corpus, backend, model, hardware and evaluation procedure. The README's ContextBench paragraph identifies 30 tasks and macro-averaged gold-line metrics; it explicitly says better context access does not guarantee issue resolution. Do not turn these into universal user-facing guarantees.

## Source map

The source pin and SHA-256 of each downloaded raw file are in [source.json](source.json). Selected evidence: README (installation, CLI overview and benchmark context), full MIT license, root `pyproject.toml` (workspace/runtime dependency declarations), `packages/leann-core/src/leann/cli.py` (actual parser/defaults/effects), and `packages/leann-core/src/leann/api.py` (index and search implementation). Raw files are retained for the parent smoke check under `tmp/knowledge-sources/leann/`.

- [README at pinned commit](https://github.com/StarTrail-org/LEANN/blob/00710edff4aba84c41f4adfc75b79175b28132f2/README.md)
- [CLI source at pinned commit](https://github.com/StarTrail-org/LEANN/blob/00710edff4aba84c41f4adfc75b79175b28132f2/packages/leann-core/src/leann/cli.py)
- [MIT license at pinned commit](https://github.com/StarTrail-org/LEANN/blob/00710edff4aba84c41f4adfc75b79175b28132f2/LICENSE)
