# Workflow — 6 phases & dataflow

Adapted from the `webtoon-orchestrator` skill in
[revfactory/webtoon-harness](https://github.com/revfactory/webtoon-harness).

## Dataflow

```text
trend-brief.md
  └→ concept → world → characters → series-arc → {twist-plan, tension-curve}
                                                   └→ beatsheet → script → script_final
script_final + characters
  └→ style-bible (+ location tokens, bubble convention) / character-sheets
       └→ refs/*.png  (reference sheets, rendered BEFORE panels)
       └→ shotlist (scene_id/location) + lettering (in-image bubble spec)
            └→ prompts (style + location + reference anchor + bubble bake, scenes A/B/C)
                 └→ panel_*.png  ⇄  panel-validator 6-axis validate–regenerate loop
                      └→ validation.md (all panels pass)
panel_*.png (bubbles baked) → index.html (no overlay) → qa_report → RELEASE/ep{NN}/
```


## Phase 0 — Context check (detect follow-up mode)

Decide the run mode from whether `_workspace/` exists and what the user asked:

1. `_workspace/` absent → **fresh run**. Go to Phase 1.
2. `_workspace/` exists + "next episode" → **new episode**. Increment `{NN}`; reuse `02_story`,
   `style-bible`, `character-sheets`, **`refs/`** (reference sheets — never re-render, series
   consistency), and `continuity.md`; regenerate only from `03_episode` onward.
3. `_workspace/` exists + "redo only X of this episode" → **partial re-run**. Rebuild only that
   phase's team and overwrite only its output; re-run downstream stages (e.g. script change →
   shotlist → render → assemble) only as far as the change propagates.
4. `_workspace/` exists + new planning input → **new project**. Move existing `_workspace/` to
   `_workspace_{YYYYMMDD_HHMMSS}/`, then Phase 1.

For partial/new-episode re-runs, include prior output paths in member prompts and instruct
"Read first, then apply only the improvements."

## Phase 1 — Prep

Record the brief and create the `_workspace/` directory tree (`01_research/`, `02_story/`,
`03_episode/`, `04_visual/`, `05_panels/`, `06_assembly/`, `RELEASE/`).

## Phase 2 — Research

Build the 5-member research team. 4 investigators gather in parallel (web extraction via the
**scrapling** skill — see [trend-research-scrapling.md](trend-research-scrapling.md)), then
`trend-synthesizer` consolidates into `01_research/trend-brief.md`. Every claim carries a source URL
and observation date; conflicting sources are both recorded.

## Phase 3 — Scenario

Build the 9-member scenario team. From high-concept → world → cast → series arc, design the twist
plan and tension curve in parallel, then converge beat sheet → script → `script_final`. **Guarantee a
twist every episode and a 50+ panel beat sheet.**

## Phase 4 — Visual

Build the 9-member visual team:

1. `art-director` writes the style bible + consistency/location/bubble tokens and character sheets.
2. `ref-sheet-artist` renders character reference sheets **first** (the consistency SSOT).
3. `panel-director` writes the 50+ panel shot list; `letterer` writes the in-image bubble spec.
4. `prompt-smith` synthesizes per-panel codex prompts (style + location token + reference anchor +
   bubble bake).
5. `panel-artist-a/b/c` render in parallel via `codex-image` — batches of 5, **≤5 concurrent codex
   sessions**.
6. `panel-validator` runs the 6-axis validate–regenerate loop until all panels pass →
   `validation.md`. Max 3 regenerations per panel.

## Phase 5 — Assembly & QA

Build the 4-member assembly team. `episode-compositor` assembles panels into a vertical-scroll
`index.html` using the no-dependency viewer template — **no text overlay**, since bubbles are baked
into the PNGs. `quality-reviewer` runs QA, `continuity-manager` updates `continuity.md`, and
`showrunner` signs off and packages `RELEASE/ep{NN}/`.

## Phase 6 — Wrap-up

Update continuity, emit the next-episode seed, and report any flagged panels / limits hit.

## Requirements

- **Claude Code** with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` (agent-team runtime).
- **codex CLI** (`codex exec` `image_generation` tool, ChatGPT OAuth) for parallel panel rendering;
  keep global concurrency at **≤5** codex sessions. See the upstream `codex-cli` skill.
- **scrapling** skill (Python 3.10+) for Phase 2 web extraction.
