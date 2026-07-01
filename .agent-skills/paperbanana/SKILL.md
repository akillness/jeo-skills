---
name: paperbanana
description: >
  Route academic-figure work into the lightest workable PaperBanana mode instead of
  jumping straight to a full multi-agent generation run. Use when the user needs
  publication-quality methodology diagrams, statistical plots, figure evaluation,
  polishing an existing figure, batch/sweep generation, or a full-paper figure package
  from text or PDF. Even if the user does not say "paperbanana" — also triggers on:
  academic figure, methodology diagram, publication figure, generate diagram from paper,
  statistical plot from CSV, figure evaluation, polish figure, NeurIPS/ICML figure,
  arxiv illustration, plan-then-refine diagram pipeline.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: Requires Python 3.10+ and works best in a virtual environment. Diagram generation needs an image-gen provider key (OpenAI/Azure/Gemini/Atlas/OpenRouter); statistical plots need only a VLM key. Studio, PDF, and MCP surfaces require extras.
license: MIT
metadata:
  tags: paperbanana, academic-figures, diagram-generation, statistical-plots, multi-agent, vlm-as-judge, mcp, cli, publication, python
  version: "1.0"
  source: https://github.com/llmsresearch/paperbanana
---

# paperbanana — routing-first academic illustration

> **Keyword**: `paperbanana` · `methodology diagram` · `statistical plot` · `figure evaluation` · `plan-then-refine`
>
> This is an unofficial community implementation of the PaperBanana paper (arXiv:2601.23265).
> Respect provider terms, API budgets, and each venue's figure/reuse policies.

PaperBanana turns text or a paper into publication-quality figures with a **two-phase,
multi-agent, plan-then-refine pipeline**. It is most useful when you choose the
**smallest workable mode** instead of always running the full generation loop:

- render data-driven charts with `plot` (matplotlib code, no image-gen key) before spending image credits
- fix an existing figure with `polish` or `evaluate` before regenerating from scratch
- generate a single diagram with `generate` before reaching for batch/sweep/orchestrate
- escalate iterations, candidates, and `--optimize` only on evidence, not by default
- route out to a vector editor, TikZ, or a human designer when generative figures are the wrong tool

## When to use this skill

- The user wants a methodology/architecture diagram from a `.txt`, `.md`, or `.pdf` and you must pick the lightest generation path
- The user has tabular results (CSV/JSON) and wants a chart — cheaper than a diagram because no image-gen provider is needed
- The user already has a figure and wants it judged (`evaluate`) or improved (`polish`) rather than re-created
- The user needs many figures (a manifest batch, a parameter sweep, or a whole-paper figure package)
- The user wants PaperBanana exposed to an agent/IDE via the MCP server or Claude Code skills
- The user keeps drifting toward hand-drawing every figure, hard-coding one provider, or maxing iterations/candidates and needs an honest route-out

## Instructions

### Step 1: Capture one intake packet before choosing a mode

Collect the minimum packet:

- **Artifact class**: a methodology diagram, a statistical plot, an existing figure to fix/judge, many figures, or a full-paper package
- **Source**: raw method text, a paper (`.pdf`/`.md`), a data file (CSV/JSON), or an existing image
- **Budget/keys**: which provider key is available (VLM-only vs image-gen), and any USD cap
- **Quality need**: quick draft vs auto-refine to critic satisfaction vs multi-candidate fan-out

Use this escalation ladder (smallest first):

1. Data → chart? Use `plot` / `plot-batch` (VLM-generated matplotlib, no image-gen key)
2. One diagram from text/PDF? Use `generate`
3. Have a figure already? Use `evaluate` (judge) or `polish` (guided edit), not a fresh run
4. Many diagrams/plots from a manifest? Use `batch` / `plot-batch`; sweep params with `sweep`
5. A whole paper's figure set? Use `orchestrate`
6. Generative figures are the wrong tool (exact vector art, trivial chart, brand-locked design)? Route out

Detailed packet examples and route-outs live in [references/intake-and-route-outs.md](references/intake-and-route-outs.md).

### Step 2: Install only the profile you need

Use a virtual environment unless the user explicitly wants a system install.

bash
bash scripts/install.sh --profile plot      # VLM-only: statistical plots
bash scripts/install.sh --profile diagram   # image-gen provider for diagrams
bash scripts/install.sh --profile pdf        # + PyMuPDF for PDF inputs
bash scripts/install.sh --profile studio     # + Gradio local web UI
bash scripts/install.sh --profile mcp        # MCP server surface
bash scripts/install.sh --profile all        # only when the full surface is truly needed


Then set exactly one provider key (`OPENAI_API_KEY`, `GOOGLE_API_KEY`, `ATLASCLOUD_API_KEY`, …).
Provider selection and config live in [references/providers-and-config.md](references/providers-and-config.md).

### Step 3: Understand the pipeline before turning knobs

Every diagram run is the same plan-then-refine loop, so tune stages instead of guessing flags:

- **Phase 0 — Input Optimization** (`--optimize`, optional): Context Enricher structures raw method text; Caption Sharpener tightens the caption. Two parallel VLM calls.
- **Phase 1 — Linear Planning**: Retriever picks reference examples → Planner writes a target description via in-context learning → Stylist applies venue aesthetics.
- **Phase 2 — Iterative Refinement**: Visualizer renders an image → Critic revises the description; repeat for `--iterations` (default 3) or until satisfied with `--auto`.

