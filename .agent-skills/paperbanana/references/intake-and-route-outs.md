# Intake packets and route-outs

Capture one intake packet, then pick the smallest mode. The goal is to spend the
least VLM/image-gen budget that still produces a publication-usable artifact.

## Intake packet fields

| Field | Options | Why it matters |
|-------|---------|----------------|
| Artifact class | methodology diagram · statistical plot · fix/judge an existing figure · many figures · full-paper package | Selects the CLI command |
| Source | method text · paper (`.pdf`/`.md`/`.txt`) · data file (CSV/JSON) · existing image | Decides input flags and whether PDF extra is needed |
| Provider/keys | VLM-only vs image-gen key; which vendor | Plots need only a VLM key; diagrams need an image-gen provider |
| Budget | free-tier vs USD cap | Gates `--optimize`, `--auto`, `--num-candidates`, `--budget` |
| Quality need | quick draft · critic-satisfied · multi-candidate | Sets `--iterations` / `--auto` / `-k` |

## Escalation ladder (smallest first)

1. **Data in, chart out** → `plot` / `plot-batch`. Renders VLM-generated matplotlib; no
   image-generation provider or credentials required. Cheapest mode — start here for any
   tabular result.
2. **One diagram from text/PDF** → `generate`. The full two-phase plan-then-refine pipeline
   for a single methodology/architecture figure.
3. **A figure already exists** → `evaluate` (VLM-as-Judge score) or `polish` (guided image
   edit against a venue style guide). Do not rerun the whole pipeline to nudge one figure.
4. **Many items from a manifest** → `batch` (diagrams) / `plot-batch` (plots), optionally with
   a `composite` section to stitch panels. Sweep one figure across a grid with `sweep`.
5. **A whole paper's figures** → `orchestrate`: parse the paper, plan several method figures
   and data plots, emit a `figure_package.json` + `figures.tex` + `captions.md` bundle.
6. **Wrong tool** → route out (below).

## Route-outs — when PaperBanana is not the right answer

- **Exact, pixel-precise vector art** (logos, precise geometric schematics): use a vector
  editor (Figma, draw.io, Inkscape) or TikZ. Generative image models drift on exact geometry.
- **A trivial chart** (two bars, one line): write the matplotlib/plotly directly; a multi-agent
  loop is pure overhead. `plot` is still fine if the user wants venue styling applied.
- **Brand/design-locked figures** that must match a house style pixel-for-pixel: hand off to a
  designer; the pipeline optimizes for paper aesthetics, not brand compliance.
- **No image-gen budget but a diagram is required**: say so honestly. Only `plot` works
  VLM-only; methodology diagrams need an image-gen provider key.
- **Deterministic, data-bound rendering** (tables, precise numeric plots that must be exact):
  prefer code-generated output; use `evaluate` afterward if you still want a quality score.

Escalate iterations, candidates, and `--optimize` only when a plain run demonstrably
underdelivers — not as a default.
