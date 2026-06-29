---
name: webtoon-harness
description: >
  Run an end-to-end webtoon production harness — a 27-agent / 4-phase Claude Code agent team that
  takes a single episode from trend research to a finished vertical-scroll viewer. Use when the user
  wants to produce a webtoon episode: research popular webtoon trends, write a dialogue-heavy,
  high-tension, twist-every-episode scenario, render character reference sheets first, render 50+
  panels per episode with in-image speech-bubble (Korean dialogue) baking via codex-image, run a
  generation–validation loop, and assemble a vertical-scroll viewer. Triggers on: webtoon harness,
  make a webtoon, produce a webtoon episode, webtoon scenario to image, next episode, redraw panel,
  stronger twist, webtoon trend research. Web data gathering for the trend-research phase routes
  through the `scrapling` skill. Pure webtoon recommendation/critique is answered directly.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch Agent
compatibility: Requires Claude Code with CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 for agent-team execution, and the codex CLI (ChatGPT OAuth) for parallel panel image rendering (max 5 concurrent codex sessions). Trend-research web extraction uses the scrapling skill (Python 3.10+).
license: MIT
metadata:
  tags: webtoon, agent-team, multi-agent, content-production, codex-image, panel-render, trend-research, scrapling, vertical-scroll, claude-code
  version: "1.0"
  source: https://github.com/revfactory/webtoon-harness
---

# webtoon-harness — Webtoon Production Agent Team

> **Keyword**: `webtoon harness` · `make a webtoon` · `produce a webtoon episode` · `next episode` · `redraw panel`
>
> Respect every source site's terms, robots.txt, rate limits, and copyright when gathering trend
> data, and respect platform/IP rules when publishing generated webtoons.

