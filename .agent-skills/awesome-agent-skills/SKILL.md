---
name: awesome-agent-skills
description: >
  Routing front door for the Awesome Agent Skills collection — 18 expert-persona
  skills plus a self-improving optimizer, grouped into 6 reference pipelines:
  coding (python-expert, debugger, fullstack-developer), research
  (deep-research, fact-checker, academic-researcher), writing (technical-writer,
  content-creator, editor, email-drafter, meeting-notes), planning (project-planner,
  sprint-planner, strategy-advisor, decision-helper, ux-designer), data
  (data-analyst, visualization-expert), and self-improving (ADK multi-agent skill
  optimizer). Classifies the request, picks the pipeline + persona, then executes
  with that persona's framework and output format.
  Triggers on: awesome agent skills, agent skill, debug, fullstack,
  python expert, deep research, fact check, academic research, technical writing,
  content creation, proofread, email draft, meeting notes, project plan, sprint plan,
  strategy, decision matrix, UX design, data analysis, data visualization, optimize a skill.
  Plugin (upstream): `npx skills add shubhamsaboo/awesome-agent-skills`
allowed-tools: Read Write Edit Bash Grep Glob WebFetch
compatibility: >
  Universal — every persona is pure Markdown instructions with no runtime
  dependencies, so it works in any skills-compatible agent (Claude Code, Codex,
  Gemini CLI, OpenCode, Cursor, Copilot). The self-improving pipeline's full app
  (FastAPI + Google ADK + Gemini) needs Python and a Gemini API key; the routing
  guidance for it works everywhere. Plugin-installable via `npx skills add`.
metadata:
  tags: awesome-agent-skills, agent-skills, debugging, fullstack, python, deep-research, fact-check, academic, technical-writing, content, editing, email, meeting-notes, project-planning, sprint, strategy, decision, ux, data-analysis, visualization, skill-optimization
  platforms: Claude, Codex, Gemini, Cursor, Copilot, OpenCode, All
  keyword: awesome-agent-skills
  version: "1.0.0"
  upstream: https://github.com/Shubhamsaboo/awesome-llm-apps/tree/main/awesome_agent_skills
  source: akillness/jeo-skills
  license: MIT
---

# awesome-agent-skills

