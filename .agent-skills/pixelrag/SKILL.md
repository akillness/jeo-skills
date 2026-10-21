---
name: "pixelrag"
description: "Operate StarTrail-org/PixelRAG for screenshot-based visual retrieval: render pages or documents into image tiles, chunk/embed them, build a FAISS index, configure local search, or inspect its search API. Use when the task names PixelRAG, pixelshot, or multimodal visual RAG. It retrieves visual content; it is not a text-only RAG framework, database, or semantic ontology. Route general text-RAG orchestration to langchain-rag."
allowed-tools: Bash Read Grep Glob
compatibility: The pinned package metadata requires Python 3.12+; optional ML/rendering stages have additional platform, accelerator, model, and native dependency requirements.
metadata:
  version: "1.0.0"
  source: "https://github.com/StarTrail-org/PixelRAG"
  upstream_commit: "7fef9d8e8c3db3fd3ef7c1c3cf7d1ab54d106031"
---

# PixelRAG operator

## Instructions

1. **Check the source pin.** From jeo-skills root use `python3 .agent-skills/pixelrag/scripts/preflight.py --repo /absolute/upstream --json`; from the installed skill root use `scripts/preflight.py`. No `--repo` is inventory only. Hashes cover selected source files, not Git HEAD, the full tree, package installation, model downloads, or runtime. Read [pinned source notes](references/upstream.md).
2. **Choose local or hosted retrieval explicitly.** PixelRAG renders visual documents/pages to image tiles, embeds visual content, builds a search index, and can serve queries. The upstream README also documents a hosted API and a prebuilt multi-terabyte index download. Do not switch to either external surface by implication; confirm data transfer, provider, cost, account, and destination.
3. **Map the local pipeline.** Separate `pixelshot` capture from `pixelrag` stages (`chunk`, `embed`, `build-index`, `index`, `serve`). Inspect `pixelrag.yaml`, source connector, embedding model/device, output/index directory, and server bind before proceeding. PixelRAG is multimodal visual retrieval, not a knowledge graph/ontology.
4. **Get approval before effects.** Ask before installing extras/native packages; downloading model weights or datasets; capturing private/third-party URLs; sending content or queries to hosted APIs or paid providers; writing/rebuilding/deleting tiles, embeddings, indexes or target data; or starting a service/public bind. Do not put credentials in CLI arguments or reports.
5. **Verify by stage.** After approval, inspect `pixelrag <stage> --help`, run a small authorized sample, verify rendered tiles and their source mapping, index output, and query results. Preflight is offline provenance only; it is not a successful render, model load, index build, API deployment, or search test.

## Examples

```bash
# Provenance check only; absolute, non-symlink checkout.
python3 .agent-skills/pixelrag/scripts/preflight.py --repo /work/PixelRAG --json

# Only after package/model/source/index approval:
pip install 'pixelrag[index]'
# Create and inspect pixelrag.yaml before running the pipeline.
pixelrag index build
pixelrag serve --index-dir ./my_index --port 30001
```

## Best practices

- The pinned `pyproject.toml` requires Python `>=3.12`, although one README example says 3.10+; follow package metadata and test the exact environment.
- README describes Linux CUDA and macOS Apple Silicon/MPS paths with `device: auto`; CPU fallback and optional extras have different cost/performance. PDF rendering needs the PDF extra and Poppler. Confirm hardware and system packages before choosing a pipeline.
- `pixelrag[index]` pulls index/embed dependencies. Model weights may be large. The documented prebuilt index's base subset is about 217 GB; do not download it unless explicitly approved and storage is checked.
- `pixelrag serve` starts a service. Inspect actual bind defaults and restrict to loopback unless public exposure is explicitly approved and secured.
- Keep benchmark or hosted-corpus results scoped to their exact dataset/model/hardware; do not claim them for a user's corpus.

## References

- [Pinned upstream pipeline, dependencies, and limitations](references/upstream.md)
- [Pin, license, and selected-file hashes](references/source.json)
- [Authored routing scenarios](evals/evals.json)
- Helper contract: `python3 .agent-skills/pixelrag/scripts/preflight.py --help`; helper supports Python 3.10+ on POSIX Linux/macOS/WSL2 and fails closed when secure directory traversal is unavailable, including unsupported native Windows.
