# Indra OCR Sources and Provenance

## Upstream Repository
- **Repository:** [https://github.com/datalab-to/indra](https://github.com/datalab-to/indra)
- **Model Weights:** [https://huggingface.co/datalab-to/indra-ocr](https://huggingface.co/datalab-to/indra-ocr)
- **Package Name & Version:** `indra-ocr` `1.1.2` (`requires-python >= 3.10`)
- **Upstream Commit:** `ca81e18f7403435a3545c8c8ae9c4a1cecdd32a4`
- **Default Branch:** `main`
- **Licenses:**
  - Code: **Apache-2.0**
  - Model Weights: **Modified OpenRAIL-M** (free for research, personal use, and startups under $20M funding/revenue; cannot be used competitively with Datalab's API)

## Operational Boundaries
- **Offline Preflight:** `scripts/preflight.py` checks Python version, `indra-ocr` CLI presence, `INDRA_OCR_MODEL_DIR` directory presence, and target input readability using stdlib only; it never downloads weights from Hugging Face or spawns `indra-ocr`.
- **Viewer Binding:** `indra-ocr-viewer` listens locally on `http://localhost:8765` with no authentication; keep bound to loopback (use SSH port forwarding remotely).
