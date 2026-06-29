# Agent Teams — 27 agents in 4 phase-rebuilt teams

Only one team is active per session. Build each phase's team with `TeamCreate`, run it, then
`TeamDelete` before the next phase. Artifacts persist under `_workspace/` so the next team reads them.
Spawn every member with `model: "opus"`.

Adapted from [revfactory/webtoon-harness](https://github.com/revfactory/webtoon-harness) (`.claude/agents/`).

## Research team (5) — 4 investigators → 1 synthesizer

| Agent | Role | Skill | Output |
|-------|------|-------|--------|
| `trend-scout` | Genre/trope momentum & lifecycle | webtoon-trend-research | `01_research/trend-scout.md` |
| `platform-ranker` | Platform rankings & serialization structure | webtoon-trend-research | `01_research/platform-ranker.md` |
| `audience-analyst` | Reader demographics, immersion, drop-off | webtoon-trend-research | `01_research/audience-analyst.md` |
| `hook-analyst` | Hook / cliffhanger / twist reverse-engineering | webtoon-trend-research | `01_research/hook-analyst.md` |
| `trend-synthesizer` | Consolidated planning brief | webtoon-trend-research | `01_research/trend-brief.md` |

Web data gathering for this team routes through the **scrapling** skill — see
[trend-research-scrapling.md](trend-research-scrapling.md).

## Scenario team (9) — concept → final script

| Agent | Role | Skill | Output |
|-------|------|-------|--------|
| `concept-architect` | High-concept / logline | webtoon-scenario | `02_story/concept.md` |
| `worldbuilder` | World & rules | webtoon-scenario | `02_story/world.md` |
| `character-designer` | Cast (appearance + personality + arc) | webtoon-scenario | `02_story/characters.md` |
| `series-plotter` | Series arc & episode map | webtoon-scenario | `02_story/series-arc.md` |
| `twist-master` | Twist-per-episode design | webtoon-scenario | `02_story/twist-plan.md` |
| `tension-engineer` | Tension curve & cliffhangers | webtoon-scenario | `02_story/tension-curve.md` |
| `episode-outliner` | Episode beat sheet (50+ panels) | webtoon-scenario | `03_episode/ep{NN}_beatsheet.md` |
| `dialogue-writer` | Dialogue-driven script | webtoon-scenario | `03_episode/ep{NN}_script.md` |
| `script-editor` | Edit pass, twist clarity | webtoon-scenario | `03_episode/ep{NN}_script_final.md` |

Guarantee a twist every episode and a 50+ panel beat sheet.

## Visual team (9) — references first + generation–validation loop

| Agent | Role | Skill | Output |
|-------|------|-------|--------|
| `art-director` | Style bible, consistency/location/bubble tokens | webtoon-panel-breakdown | `04_visual/style-bible.md`, `character-sheets.md` |
| `ref-sheet-artist` | Character multi-angle/expression reference sheets (before panels) | webtoon-panel-render | `04_visual/refs/*.png`, `refs/INDEX.md` |
| `panel-director` | 50+ panel shot list (scene_id/location) | webtoon-panel-breakdown | `04_visual/ep{NN}_shotlist.md` |
| `letterer` | In-image speech-bubble/dialogue bake spec | webtoon-assembly | `04_visual/ep{NN}_lettering.md` |
| `prompt-smith` | Per-panel codex prompts (bake + location + reference anchor) | webtoon-panel-render | `04_visual/ep{NN}_prompts.md` |
| `panel-artist-a` | Render scene group A | webtoon-panel-render | `05_panels/ep{NN}/panel_*.png` |
| `panel-artist-b` | Render scene group B | webtoon-panel-render | `05_panels/ep{NN}/panel_*.png` |
| `panel-artist-c` | Render scene group C | webtoon-panel-render | `05_panels/ep{NN}/panel_*.png` |
| `panel-validator` | 6-axis validate–regenerate gatekeeper | webtoon-panel-render | `04_visual/ep{NN}_validation.md` |

Reference sheets are rendered **first** as the single source of truth for cross-episode appearance
consistency. The 3 panel-artists render in parallel (batches of 5, ≤5 concurrent codex sessions).

### panel-validator — 6 validation axes

1. **C1 Character consistency** — appearance matches reference sheet / identity marks
2. **C2 Background/location continuity** — same scene keeps the same setting (location tokens)
3. **C3 Text integrity** — baked Korean dialogue is legible and unbroken
4. **C4 Duplication** — no md5-identical panels
5. **C5 Composition** — bubbles don't cover faces/key art; reading order holds
6. **C6 Spec match** — panel matches shot list + lettering spec

Verdicts: `ACCEPT`, `REGEN` (with fix instructions), or `ACCEPT-FLAG` (best available after 3 tries,
limitation noted). Max 3 regenerations per panel.

## Assembly & QA team (4) — assemble → release

| Agent | Role | Skill | Output |
|-------|------|-------|--------|
| `episode-compositor` | Vertical-scroll viewer assembly | webtoon-assembly | `06_assembly/ep{NN}/index.html` |
| `quality-reviewer` | QA review | webtoon-assembly | `06_assembly/ep{NN}/qa_report.md` |
| `continuity-manager` | Cross-episode continuity | webtoon-assembly | `06_assembly/continuity.md` |
| `showrunner` | Sign-off & packaging | webtoon-assembly | `RELEASE/ep{NN}/` |

Bubbles are baked into the panel PNGs, so assembly is a pure ordered image strip with **no text
overlay** (no double captioning). If a baked bubble is broken, request a re-render — do not overlay.
