---
name: indra
description: >
  Run fast CPU document OCR and layout extraction on PDFs and images using datalab-to/indra (`indra-ocr`). Use when converting PDFs, scans, rotated/tilted documents, or multilingual pages (80+ languages including CJK, RTL Arabic/Hebrew, Latin, Indic) into Markdown, plain text, or JSON bounding boxes and reading-order layout blocks on CPU via ONNX Runtime without PyTorch/GPU, launching the local `indra-ocr-viewer` (`http://localhost:8765`), enabling `--math` inline LaTeX recognition, or batching pages via `convert_many`. Route Korean HWP/HWPX document parsing to hwp or rhwp-edit, and SKILL.md format linting to skill-standardization.
allowed-tools: Bash Read Grep Glob
metadata:
  version: 0.1.0
  source: https://github.com/datalab-to/indra
  upstream_commit: ca81e18f7403435a3545c8c8ae9c4a1cecdd32a4
---

# Indra OCR

## When to use this skill

Use when converting PDFs or images into structured Markdown, plain text, or JSON layout blocks on **CPU-only machines** with `datalab-to/indra` (`indra-ocr` v1.1.2). Indra OCR uses ONNX Runtime, OpenCV, and `pypdfium2` (no PyTorch or CUDA), handles 80+ languages, vertical CJK columns, tilted/rotated scans, and digital PDF text layers.

### Route-outs
- For reading or editing Korean Hangul `.hwp` / `.hwpx` files, use `hwp` or `rhwp-edit`.
- For validating `SKILL.md` format or catalog metadata, use `skill-standardization`.

## Instructions

### 1. Run offline environment and input preflight

Check Python (`>= 3.10`), installed `indra-ocr` / `indra-ocr-viewer` binaries, optional `INDRA_OCR_MODEL_DIR`, and target input readability without triggering Hugging Face downloads:

```bash
python3 "$SKILL_DIR/scripts/preflight.py" --input "/absolute/path/to/paper.pdf" --json
```

### 2. Install `indra-ocr` and understand model downloads

```bash
pip install indra-ocr
# Optional Tesseract side-by-side comparison in viewer:
pip install "indra-ocr[tesseract]"
```

- First OCR run downloads ~76 MB of default ONNX/LM models from Hugging Face (`datalab-to/indra-ocr`).
- To point at a pre-cached offline model directory, set `INDRA_OCR_MODEL_DIR` or pass `--model-dir /path/to/models`.
- `--math` downloads additional math recognition models on first use.

### 3. Choose CLI mode and output format

```bash
# Default auto mode: reads valid digital PDF text layers, OCRs scans/images
indra-ocr paper.pdf

# Batch directory export to Markdown across all usable CPU cores
indra-ocr *.pdf --out results/ --cores 8

# Structured JSON with lines, boxes [x0, y0, x1, y1], layout blocks, confidences, timings
indra-ocr scan.png --format json

# Force OCR even on PDFs with a text layer, plus math LaTeX and page furniture
indra-ocr paper.pdf --mode ocr --math --keep-furniture --timings
```

- `--mode`: `auto` (default), `ocr` (always OCR), `text` (trust PDF text layer)
- `--format`: `md` (default), `text`, `json`
- `--dpi`: PDF render resolution (default `200`)
- `--no-image-ocr`: skip OCR on embedded images inside text-layer PDFs
- `--password`: decrypt password-protected PDFs

### 4. Use the Python API safely (especially multiprocessing)

For single files or in-memory images:

```python
import indra_ocr

conv = indra_ocr.load(threads=4, mode="auto", math=False)
for idx, page in conv.convert("paper.pdf"):
    print(page.source, page.timings["total_ms"])
    print(page.markdown)
```

For multi-file batch conversion with `convert_many`, **always guard with `if __name__ == "__main__":`** on macOS and Windows so spawned worker processes do not re-execute the script:

```python
import indra_ocr

if __name__ == "__main__":
    for path, result in indra_ocr.convert_many(["a.pdf", "b.pdf"], cores=None):
        if isinstance(result, indra_ocr.InputError):
            continue
        for idx, page in result:
            print(path, idx, page.source)
```

### 5. Launch local inspection viewer (optional)

```bash
indra-ocr-viewer --port 8765
```

Inspects lines, layout blocks, reading order, rendered Markdown, and per-stage timings locally at `http://localhost:8765` without uploading files.

### 6. Respect accuracy & commercial license boundaries

- **Known limitations:** Complex merged-cell or borderless tables, cursive handwriting, degraded/faded scans, and banner-shaped pages degrade accuracy; route those workloads to higher-capacity models (e.g., Datalab Chandra) with user approval before sending files to a cloud API.
- **License split:** Code is **Apache-2.0**, while model weights on Hugging Face use a **modified OpenRAIL-M** license (free for research, personal use, and startups under $20M funding/revenue; cannot be used to compete with Datalab's API).

## Examples

### Extract structured JSON layout blocks from a scanned Korean PDF

```bash
# 1. Preflight check (no model downloads)
python3 "$SKILL_DIR/scripts/preflight.py" --input /abs/path/scan.pdf --json

# 2. Extract JSON with timings
indra-ocr /abs/path/scan.pdf --format json --out /abs/path/out/ --timings
```

## Best practices

1. **Use `--mode auto` by default:** It preserves digital PDF text layers cleanly (including RTL and CJK) and OCRs only scanned pages or images.
2. **Enable `--math` selectively:** Turning on `--math` boosts formula accuracy (`$...$`) but slows throughput ~30–40% and downloads extra weights.
3. **Always protect `convert_many` with `__main__`:** Prevents infinite worker-spawning loops on macOS/Windows.
4. **Verify local vs cloud boundary:** Local `indra-ocr` keeps documents on-machine; only recommend Datalab's managed API if the user approves uploading documents.

## References

- [CLI, Python API, and Limitations Reference](references/cli-python-and-limits.md): Full CLI flags, `Page`/`Line` schema, 4 ONNX recognizers, math trade-offs, and failure modes.
- [Sources and Provenance](references/sources.md): Upstream pin (`ca81e18f7403435a3545c8c8ae9c4a1cecdd32a4`), v1.1.2 metadata, Apache-2.0 + OpenRAIL-M licenses.
- [Evaluation Scenarios](evals/evals.json): Five behavioral evaluation scenarios covering CPU OCR, multiprocessing guards, math trade-offs, offline model cache, and route-outs.
