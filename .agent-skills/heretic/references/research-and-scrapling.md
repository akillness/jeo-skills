# Interpretability research + the `scrapling` discovery route

Heretic doubles as an **interpretability** tool for studying the semantics of model internals, and this
skill routes all **live-web discovery** (models, datasets, benchmarks, prior art) through the `scrapling`
skill so nothing here reinvents scraping.

## Research features (`[research]` extra)

Install the optional extra first:

```sh
pip install -U 'heretic-llm[research]'
```


### `--print-residual-geometry`

Prints a per-layer table quantifying how harmful/harmless residuals relate. Columns include cosine
similarities `S(g,b)`, `S(g*,b*)`, `S(g,r)`, `S(b,r)`; L2 norms `|g|`, `|b|`, `|r|` (and the `*`
geometric-median variants); and `Silh`, the mean silhouette coefficient of the good/bad residual
clusters. Legend:

- `g`/`b` = mean residual for good(harmless)/bad(harmful) prompts; `g*`/`b*` = geometric medians.
- `r = b − g`, `r* = b* − g*` = refusal directions.
- `S(x,y)` = cosine similarity; `|x|` = L2 norm; `Silh` = cluster separation.

Use it to see **which layers carry a strong, well-separated refusal direction** — the layers where
ablation will matter most.

### `--plot-residuals`

Generates a **PaCMAP** ([Wang et al.](https://github.com/YingfanWang/PaCMAP)) 2-D projection of the
first-token residuals per layer:

1. Compute residual vectors per layer for harmful + harmless prompts.
2. PaCMAP-project residual space → 2-D.
3. Left-right align consecutive layers by geometric median (init each layer from the previous
   projection) to keep transitions smooth.
4. Scatter-plot each layer to a PNG.
5. Stitch an **animated GIF** showing how residuals transform across layers.

PaCMAP runs on the **CPU** and is expensive — an hour or more for large models is normal, not a hang.
Control output via `residual_plot_path`, `residual_plot_title`, `residual_plot_style` in the config.

## The `scrapling` discovery route

When a request needs the live web, hand off to the **`scrapling`** skill and pick its *lightest workable*
mode. Typical heretic discovery tasks:

| Need | What to fetch (via scrapling) |
| :--- | :--- |
| Pick a base model | Hugging Face model pages / search for the target family + size, license, and gate status |
| Avoid duplicate work | Hugging Face `models?other=heretic` (4000+ community heretic models) and other abliterated variants |
| Benchmark baselines | Reported MMLU/GSM8K and refusal/KL numbers from model cards, Reddit r/LocalLLaMA threads, benchmark posts |
| Prior art / technique | Abliteration write-ups (mlabonne, grimjim projected/biprojected abliteration), the Arditi et al. paper |
| Community reception | Reddit/HF discussion of a specific heretic model's quality before you invest a run |

Guardrails carried from `scrapling` and applied here:

- Respect each site's **Terms of Service, `robots.txt`, and rate limits**; prefer official APIs/model
  cards over scraping when available.
- Record a **source URL + observation date** for every quantitative claim (benchmarks shift).
- Never scrape to assemble a dataset whose purpose is producing genuinely harmful/illegal content.

## Responsible research framing

The interpretability features exist to *understand* refusal representations. Keep outputs framed as
alignment/interpretability/red-team research, respect model licenses when publishing findings or weights,
and re-**evaluate** (refusals + KL) any modified model before you rely on or share it.