Full agent-by-agent detail lives in [references/pipeline-and-agents.md](references/pipeline-and-agents.md).

### Step 4: Run the lightest mode that fits

bash
# Cheapest: statistical plot from data (no image-gen key)
bash scripts/run.sh plot --data results.csv --intent "Bar chart of accuracy across benchmarks"

# Single methodology diagram from text
bash scripts/run.sh generate --input method.txt --caption "Overview of our framework"

# Add optimization + auto-refine ONLY when a plain run underdelivers
bash scripts/run.sh generate --input method.txt --caption "Overview" --optimize --auto


The full command surface (`generate`, `plot`, `batch`, `plot-batch`, `sweep`, `orchestrate`,
`composite`, `evaluate`, `polish`, `venues`, `studio`, `setup`, `data`) with flags lives in
[references/modes-and-cli.md](references/modes-and-cli.md).

### Step 5: Fix before you regenerate

When a figure already exists, do not rerun the whole pipeline:

bash
# Judge an existing figure against a human reference (VLM-as-Judge)
bash scripts/run.sh evaluate --generated out.png --reference human.png \
  --context method.txt --caption "Overview of our framework"

# Guided edit against a venue style guide (image-edit capable provider)
bash scripts/run.sh polish --input figure.png --venue icml --iterations 2


Evaluation dimensions (Faithfulness, Readability, Conciseness, Aesthetics) and venue style packs
live in [references/evaluation-and-venues.md](references/evaluation-and-venues.md).

### Step 6: Escalate to batch, sweep, or orchestrate only when scale is the real problem

- `batch` / `plot-batch` — many items from one manifest; optional `composite` stitches panels into one labeled figure
- `sweep` — the same figure across a parameter grid, ranked by a quality proxy score
- `orchestrate` — parse a full paper, plan multiple method figures + data plots, emit a `figure_package.json` + `figures.tex` bundle

For one or two figures, single-shot `generate`/`plot` stays simpler and cheaper.

### Step 7: Expose it to agents only when a script is not the point

Use the MCP server (11 tools: `generate_diagram`, `generate_plot`, `continue_run`, `evaluate_diagram`,
`orchestrate_figures`, `batch_diagrams`, `batch_plots`, `download_references`, …) or the bundled Claude
Code skills (`/generate-diagram`, `/generate-plot`, `/evaluate-diagram`) when the goal is agent/IDE
access rather than a bespoke run.

bash
bash scripts/run-mcp.sh   # stdio MCP server via uvx --from paperbanana[mcp]


## Examples

### Example 1: The user has a CSV and wants a chart
Use `plot` (or `plot-batch`) — it renders matplotlib from a VLM and needs no image-gen key, so it is the cheapest path.

### Example 2: The user has one method paragraph and wants a diagram
Use `generate` with a clear `--caption`; add `--optimize`/`--auto` only if the first pass underdelivers.

### Example 3: The user already has a figure that is "almost right"
Use `polish` (guided edit) or `evaluate` (judge), not a fresh `generate` run.

### Example 4: The user wants every figure in a paper regenerated
Use `orchestrate` on the paper source; inspect `orchestration_plan.json` with `--dry-run` before spending credits.

### Example 5: The user wants an agent to make figures on demand
Expose the MCP server or the Claude Code skills instead of hand-writing a one-off script.

### Example 6: The figure is a trivial two-bar chart or exact vector art
Route out to plain matplotlib, TikZ, or a vector editor — a multi-agent generative run is overkill or the wrong tool.

## Best practices

1. Start with the smallest mode (`plot` < `generate` < `batch`/`sweep`/`orchestrate`) and escalate only on evidence.
2. Prefer `plot` for data — it skips the image-gen provider entirely and costs less.
3. Fix existing figures with `polish`/`evaluate` before paying for a full regeneration.
4. Treat `--optimize`, `--auto`, `--iterations`, and `--num-candidates` as cost dials — raise them only when a plain run falls short.
5. Pick the cheapest provider that meets quality (Gemini/Atlas VLMs are low cost); the pipeline is provider-agnostic.
6. Use venue style packs (`neurips`, `icml`, `acl`, `ieee`, or a custom pack) instead of hand-tuning aesthetics per run.
7. Judge with the VLM-as-Judge `evaluate` command before claiming a figure is publication-ready.
8. Route out honestly to matplotlib/TikZ/vector editors or a human designer when generative figures are the wrong tool.

## References

- [references/intake-and-route-outs.md](references/intake-and-route-outs.md)
- [references/pipeline-and-agents.md](references/pipeline-and-agents.md)
- [references/modes-and-cli.md](references/modes-and-cli.md)
- [references/providers-and-config.md](references/providers-and-config.md)
- [references/evaluation-and-venues.md](references/evaluation-and-venues.md)
- [scripts/install.sh](scripts/install.sh)
- [scripts/run.sh](scripts/run.sh)
- [scripts/run-mcp.sh](scripts/run-mcp.sh)
- [PaperBanana GitHub Repository](https://github.com/llmsresearch/paperbanana)
- [PaperBanana paper (arXiv:2601.23265)](https://arxiv.org/abs/2601.23265)