webtoon-harness packages the [revfactory/webtoon-harness](https://github.com/revfactory/webtoon-harness)
Claude Code harness as an installable jeo-skills plugin. It builds **one webtoon episode** end to end
with **27 specialized agents** organized into **4 phase-rebuilt teams**: research popular trends →
write a dialogue-driven, high-tension, twist-every-episode scenario → render character reference
sheets first → render 50+ panels per episode with in-image speech-bubble baking → run a
generation–validation loop until every panel passes → assemble a vertical-scroll viewer.

**Agent teams require** `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.

## When to use this skill

- Produce a full webtoon episode from trend research to a finished vertical-scroll viewer
- Research webtoon trends: genre/trope momentum, platform rankings, reader reactions, hook/twist reverse-engineering
- Write a dialogue-heavy, high-tension scenario with a twist every episode and a 50+ panel beat sheet
- Render character reference sheets first (the single source of truth for cross-episode consistency)
- Batch-render 50+ panels with in-image Korean speech bubbles baked in, then validate and regenerate
- Assemble panels into a no-overlay vertical-scroll viewer and package a release
- Follow-ups: "next episode", "stronger twist", "redraw panel 23", "re-run only the visual phase"

For pure recommendation or critique ("what should I read?"), answer directly — do not run the harness.

## Install (plugin)

```bash
# Install this routing skill from jeo-skills
npx skills add https://github.com/akillness/jeo-skills --skill webtoon-harness

# Scaffold the full upstream harness (27 agents + 6 skills) into your project's .claude/
bash scripts/install.sh                       # into ./ (current project)
TARGET=/path/to/project bash scripts/install.sh
GLOBAL=1 bash scripts/install.sh              # also install the skill globally (npx skills add -g)
```


The installer is idempotent. It clones `revfactory/webtoon-harness` and copies its `.claude/agents/`
and `.claude/skills/` into the target project so Claude Code can discover the agents and the
`webtoon-orchestrator` entry-point skill. See [references/install.md](references/install.md).

## Execution mode: phase-rebuilt agent teams

Only one team is active per session. For each phase, create a team with `TeamCreate`, run it, then
`TeamDelete` before building the next phase's team. Each team leaves its artifacts under
`_workspace/` so the next team can pick them up with `Read`. Spawn every team member and `Agent`
call with **`model: "opus"`**.

## The 27 agents (4 teams)

| Team | Members | Role |
|------|---------|------|
| **Research** | trend-scout, platform-ranker, audience-analyst, hook-analyst, trend-synthesizer | Genre/trope momentum · platform rankings & serialization structure · reader reactions/drop-off · hook/twist reverse-engineering → one planning brief |
| **Scenario** | concept-architect, worldbuilder, character-designer, series-plotter, twist-master, tension-engineer, episode-outliner, dialogue-writer, script-editor | High-concept · worldbuilding · cast · series arc · twist-per-episode · tension curve · 50+ panel beat sheet · dialogue-driven script · edit pass |
| **Visual** | art-director, ref-sheet-artist, panel-director, letterer, prompt-smith, panel-artist-a/b/c, panel-validator | Style bible & consistency/location/bubble tokens · reference sheets · shot list · lettering · prompt synthesis · parallel panel render · 6-axis validation loop |
| **Assembly & QA** | episode-compositor, quality-reviewer, continuity-manager, showrunner | Vertical-scroll viewer assembly · QA · continuity tracking · sign-off & release packaging |

Full agent roster and outputs → [references/agent-teams.md](references/agent-teams.md).

## Workflow — 6 phases

```text
Phase 0  Context check     — new series vs next episode; reuse world/style/continuity
Phase 1  Prep              — record brief, create _workspace/
Phase 2  Research          — 4 parallel researchers → trend-brief.md   (web data via scrapling)
Phase 3  Scenario          — high-concept → world → cast → arc → {twist, tension} → beatsheet → script_final
Phase 4  Visual            — style bible → reference sheets FIRST → shotlist+lettering → prompts
                             → 50+ panels (codex-image, batches of 5, ≤5 concurrent)
                             ⇄ panel-validator 6-axis validate–regenerate loop → validation.md
Phase 5  Assembly & QA     — no-overlay index.html (bubbles baked into panels) → qa PASS → RELEASE/ep{NN}/
Phase 6  Wrap-up           — continuity update, next-episode seed
```


Detailed dataflow and per-phase outputs → [references/workflow.md](references/workflow.md).

## Trend research via scrapling (Phase 2)

The research team gathers live data — platform rankings, serialization structure, comment-reaction
patterns — and that web extraction routes through the **`scrapling`** skill, not ad-hoc browser
defaults. Pick the lightest workable Scrapling mode (parser-only → HTTP fetch → JS browser → stealth)
and **respect each site's terms, robots.txt, rate limits, and copyright**. Attach a source URL and
observation date to every claim; when sources conflict, record both rather than deleting one.

See [references/trend-research-scrapling.md](references/trend-research-scrapling.md).

## Design principles

- **Dialogue-driven, high-tension, twist-every-episode** — minimize narration; carry tension, info, and reversals through character dialogue and action.
- **50+ panels per episode** — split beats finely to match the vertical-scroll rhythm.
- **Consistency first** — inject reference sheet → consistency token → location token into every prompt; the validator catches md5 duplicates, abrupt background swaps, and broken Korean text.
- **In-image bubble baking** — speech bubbles and Korean dialogue are rendered into the panel PNG, so assembly is a pure ordered image strip with no text overlay (no double captioning).
- **Audit trail** — preserve every intermediate artifact under `_workspace/`; never delete it.

## Follow-up routing

- "next episode" → Phase 0 case 2: reuse world/style/continuity, regenerate from `03_episode` onward.
- "stronger twist" → partial Scenario re-run (twist-master, script-editor) → re-run affected downstream phases.
- "redraw panel N" → partial Visual re-run (prompt-smith reinforce + that panel-artist re-render + panel-validator re-check) → re-assemble.
- Repeated feedback of the same kind (2×+) → propose improving the relevant skill/agent definition (harness evolution); log the change.

## Limits & error handling

| Situation | Handling |
|-----------|----------|
| codex global slowdown (450s+) | Suspect plan limits → check `codex login status`, reduce concurrency, retry |
| Character drift | panel-validator C1 REGEN → reinforce reference anchor / identity marks, re-render |
| Broken Korean text | prompt-smith reinforces quotes/bold/short text → re-render; if still shaky after 3 tries, ACCEPT-FLAG the best version and note it |
| < 50 panels | Ask episode-outliner/panel-director to split more beats |
| Unclear twist (QA REDO) | Feed back to twist-master/script-editor or letterer, re-work |
| Infinite rework | Max 3 regenerations per panel; max 2 rework loops per phase. On overflow, proceed with current state and report the limit |

## References

- [Agent Teams (27 agents)](references/agent-teams.md)
- [Workflow (6 phases & dataflow)](references/workflow.md)
- [Trend Research via scrapling](references/trend-research-scrapling.md)
- [Install / scaffold](references/install.md)
- [revfactory/webtoon-harness](https://github.com/revfactory/webtoon-harness) (MIT)
- [scrapling skill](../scrapling/SKILL.md) · [harness skill](../harness/SKILL.md)
- [Agent Skills Specification](https://agentskills.io/specification)
