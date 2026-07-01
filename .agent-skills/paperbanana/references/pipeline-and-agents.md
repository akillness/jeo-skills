# The two-phase, multi-agent pipeline

PaperBanana's core philosophy is **plan-then-refine with a critic**: separate a
linear planning stage (cheap, text-only reasoning) from an iterative refinement
loop (expensive, image-generating), and let a Critic close the loop. Up to 7
specialized agents run per diagram.

## Phase 0 — Input Optimization (optional, `--optimize`)

Two parallel VLM calls prepare the inputs before any planning:

- **Context Enricher** — structures raw methodology text into diagram-ready form:
  components, flows, groupings, inputs/outputs.
- **Caption Sharpener** — rewrites a vague caption into a precise visual specification.

Skip this for already-clean inputs; enable it when the source text is messy or the
caption is underspecified.

## Phase 1 — Linear Planning (text-only, cheap)

1. **Retriever** — selects the most relevant reference examples from a curated set of
   13 methodology diagrams (spanning agent/reasoning, vision/perception,
   generative/learning, science/applications). This is retrieval-augmented in-context
   learning: the model plans from concrete good examples, not from a blank prompt.
2. **Planner** — writes a detailed textual description of the target diagram via
   in-context learning from the retrieved examples.
3. **Stylist** — refines the description for visual aesthetics using venue guidelines
   (color palette, layout, typography — NeurIPS-style by default).

Because Phase 1 is text-only, it is cheap; get the plan right here before spending
image credits in Phase 2.

## Phase 2 — Iterative Refinement (image-generating, expensive)

4. **Visualizer** — renders the current description into an image.
5. **Critic** — evaluates the generated image against the source context and returns a
   revised description addressing any issues.
6. Steps 4–5 repeat for `--iterations` rounds (default 3), or until the Critic is
   satisfied when `--auto` is set (bounded by `--max-iterations`, default 30).

`--num-candidates N` (1–8) fans out Phase 2 into N parallel candidates with seed
offsets; planning still runs once. Outputs land in `candidates/cand_<i>/`.

## Statistical plots take a shortcut

`plot` reuses the same plan-then-refine idea but the Visualizer emits **matplotlib code**
that is executed locally — so plots need only a VLM key, never an image-generation
provider. This is why plots are the cheapest mode.

## Continuation and progress

- `continue_run` / `--continue` resumes a prior `run_*` with optional `--feedback`, so the
  Critic incorporates human direction instead of restarting.
- `generate()` / `continue_run()` accept a `progress_callback` receiving
  `PipelineProgressEvent` objects (stage, message, seconds, iteration) for live UIs/logs.

## Transferable idea

The reusable pattern for any generation task: **retrieve good examples → plan in text →
render → critique → loop**, keep the cheap text stage separate from the expensive render
stage, and gate cost dials (`--optimize`, `--auto`, `--iterations`, `-k`) behind evidence.
