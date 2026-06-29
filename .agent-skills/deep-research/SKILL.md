---
name: deep-research
description: >
  Routing front door for a structured, human-in-the-loop deep-research workflow
  (Weizhena/Deep-Research-skills). Turns any topic into an extensible outline,
  fans out parallel web-search agents to investigate each item into validated
  JSON, then renders a complete markdown report. One skill, 4 reference
  pipelines: outline (research / add-items / add-fields), deep (parallel
  per-item investigation + field-coverage validation), report (TOC + per-field
  markdown), and web-search (the research agent with 5 routed source modules:
  github-debug, general-web, academic-papers, chinese-tech, stackoverflow).
  Classifies the request into a phase, loads that pipeline, and executes with
  its exact prompt templates and output contracts.
  Triggers on: deep research, structured research, research outline, research a
  topic, survey, benchmark review, literature review, competitor analysis, due
  diligence, technology comparison, build a research report, fan out research,
  parallel web search, /research, /research-deep, /research-report.
  Inspired by RhinoInsight (arXiv:2511.18743).
allowed-tools: Read Write Edit Bash Grep Glob WebSearch WebFetch Task
compatibility: >
  Universal — every pipeline is plain Markdown instructions. The deep and
  report phases run two small Python helpers (validate_json.py needs PyYAML;
  the report generator is emitted per-run), so those phases need Python 3 +
  pyyaml. Web search uses each agent's native WebSearch (OpenCode requires
  OPENCODE_ENABLE_EXA=1). Works in Claude Code, Codex, Gemini CLI, OpenCode,
  Cursor, Copilot. Plugin-installable via `npx skills add`.
metadata:
  tags: deep-research, structured-research, research-outline, web-search, literature-review, benchmark, competitor-analysis, due-diligence, parallel-agents, report-generation, human-in-the-loop
  platforms: Claude, Codex, Gemini, Cursor, Copilot, OpenCode, All
  keyword: deep-research
  version: "1.0.3"
  upstream: https://github.com/Weizhena/Deep-Research-skills
  source: akillness/jeo-skills
  license: MIT
---

# deep-research

