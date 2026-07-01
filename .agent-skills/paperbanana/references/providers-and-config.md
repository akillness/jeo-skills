# Providers, configuration, and cost

PaperBanana is provider-agnostic: pick the cheapest provider that meets quality.
Diagrams need an **image-generation** provider; statistical plots need only a **VLM**.

## Provider matrix

| Component | Provider | Model | Notes |
|-----------|----------|-------|-------|
| VLM (planning, critique) | OpenAI | `gpt-5.2` | Default |
| Image generation | OpenAI | `gpt-image-1.5` | Default |
| VLM | Atlas Cloud | `deepseek-ai/DeepSeek-V3-0324` | OpenAI-compatible chat |
| Image generation | Atlas Cloud | `openai/gpt-image-2/text-to-image` | Async prediction API |
| VLM | Google Gemini | `gemini-2.5-flash` | Low cost |
| Image generation | Google Gemini | `gemini-3-pro-image-preview` | ~$0.134/image (1K); supports guided edits (needed by `polish`) |
| VLM / Image | OpenRouter | any supported model | Flexible routing |

- Azure OpenAI / Foundry is auto-detected — set `OPENAI_BASE_URL` to your endpoint.
- Gemini-compatible gateways: set `GOOGLE_BASE_URL`.
- Atlas Cloud: `ATLASCLOUD_BASE_URL=https://api.atlascloud.ai/v1` (chat) and
  `ATLASCLOUD_IMAGE_BASE_URL=https://api.atlascloud.ai/api/v1` (image).

## Environment variables (`.env`)

```bash
# OpenAI (default)
OPENAI_API_KEY=your-key
OPENAI_BASE_URL=https://api.openai.com/v1     # or an Azure endpoint
OPENAI_VLM_MODEL=gpt-5.2
OPENAI_IMAGE_MODEL=gpt-image-1.5

# Atlas Cloud
ATLASCLOUD_API_KEY=your-key
ATLASCLOUD_BASE_URL=https://api.atlascloud.ai/v1
ATLASCLOUD_VLM_MODEL=deepseek-ai/DeepSeek-V3-0324
ATLASCLOUD_IMAGE_BASE_URL=https://api.atlascloud.ai/api/v1
ATLASCLOUD_IMAGE_MODEL=openai/gpt-image-2/text-to-image

# Google Gemini (free tier available)
GOOGLE_API_KEY=your-key
GOOGLE_BASE_URL=                               # optional custom endpoint
GOOGLE_VLM_MODEL=gemini-2.5-flash
GOOGLE_IMAGE_MODEL=gemini-3-pro-image-preview
```

Use `paperbanana setup` for a guided Gemini key flow (official AI Studio key or a custom
Gemini-compatible URL + key).

## YAML config (`configs/config.yaml`)

```yaml
vlm:
  provider: openai          # openai, atlas, gemini, or openrouter
  model: gpt-5.2
image:
  provider: openai_imagen   # openai_imagen, atlas_imagen, google_imagen, openrouter_imagen
  model: gpt-image-1.5
pipeline:
  num_retrieval_examples: 10
  refinement_iterations: 3
  # auto_refine: true        # loop until critic satisfied
  # max_iterations: 30
  # optimize_inputs: true
  output_resolution: "2k"
reference:
  path: data/reference_sets
output:
  dir: outputs
  save_iterations: true
  save_metadata: true
```

Override at the CLI (`--vlm-provider`, `--image-model`, `--config`, …) or per-run YAML.

## Cost discipline

- Plots (`plot`/`plot-batch`) never touch an image-gen provider — cheapest artifact.
- Low-cost VLMs: Gemini `gemini-2.5-flash`, Atlas `deepseek-ai/DeepSeek-V3-0324`.
- Cost dials to raise only on evidence: `--optimize` (2 extra VLM calls),
  `--auto`/`--iterations` (more refinement rounds), `--num-candidates/-k` (N× Phase 2).
- `polish` and `--budget` accept a USD cap and stop gracefully when exceeded.

## Python API

```python
import asyncio
from paperbanana import PaperBananaPipeline, GenerationInput, DiagramType
from paperbanana.core.config import Settings

settings = Settings(
    vlm_provider="openai", vlm_model="gpt-5.2",
    image_provider="openai_imagen", image_model="gpt-image-1.5",
    optimize_inputs=True, auto_refine=True,
)
pipeline = PaperBananaPipeline(settings=settings)
result = asyncio.run(pipeline.generate(GenerationInput(
    source_context="Our framework consists of...",
    communicative_intent="Overview of the proposed method.",
    diagram_type=DiagramType.METHODOLOGY,
)))
print(result.image_path)
```

Resume with `paperbanana.core.resume.load_resume_state(...)` + `pipeline.continue_run(...)`.
