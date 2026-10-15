# PixelRAG source-grounded notes

Inspected at `StarTrail-org/PixelRAG` commit `7fef9d8e8c3db3fd3ef7c1c3cf7d1ab54d106031` on 2026-10-16. This is an original summary of selected pinned sources; no upstream code is copied.

## Product model and commands

The README describes visual RAG: render web pages/documents as screenshot tiles, embed those images, retrieve relevant visual tiles, and let a reader model inspect them. The repository separates capture (`pixelshot`) from `pixelrag` stages: `chunk`, `embed`, `build-index`, `index`, `monitor`, and `serve`. Root `src/pixelrag/cli.py` lazily dispatches to stage-specific modules and names published extras for missing stages. The `index` stage orchestrates source → capture/ingest → chunk/embed → index; `serve` provides a separate search API. This is image-based retrieval, not an ontology or semantic graph database.

The pinned README shows `pip install pixelrag` for the lightweight capture path, `pip install 'pixelrag[embed]'` for chunk/embed/index building, `pip install 'pixelrag[index]'` for orchestration, and `pip install 'pixelrag[serve]'` for local serving. Example local config names source type/path, embedding model/device, and output directory. It documents `Qwen/Qwen3-VL-Embedding-2B`, plus Linux CUDA and Apple Silicon/MPS choices. Check the exact stage's `--help` before assuming all flags shown by README apply to the installed version.

## Environment and scale

The pinned `pyproject.toml` requires Python `>=3.12` and defines separate `embed`, `serve`, `index`, `qdrant`, `gpu`, `playwright`, `pdf`, and other extras. One README PDF example says Python 3.10+, which conflicts with package metadata; follow the metadata and validate a pinned environment. The PDF path needs Poppler plus the PDF extra. `index` brings the embedding dependencies; model loading may require large weight downloads and accelerator memory. `serve` adds API/runtime dependencies.

The README's prebuilt hosted corpus example says the chosen base FAISS index is approximately 217 GB. Check free space before any dataset download. The README also includes `api.pixelrag.ai`; it is an external hosted API, not proof that a local service is deployed or authorized to receive user queries/documents. Treat remote use as a separate data/provider/cost decision.

## Effects and safety

- `pixelshot` may access a supplied URL or document and save screenshot tiles; confirm source authorization and output location.
- Indexing writes chunks, embeddings, metadata and FAISS index artifacts. The implementation can remove stale/incomplete tile directories during rebuild, so inspect target paths and backups before running.
- Model/data downloads can be large. Confirm the exact model, dataset, disk budget, license/terms and network/provider operation before download.
- `pixelrag serve` starts a network service. Read the pinned serving configuration and bind explicitly to loopback for local tests; public exposure needs explicit approval and security review.
- No production or runtime claim follows from source inspection or the offline helper. Run the exact stages only after approval and verify each output.

## Source map

`source.json` records the full pin, license, source URLs, purposes and SHA-256 of each downloaded raw source. Raw files for parent true-pin checks are under `tmp/knowledge-sources/pixelrag/`.

- [README at pinned commit](https://github.com/StarTrail-org/PixelRAG/blob/7fef9d8e8c3db3fd3ef7c1c3cf7d1ab54d106031/README.md)
- [Pinned package manifest](https://github.com/StarTrail-org/PixelRAG/blob/7fef9d8e8c3db3fd3ef7c1c3cf7d1ab54d106031/pyproject.toml)
- [CLI dispatch](https://github.com/StarTrail-org/PixelRAG/blob/7fef9d8e8c3db3fd3ef7c1c3cf7d1ab54d106031/src/pixelrag/cli.py)
- [Index pipeline implementation](https://github.com/StarTrail-org/PixelRAG/blob/7fef9d8e8c3db3fd3ef7c1c3cf7d1ab54d106031/index/src/pixelrag_index/pipelines.py)
- [Apache-2.0 license](https://github.com/StarTrail-org/PixelRAG/blob/7fef9d8e8c3db3fd3ef7c1c3cf7d1ab54d106031/LICENSE)