A routing-first front door for the **Deep Research** workflow from
[Weizhena/Deep-Research-skills](https://github.com/Weizhena/Deep-Research-skills)
— a two-phase, human-in-the-loop research method (outline generation, then deep
investigation) consolidated into one jeo-skill with **4 reference pipelines**.
Each pipeline ships its own prompt templates and output contract; this skill
classifies the request into the right phase, loads that pipeline, and executes
it exactly.

> One topic → one extensible outline → parallel per-item investigation into
> validated JSON → one complete markdown report. Every phase has a user
> checkpoint, so you keep precise control at each stage instead of handing the
> model a black-box "research X" prompt.

The reference pipelines hold the **dismantled-and-merged upstream skill text**
(per-command frontmatter stripped, headings nested, prompt templates kept
verbatim) — not a paraphrase — so each phase is self-contained here. Read the
matching pipeline reference before executing:
- [references/outline-pipeline.md](references/outline-pipeline.md) — `/research` · `/research-add-items` · `/research-add-fields` (Phase 1: generate + extend the outline)
- [references/deep-pipeline.md](references/deep-pipeline.md) — `/research-deep` (Phase 2: parallel per-item investigation + `validate_json.py` coverage gate)
- [references/report-pipeline.md](references/report-pipeline.md) — `/research-report` (Phase 3: TOC + per-field markdown report)
- [references/web-search-pipeline.md](references/web-search-pipeline.md) — the web-search agent + 5 routed source modules (github-debug · general-web · academic-papers · chinese-tech · stackoverflow)

## Plugin Installation
```bash
# This routing skill via jeo-skills (verified path)
npx skills add https://github.com/akillness/jeo-skills --skill deep-research

# Global install for one or more agents
npx skills add -g https://github.com/akillness/jeo-skills --skill deep-research -a claude-code -a codex -y

# Scripted install with knobs (Python dep + upstream slash-command skills)
WITH_DEPS=1 AGENTS="claude-code,codex" bash .agent-skills/deep-research/scripts/install.sh
```


The deep phase calls `scripts/validate_json.py` (needs `pip install pyyaml`).
The upstream repo also ships ready-made slash commands for Claude Code, OpenCode,
and Codex — `WITH_UPSTREAM=1 bash scripts/install.sh` clones and copies them.

## When to use this skill

- The user wants to research a *set of comparable things* (models, papers,
  tools, companies, products) along *consistent fields*, not a single Q&A
- The task is a survey / benchmark review / literature review / competitor
  analysis / due diligence that benefits from a structured outline first
- The user wants parallel, source-cited investigation that lands in a shareable
  markdown report with a table of contents

## When not to use this skill

- A one-off factual question or single-source lookup → just use web search
- Full academic research-to-publication with citation gates and reviewer rounds → use `academic-research`
- Multi-agent build/verify orchestration of code → use `omc` / `omx` / `ohmg`
- Token-efficient code discovery inside a repo → use `semble`
- Karpathy-style autonomous ML experiment search → use `autoresearch`

## Required intake packet

Before routing, identify:
1. **Phase** — outline · deep · report (which stage of the workflow)
2. **Topic** — the research subject (becomes `{topic}` and the `{topic_slug}/` working dir)
3. **Working dir** — existing `{topic_slug}/` with `outline.yaml` + `fields.yaml`, or new
4. **Time range** — for web-search supplementation (e.g. last 6 months, since 2024, unlimited)
5. **Output target** — the outline files, the per-item JSON, or the final `report.md`

## Phase Routing Table

| What the user says | Phase | Pipeline |
|---|---|---|
| "research X", "survey X", "give me a research outline for X", "compare these tools/models" | outline | `/research` → outline-pipeline.md |
| "add more items", "I'm missing some objects", "include X and Y too" | outline | `/research-add-items` → outline-pipeline.md |
| "add more fields", "also collect pricing/latency", "more dimensions" | outline | `/research-add-fields` → outline-pipeline.md |
| "now go deep", "investigate each one", "fill in the details", "run the research" | deep | `/research-deep` → deep-pipeline.md |
| "make the report", "summarize results", "generate report.md", "give me the writeup" | report | `/research-report` → report-pipeline.md |
| "how should the agent search", "which sources", "debug/academic/Chinese sources" | web-search | web-search-pipeline.md |

## Instructions

### Step 1: Pick the phase

Classify the request against the routing table. State the chosen **phase →
command** explicitly before producing output (e.g. "outline → /research"). If a
`{topic_slug}/outline.yaml` already exists in the working directory, default to
the next unfinished phase (outline → deep → report) unless the user asks to
extend the outline.

### Step 2: Load the pipeline

Read the matching reference file and follow its workflow and prompt templates:

```
outline      → references/outline-pipeline.md
deep         → references/deep-pipeline.md
report       → references/report-pipeline.md
web-search   → references/web-search-pipeline.md
```


Every per-item / supplement search delegates to the **web-search agent** —
always load `web-search-pipeline.md` and the relevant source module(s) before
calling WebSearch.

### Step 3: Execute with the pipeline's discipline

- **Hard constraint on prompt templates**: the outline and deep pipelines define
  prompt templates that must be reproduced verbatim — only substitute `{xxx}`
  variables; never edit structure or wording.
- **Human-in-the-loop**: confirm with the user at each `AskUserQuestion` gate
  (items, fields, time range, batch size, TOC fields) before moving on. Run deep
  research batch-by-batch with approval between batches.
- **Evidence-first**: every supplemented item/field and every per-item JSON must
  carry source links. Mark unknowns `[uncertain]` and list them in the
  `uncertain` array — never fabricate a value.
- **Validate before done**: a deep-phase item is complete only after
  `validate_json.py` passes (full required-field coverage).

### Step 4: Return the phase's output packet

| Phase | Output |
|---|---|
| outline | `{topic_slug}/outline.yaml` (items + execution config) and `{topic_slug}/fields.yaml` (field definitions), shown for confirmation |
| deep | One `{output_dir}/{item_slug}.json` per item (validated), plus a completion summary (done / failed / uncertain counts) |
| report | `{topic_slug}/generate_report.py` and `{topic_slug}/report.md` (TOC with anchor links + chosen summary fields, then per-field-category detail) |

Close with a one-line **Next step** pointing to the next phase (outline →
`/research-deep`; deep → `/research-report`).

## Integrity principles

- **No fabrication**: every item, field value, and finding needs a source;
  unverifiable values are marked `[uncertain]`, not invented.
- **Verbatim prompts**: the upstream prompt templates are a hard contract —
  substitute variables only.
- **Human checkpoints**: outline contents, time range, batch size, and TOC
  fields are confirmed with the user, not assumed.
- **Coverage gate**: deep-phase JSON must pass `validate_json.py` before an item
  counts as done.

## Route-out map

| If the user needs… | Route to |
|---|---|
| Research-to-publication with citation gates + reviewer rounds | `academic-research` |
| Autonomous ML experiment search (Karpathy-style) | `autoresearch` |
| Token-efficient code search across a repo | `semble` |
| Multi-agent build/verify orchestration | `omc` / `omx` / `ohmg` |
| Persistent knowledge capture / wiki | `llm-wiki` / `okf` / `obsidian` |
| Editable diagrams / charts as artifacts | `drawio` / `mermaid` / `slides-grab` |
