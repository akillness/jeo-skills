# CLI command surface

All commands are `paperbanana <command>`. Outputs default to `outputs/run_<timestamp>/`
with `final_output.png`, all intermediate iterations, and metadata.

## `generate` — methodology diagrams

bash
paperbanana generate --input method.txt --caption "Overview of our framework"
paperbanana generate --input method.txt --caption "Overview" --optimize --auto
paperbanana generate --continue --feedback "Make arrows thicker"
paperbanana generate --continue-run run_20260218_125448_e7b876 --iterations 3
paperbanana generate --input paper.pdf --caption "Overview" --pdf-pages "3-8"
paperbanana generate --input method.txt --caption "Overview" --image sketch.png


Key flags: `--input/-i`, `--caption/-c`, `--image` (reference/sketch, repeatable),
`--output/-o`, `--iterations/-n` (default 3), `--num-candidates/-k` (1–8),
`--auto` + `--max-iterations` (default 30), `--optimize`, `--continue`,
`--continue-run`, `--feedback`, `--pdf-pages`, `--vlm-provider`, `--vlm-model`
(default `gpt-5.2`), `--image-provider`, `--image-model` (default `gpt-image-1.5`),
`--format/-f` (png/jpeg/webp), `--config`, `--verbose/-v`, `--progress-json`.

## `plot` — statistical plots (VLM-only, no image-gen key)

bash
paperbanana plot --data results.csv --intent "Bar chart comparing accuracy across benchmarks"


Flags: `--data/-d` (CSV/JSON, required), `--intent` (required), `--output/-o`,
`--iterations/-n`, `--vlm-provider`, `--vlm-model`. Rendered via VLM-generated
matplotlib — no image-generation provider or credentials required.

## `batch` — many diagrams from a manifest

bash
paperbanana batch --manifest examples/batch_manifest.yaml --optimize
paperbanana batch-report --batch-dir outputs/batch_2026..._abc --format markdown


Manifest is YAML/JSON with an `items` list (`input`, `caption`, `id`, optional
`pdf_pages`); paths resolve relative to the manifest. An optional `composite` section
(`layout`, `labels`, `spacing`, `label_position`, `output`) auto-stitches panels.
Outputs under `outputs/batch_<id>/run_<id>/` plus `batch_report.json`
(`batch_kind: methodology`). Flags: `--manifest/-m`, `--output-dir/-o`, `--config`,
`--iterations/-n`, `--optimize`, `--auto`, `--format/-f`, `--auto-download-data`.

## `plot-batch` — many plots from a manifest

bash
paperbanana plot-batch --manifest examples/plot_batch_manifest.yaml --optimize


Manifest `items` carry `data` + `intent` (mirroring `plot`), optional per-item
`aspect_ratio`. `batch_kind: statistical_plot`. Adds `--venue`, `--aspect-ratio/-ar`,
`--save-prompts/--no-save-prompts` on top of the batch flags.

## `sweep` — parameter grid for one figure

bash
paperbanana sweep --manifest examples/sweep_manifest.yaml
paperbanana sweep-report --sweep-dir outputs/sweep_..._abc --format html


Stores the full sweep plan as YAML/JSON (mutually exclusive with axis flags). Reports
rank variants by a `quality_proxy_score`.

## `orchestrate` — full-paper figure package

bash
paperbanana orchestrate --paper paper.pdf --data-dir ./results \
  --max-method-figures 4 --max-plot-figures 3 --optimize


Parses the paper, plans method figures from section structure, optionally plans plots
from CSV/JSON in `--data-dir`, and writes `figure_package.json`, `figures/`,
`figures.tex`, `captions.md`. Use `--dry-run` to inspect `orchestration_plan.json`
without API calls; `--resume-orchestrate <id>` to continue from checkpoint.

## `composite` — stitch panels

bash
paperbanana composite a.png b.png c.png --layout 1x3 --output figure2.png


Pure image op, no API calls. Flags: `--layout/-l` (`RxC` or `auto`), `--labels`
(auto `(a),(b),…` or `none`), `--spacing/-s`, `--label-position`, `--label-font-size`.

## `evaluate` — quality assessment (VLM-as-Judge)

bash
paperbanana evaluate --generated diagram.png --reference human.png \
  --context method.txt --caption "Overview of our framework"


Scores Faithfulness, Readability (primary) and Conciseness, Aesthetics (secondary),
aggregated hierarchically. Flags: `--generated/-g`, `--reference/-r`, `--context`,
`--caption/-c`, `--pdf-pages`.

## `polish` — refine an existing figure

bash
paperbanana polish --input figure.png --venue icml --iterations 2 --output polished.png


A VLM audits the figure against the venue style guide, proposes up to 10 concrete edits,
and an image-edit provider applies them. Needs an image-edit provider (Gemini image
models). Flags: `--input/-i`, `--output/-o`, `--venue`, `--iterations/-n`,
`--aspect-ratio/-ar`, `--num-candidates/-k`, `--budget`, `--seed`.

## `venues`, `studio`, `setup`, `data`

bash
paperbanana venues init mylab   # scaffold a custom venue style pack
paperbanana venues list         # built-in (neurips/icml/acl/ieee) + user packs
paperbanana studio              # local Gradio UI (needs paperbanana[studio])
paperbanana setup               # interactive Gemini key wizard
paperbanana data download --task both   # PaperBananaBench reference set (~254 MB)


Custom venue packs live under `~/.config/paperbanana/venues/` (override with
`--venue-dir` / `PAPERBANANA_VENUE_DIR`). Built-in packs win on name clash.
