---
name: "turbovec"
description: "Use the RyanCodrai/turbovec project when integrating its in-process Python or Rust TurboQuant vector index: create an index, quantize/search vectors, persist/load a file, apply ID filters, or choose its framework adapters. Trigger on turbovec or TurboQuantIndex. Route hosted vector databases and replication needs to a server product such as Typesense; turbovec itself is a library, not a network service."
allowed-tools: Bash Read Grep Glob
compatibility: Works with compatible agent clients that can read files and run shell commands; Python wheels include a native Rust extension and Rust use requires a 64-bit target.
metadata:
  version: "1.0.0"
  source: "https://github.com/RyanCodrai/turbovec"
  upstream_commit: "c3b043b992290ff223b903046af7f6683768241c"
---

# turbovec operator

## Instructions

1. **Check the actual checkout and source pin.** From the jeo-skills repository root run `python3 .agent-skills/turbovec/scripts/preflight.py --repo /absolute/upstream --json`; from an installed copy, use its `scripts/preflight.py`. No `--repo` means inventory only. The helper checks selected pinned-file hashes, not Git HEAD, the entire source tree, dependency installation, or execution. See [pinned source notes](references/upstream.md).
2. **Choose the library surface.** Python imports `TurboQuantIndex` or `IdMapIndex` from `turbovec`; Rust uses the `turbovec` crate. This is an in-process vector index that linearly scans its compressed vectors. It does not provide a server, replication, tenancy, or distributed index.
3. **Validate data shape and quality needs.** Confirm vector dimension, row-major `float32` input for Python, bit width (2 or 4), score semantics (inner product; normalize for cosine), recall target, and whether stable IDs are needed. Compare recall on representative local data before adopting quantization.
4. **Get approval before effects.** Ask before installing the package/toolchain, downloading models or vector datasets, reading/embedding private source data, using paid/remote embeddings, writing/syncing/loading an index file, rebuilding or deleting an index, or starting an API/service around it. Keep file paths and credentials out of public logs. `sync(path)` persists data and later calls update it.
5. **Check the pinned API and verify round-trip.** After approval, inspect the checkout's Python/Rust API docs and package help. Start with a small fixture, verify search results and persistence/load, and measure memory, recall, and latency for the target machine. Do not infer production service readiness from an in-memory library smoke test.

## Examples

```bash
# Offline provenance check; absolute, non-symlink source checkout.
python3 .agent-skills/turbovec/scripts/preflight.py --repo /work/turbovec --json

# Only after install/data/file-write approval:
pip install turbovec
python - <<'PY'
import numpy as np
from turbovec import TurboQuantIndex
x = np.load("vectors.npy").astype(np.float32)
index = TurboQuantIndex(dim=x.shape[1], bit_width=4)
index.add(x)
scores, slots = index.search(x[:1], k=5)
index.sync("index.tv")
PY
```

## Best practices

- Use stable `uint64` IDs through `IdMapIndex` if results must survive slot changes/deletes; plain `TurboQuantIndex` returns slot positions.
- The project documents 64-bit targets only, dimensions in multiples of 8 up to 16,384, and bit widths 2/4. Quantization is lossy; low-dimensional data can lose more recall.
- Search cost scales with corpus size because the library scans vectors. For very large corpora or network clients, choose an ANN/server architecture instead of presenting turbovec as one.
- Keep upstream performance figures tied to their hardware, dataset and benchmark method; validate locally. Do not publish universal multipliers.
- Report `runtime_verified: false` after helper checks: this preflight does not install native wheels, run kernels, test recall, or exercise persistence.

## References

- [Pinned source behavior, limits, and evidence](references/upstream.md)
- [Pin, license, and raw file hashes](references/source.json)
- [Authored routing scenarios](evals/evals.json)
- Helper contract: `python3 .agent-skills/turbovec/scripts/preflight.py --help`; helper supports Python 3.10+ on POSIX Linux/macOS/WSL2 and fails closed when secure directory traversal is unavailable, including unsupported native Windows.
