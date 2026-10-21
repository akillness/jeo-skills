# turbovec source-grounded notes

Inspected at `RyanCodrai/turbovec` commit `c3b043b992290ff223b903046af7f6683768241c` on 2026-10-16. These are original paraphrased operator notes; no upstream code is copied here.

## Project shape and setup

The pinned README and manifests show a Python package (PyPI `turbovec`, Rust extension built through maturin) and a Rust crate. Python's minimal extra runtime dependency is NumPy; framework integrations are optional extras. Examples in the README use `pip install turbovec` and `from turbovec import TurboQuantIndex, IdMapIndex`. Rust users add the crate and use `TurboQuantIndex` / `IdMapIndex`.

A typical approved Python flow is `TurboQuantIndex(dim=..., bit_width=4)`, `add(float32_matrix)`, `search(queries, k=...)`, then `sync(path)`; the README documents `load(path)` for the persisted file. `IdMapIndex` adds caller-chosen unsigned 64-bit identifiers and removal/filtering. Scores are inner products; normalize vectors when cosine similarity is wanted. The native extension means package installation/build is an effect and may depend on supported platform wheels/toolchains. Rust source explicitly rejects non-64-bit targets at compile time.

## Important limits

- This is an in-process library and file format. There is no built-in network endpoint, replication protocol, multi-tenant server, or distributed index. Do not substitute it for a hosted vector database.
- The README's scan design is linear in the number of vectors. It may suit moderate in-memory collections, but not every large-corpus/strict-latency workload.
- The pinned README documents 2-bit and 4-bit quantization, dimensions divisible by 8 and capped at 16,384; input arrays are 2-D `float32`. Scores are approximate because quantization is lossy. Evaluate recall against the user's own full-precision baseline, especially for low-dimensional embeddings.
- `TurboQuantIndex` returns row-slot positions; use `IdMapIndex` when stable external IDs are required. Persistence uses explicit file operations (`sync`, `write`, `load`); protect existing index files and backups.
- Published speed/memory/recall measurements are benchmark-specific. The README names its hardware, datasets, query count and comparison method; don't repeat headline ratios as a guarantee.

## Approval boundary

Confirm before installing packages/building a native extension; generating/downloading embeddings or datasets; processing private/regulated content; calling remote/paid embedding services; writing or replacing index files; deleting records/indexes; or wrapping the library in a network service. The library itself makes no network call for local `add/search`, but surrounding embedding/model pipelines may.

## Source map

[Source metadata](source.json) lists the full pin, license conclusion, selected file hashes, purposes and pinned URLs. Raw source marker files for the parent's pin smoke check are under `tmp/knowledge-sources/turbovec/`.

- [README at pinned commit](https://github.com/RyanCodrai/turbovec/blob/c3b043b992290ff223b903046af7f6683768241c/README.md)
- [Rust crate source at pinned commit](https://github.com/RyanCodrai/turbovec/blob/c3b043b992290ff223b903046af7f6683768241c/turbovec/src/lib.rs)
- [Python package manifest at pinned commit](https://github.com/RyanCodrai/turbovec/blob/c3b043b992290ff223b903046af7f6683768241c/turbovec-python/pyproject.toml)
- [MIT license at pinned commit](https://github.com/RyanCodrai/turbovec/blob/c3b043b992290ff223b903046af7f6683768241c/LICENSE)