A routing-first front door for the **Awesome Agent Skills** collection from
[Shubhamsaboo/awesome-llm-apps](https://github.com/Shubhamsaboo/awesome-llm-apps/tree/main/awesome_agent_skills)
— 18 expert-persona skills plus a self-improving optimizer, consolidated into one
jeo-skill with **6 reference pipelines**. Each persona ships its own framework and
output format; this skill classifies the request, picks the right pipeline and
persona, then executes with that persona's discipline.

> One skill, many experts. Instead of 19 loose skill folders competing for trigger
> matches, this front door routes deterministically: identify the work type → pick
> the pipeline → load the persona's framework → produce the persona's output packet.

Read the matching pipeline reference before executing:
- [references/coding-pipeline.md](references/coding-pipeline.md) — python-expert · debugger · fullstack-developer
- [references/research-pipeline.md](references/research-pipeline.md) — deep-research · fact-checker · academic-researcher
- [references/writing-pipeline.md](references/writing-pipeline.md) — technical-writer · content-creator · editor · email-drafter · meeting-notes
- [references/planning-pipeline.md](references/planning-pipeline.md) — project-planner · sprint-planner · strategy-advisor · decision-helper · ux-designer
- [references/data-pipeline.md](references/data-pipeline.md) — data-analyst · visualization-expert
- [references/self-improving-pipeline.md](references/self-improving-pipeline.md) — ADK multi-agent skill optimizer

## Plugin Installation

```bash
# This routing skill via jeo-skills (verified path)
npx skills add https://github.com/akillness/jeo-skills --skill awesome-agent-skills

# Global install for one or more agents
npx skills add -g https://github.com/akillness/jeo-skills --skill awesome-agent-skills -a claude-code -a codex -y

# Upstream full collection (all 20 folders, upstream-documented command)
npx skills add shubhamsaboo/awesome-agent-skills
```


The upstream skills follow the open [Agent Skills specification](https://agentskills.io/specification) — plain `SKILL.md` files with YAML frontmatter, usable in Claude Desktop, Cursor/VSCode, custom agents, and frameworks like LangChain or AutoGen.

## When to use this skill

- The user asks for work that maps to an expert persona (review my code, debug this, research X, write docs, draft an email, plan a sprint, make a decision matrix, design a user flow, analyze this dataset)
- You want a consistent framework + output format for a common knowledge-work task
- The user wants to optimize/improve an existing agent skill (→ self-improving pipeline)

## When not to use this skill

- The task is a multi-agent orchestration run (build/verify loop) → use `omc` / `omx` / `ohmg`
- The task is a full academic research-to-publication pipeline with citation gates → use `academic-research`
- The task is spec-first execution with frozen acceptance criteria → use `ooo` / `spec-stack`
- The task is token-efficient code discovery in a repo → use `semble`
- The persona overlaps a deeper jeo-skill (see Route-out map) → prefer the dedicated skill

## Required intake packet

Before routing, identify:
1. **Pipeline** — coding · research · writing · planning · data · self-improving
2. **Persona** — the specific expert within that pipeline (routing table below)
3. **Input** — the code, claim, topic, document, dataset, or skill folder to work on
4. **Output target** — the persona's default format, or a user-specified one (PR comment, README, abstract, decision matrix, chart spec, …)

## Pipeline & Persona Routing Table

| What the user says | Pipeline | Persona |
|---|---|---|
| "debug this", "why is this broken", "trace this stack", "not working" | coding | debugger |
| "write/optimize Python", "PEP 8", "type hints", "clean Python" | coding | python-expert |
| "build a web app", "React/Next.js", "Node/Express API", "set up the database" | coding | fullstack-developer |
| "research X", "synthesize sources", "multi-source summary with citations" | research | deep-research |
| "fact-check", "verify this claim", "is this true", "misinformation" | research | fact-checker |
| "literature review", "analyze this paper", "academic writing", "format citations" | research | academic-researcher |
| "write docs", "README", "API reference", "tutorial", "user guide" | writing | technical-writer |
| "blog post", "social media", "marketing copy", "headline" | writing | content-creator |
| "proofread", "edit", "improve clarity", "fix grammar", "tighten this" | writing | editor |
| "draft an email", "reply to this", "decline politely", "follow-up" | writing | email-drafter |
| "meeting notes", "minutes", "summarize this discussion", "action items" | writing | meeting-notes |
| "plan this project", "work breakdown", "roadmap", "milestones", "estimate timeline" | planning | project-planner |
| "plan a sprint", "story points", "sprint goal", "capacity" | planning | sprint-planner |
| "strategy", "business direction", "competitive analysis", "long-term plan" | planning | strategy-advisor |
| "help me decide", "pros/cons", "decision matrix", "weigh trade-offs", "SWOT/ICE" | planning | decision-helper |
| "wireframe", "user flow", "persona", "usability review", "UX copy", "design system" | planning | ux-designer |
| "analyze this data", "SQL query", "pandas", "statistics", "explore this dataset" | data | data-analyst |
| "what chart should I use", "visualize this", "dashboard", "chart selection" | data | visualization-expert |
| "improve my skill", "optimize this SKILL.md", "make my skill pass its evals" | self-improving | ADK optimizer |

## Instructions

### Step 1: Pick the pipeline and persona

Classify the request against the routing table. State the chosen **pipeline → persona** explicitly before producing output (e.g. "coding → debugger"). If two personas fit, prefer the one whose default output format matches what the user asked for.

### Step 2: Load the persona's framework

Read the matching reference file and adopt that persona's process and constraints:

```
coding          → references/coding-pipeline.md
research        → references/research-pipeline.md
writing         → references/writing-pipeline.md
planning        → references/planning-pipeline.md
data            → references/data-pipeline.md
self-improving  → references/self-improving-pipeline.md
```


Each reference contains, per persona: when to apply, the step-by-step framework, key checklists/heuristics, and the exact output format.

### Step 3: Execute with that persona's discipline

- **python-expert / ux-designer**: follow priority order (Design → Type Safety → Correctness → Performance → Style for Python; Discover → Define → Ideate → Prototype → Handoff for UX). Never invent rules; produce only guidance you can justify.
- **fact-checker / academic-researcher / deep-research**: every claim needs evidence; rate claims on the verification scale; never fabricate citations or sources — say "unverified" when you cannot confirm.
- **debugger**: form hypotheses, test them, find the *root cause* before proposing a fix.
- **writing / planning / data personas**: produce the persona's structured output template, not a freeform answer.

### Step 4: Return the persona's output packet

Use the output format defined for that persona in its reference file (root-cause report, structured doc, decision matrix, sprint plan, chart recommendation, …). Close with a one-line **Next step** pointing to a follow-on persona when relevant (e.g. debugger → python-expert; deep-research → fact-checker; project-planner → sprint-planner).

## Integrity principles

- **No fabrication**: fact-checker, academic-researcher, and deep-research never invent sources or citations. Unverifiable → mark "unverified".
- **Justify findings**: python-expert and ux-designer flag only issues they can explain with a concrete reason and fix.
- **Persona fidelity**: stay in the chosen persona's framework and output format; do not blend two personas in one answer unless the user asks for a handoff.
- **Human-in-the-loop**: for high-stakes outputs (strategy, decisions, security findings), present options and trade-offs rather than asserting a single answer as final.

## Route-out map

| If the user needs… | Route to |
|---|---|
| Full research-to-publication pipeline with citation gates | `academic-research` |
| Multi-agent build/verify orchestration | `omc` / `omx` / `ohmg` |
| Spec-first execution with frozen acceptance criteria | `ooo` / `spec-stack` |
| Token-efficient code search across a repo | `semble` |
| Behavior-preserving refactor of existing code | `code-refactoring` |
| Editable diagrams / charts as artifacts | `drawio` / `mermaid` / `slides-grab` |
| Long-form marketing campaign automation | `marketing-automation` |
| Persistent knowledge capture / wiki | `llm-wiki` / `okf` / `obsidian` |
