---
name: drawio
description: >
  Turn natural-language descriptions into editable `.drawio` diagrams and
  export them to PNG / SVG / PDF / JPG via the native draw.io desktop CLI,
  or turn an existing codebase (Python / JS-TS / Go / Rust) into an
  auto-laid-out structure diagram. Wraps Agents365-ai/drawio-skill: 6
  diagram presets (ERD, UML class, sequence, architecture, ML/DL,
  flowchart), search across 10,000+ official AWS/Azure/GCP/Cisco/K8s/UML/
  BPMN shapes, 321 AI/LLM brand logos, vision self-check + auto-fix, and a
  5-round iterative refinement loop. No MCP server, no daemon — runs from a
  single SKILL.md and the draw.io CLI. Use when the user wants polished,
  precise, exportable diagrams or wants to visualize code structure.
  Triggers on: drawio, draw.io, drawio diagram, architecture diagram, ERD,
  UML diagram, sequence diagram, flowchart, network diagram, visualize
  codebase, code structure diagram, class hierarchy, export diagram png/svg/pdf,
  AWS/Azure/GCP icon, draw.io shapes.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: >
  Wraps the Agent-Skills-format drawio-skill (Agents365-ai/drawio-skill),
  usable from Claude Code, Cursor, Copilot, OpenClaw, Codex, Gemini CLI,
  and any agent compatible with the Agent Skills format. Requires the
  draw.io desktop CLI for export and optional Graphviz for codebase
  auto-layout. Routes hand-drawn/whiteboard looks to excalidraw/tldraw,
  diagrams-as-code-in-git to mermaid/plantuml, deck artifacts to
  `presentation-builder`, and generic plugin browsing to `ccpi-marketplace`.
metadata:
  tags: drawio, diagram, erd, uml, flowchart, architecture-diagram, sequence-diagram, code-visualization, shape-search, ai-logos, export, plugin
  platforms: Claude, Codex, Gemini, Cursor, Copilot, OpenClaw, All
  keyword: drawio
  version: "1.0.0"
  upstream: https://github.com/Agents365-ai/drawio-skill
  installer: npx skills add Agents365-ai/365-skills -g
  source: akillness/jeo-skills
  license: MIT
---

# drawio — From Text to Professional Diagrams

[drawio-skill](https://github.com/Agents365-ai/drawio-skill) (Agents365-ai,
MIT) converts a natural-language description into editable `.drawio` XML and
exports it to PNG / SVG / PDF / JPG through the **native draw.io desktop
CLI** — no MCP server, no background daemon. It can also turn an **existing
codebase** into an auto-laid-out structure diagram. This skill is the
jeo-skills wrapper: it documents when to reach for draw.io, how to install
the CLI + skill (including as a plugin), and how to drive the
plan → generate → self-check → iterate → export loop.

## When to use this skill

- The user wants a **polished, precise diagram** — architecture, network
  topology, microservices, cloud (AWS/Azure/GCP), strict UML class/sequence,
  ER diagram, flowchart, mind map, org chart, ML/DL model
- The user wants to **visualize an existing codebase** — import graphs for
  Python / JS-TS / Go / Rust, or a Python class-inheritance hierarchy, with
  no manual coordinates
- The user needs **real official vendor icons** (AWS Lambda, Kubernetes pod,
  Cisco, BPMN, …) instead of guessed `shape=mxgraph.*` blank boxes
- The user wants **AI/LLM brand logos** (OpenAI, Claude, Gemini, Mistral,
  Llama, Ollama, LangChain, …) that draw.io ships none of
- The user wants the output **exported to PNG/SVG/PDF and kept editable**,
  optionally self-checked and refined over several rounds
- The user explicitly asks for draw.io / `.drawio` files

## When not to use this skill

- The user wants a **casual, hand-drawn / whiteboard look** → use
  `excalidraw-skill` or `tldraw-skill` (sibling upstream skills)
- The user wants **diagrams-as-code that live in git and render in Markdown**
  → use `mermaid` (general) or `plantuml` (UML in CI)
- The user wants a **slide deck / presentation artifact** →
  `presentation-builder`
- The user only wants to **browse/install Claude plugins generally** →
  `ccpi-marketplace`
- The user needs **AI image/video generation** (not diagrams) →
  `god-tibo-imagen` / `video-production`

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| draw.io desktop CLI | Needed for export. `drawio --version` must work |
| A vision-capable agent | The self-check step reads the rendered PNG to auto-fix layout |
| Graphviz (optional) | Only for codebase auto-layout (`brew install graphviz` / `apt install graphviz`) |
| Node.js (optional) | Only the `npx skills` installer needs it; the skill itself does not |

## Instructions

### Step 1 — Install the draw.io desktop CLI

| Platform | Command |
|----------|---------|
| **macOS** | `brew install --cask drawio` |
| **Windows** | Download installer from [drawio-desktop releases](https://github.com/jgraph/drawio-desktop/releases) |
| **Linux** | `.deb`/`.rpm` from releases; `sudo apt install xvfb` for headless |

Verify with `drawio --version`. On **WSL2** the CLI is the Windows desktop
exe reached via `/mnt/c` — the skill detects this automatically.

### Step 2 — Install the skill

```bash
# Any agent (Claude Code, Cursor, Copilot, …) — upstream bundle
npx skills add Agents365-ai/365-skills -g
```

```text
# Claude Code plugin marketplace (upstream)
> /plugin marketplace add Agents365-ai/365-skills
> /plugin install drawio
```

```bash
# Manual install
git clone https://github.com/Agents365-ai/drawio-skill.git \
  ~/.claude/skills/drawio-skill
```

For the **jeo-skills plugin install** of *this* wrapper, see Step 8.

### Step 3 — Generate a diagram from text

After installation, just describe what you want — the skill plans the
layout, generates `.drawio` XML, exports a draft, self-checks, and iterates:

```text
Create a microservices e-commerce architecture with Mobile/Web/Admin
clients, an API Gateway (auth + rate limiting + routing), Auth/User/Order/
Product/Payment services, a Kafka queue, a Notification service, and
User DB / Order DB / Product DB / Redis Cache / Stripe API.
```

```text
Draw a Transformer encoder-decoder: 6-layer encoder with self-attention,
6-layer decoder with cross-attention, input embeddings (batch × 512 × 768),
positional encoding, final output projection. Annotate tensor shapes and
color-code by layer type.
```

### Step 4 — Visualize an existing codebase

Turn code into structure diagrams with the bundled
extract → auto-layout → validate pipeline (no manual coordinates):

```bash
# Import graph — Python / JS-TS / Go / Rust
python3 scripts/pyimports.py   myproject --group -o graph.json
python3 scripts/jsimports.py   ./src     --group -o graph.json
python3 scripts/goimports.py   ./module  --group -o graph.json
python3 scripts/rustimports.py ./crate   --group -o graph.json

# Python class-inheritance hierarchy
python3 scripts/pyclasses.py   mypackage --group -o graph.json

# any extractor → auto-layout → editable .drawio
python3 scripts/autolayout.py  graph.json -o diagram.drawio
```

Auto-layout uses Graphviz placement + orthogonal routing, **transitive
reduction** (drops edges implied by a longer path), and `--group` for nested
module containers. `validate.py` lints the `.drawio` (dangling edges,
duplicate ids, overlaps) before the visual self-check.

### Step 5 — Resolve real shapes and AI/LLM logos

```bash
# Search 10,000+ official AWS/Azure/GCP/Cisco/K8s/UML/BPMN shapes
python3 scripts/shapesearch.py "aws lambda" --limit 5

# Resolve one of 321 AI/LLM brand logos (lobe-icons, MIT)
python3 scripts/aiicons.py "claude" --json      # CDN-referenced (default)
python3 scripts/aiicons.py "openai" --embed     # self-contained data URI
```

Use these instead of guessing `shape=` strings, so vendor icons render
correctly rather than falling back to a blank box.

### Step 6 — Self-check, iterate, and style

The workflow runs **check deps → plan layout → generate XML → export draft
PNG → self-check + auto-fix (up to 2 rounds) → show user → 5-round feedback
loop → final export**. Built-in style presets are `default`, `corporate`,
`handdrawn`, and the skill can learn a new style from a `.drawio` file or a
flat image (saved only after you approve):

```text
Draw a microservices architecture using my "corporate" style
Learn my style from ~/diagrams/brand.drawio as "mybrand"
```

### Step 7 — Choose the right diagram type

| Category | Examples | Notable features |
|----------|----------|------------------|
| Architecture | microservices, cloud, network, deployment | Tier swimlanes, hub-center strategy |
| ML / Deep Learning | Transformer, CNN, LSTM, GRU | Tensor-shape annotations, layer colors |
| Flowcharts | processes, workflows, decision trees, state machines | Semantic shapes (diamond decisions) |
| UML | class, sequence | Inheritance/composition arrows, lifelines |
| Data | ER, data-flow (DFD) | Table containers, PK/FK notation |
| Other | org charts, mind maps, wireframes | — |

### Step 8 — Plugin-style installation alongside jeo-skills

This wrapper folder is plugin-installable through the standard jeo-skills
flow so the routing guide, references, and installer land on disk for any
supported agent runtime:

```bash
# Project install (writes into .agents/skills/drawio/)
npx skills add https://github.com/akillness/jeo-skills --skill drawio

# Global install for every detected agent
npx skills add -g https://github.com/akillness/jeo-skills --skill drawio

# Target specific agents
npx skills add -g https://github.com/akillness/jeo-skills --skill drawio -a claude-code -a codex -y
```

The skill also ships [`scripts/install.sh`](scripts/install.sh) — a one-shot
helper that detects/installs the draw.io CLI per platform and pulls the
upstream `drawio-skill` bundle. See [`references/usage.md`](references/usage.md)
for the full command/flag reference.

## Output format

When the user asks `drawio` for help, return a compact brief:

```markdown
# drawio Routing Brief

## Scope
- Task: text-to-diagram | visualize-codebase | shape/logo-resolve | restyle
- Diagram type: architecture | uml | sequence | flowchart | erd | ml-dl | other
- Export target: png | svg | pdf | jpg | drawio-only

## Recommended next move
- install-cli | install-skill | generate | extract+autolayout | shapesearch | aiicons | refine

## Why
- 2-3 bullets grounded in the user's request

## Route-outs
- `mermaid` / `plantuml` for diagrams-as-code in git
- `excalidraw` / `tldraw` for hand-drawn/whiteboard looks
- `presentation-builder` for slide decks
```

## Best practices

1. **Confirm the CLI first** — `drawio --version` before promising an export;
   without it you can only emit `.drawio` XML, not PNG/SVG/PDF.
2. **Search shapes, don't guess** — `shapesearch.py` resolves the exact
   official style string; guessed `shape=mxgraph.*` names render blank.
3. **Use `aiicons.py` for LLM-app diagrams** — draw.io ships no modern
   AI/LLM logos; `--embed` inlines them for offline rendering.
4. **Let the self-check run** — reading the rendered PNG and auto-fixing
   overlaps/clipped labels is the skill's main quality lever.
5. **Reduce, then lay out** — for codebases, transitive reduction turns a
   dense hairball into a traceable graph before auto-layout.
6. **Pick the right family** — reach for `mermaid`/`plantuml` for
   git-tracked, Markdown-embeddable diagrams; draw.io is for polished,
   exportable, icon-rich artifacts.

## References

- Upstream repo: <https://github.com/Agents365-ai/drawio-skill>
- Online docs: <https://agents365-ai.github.io/drawio-skill/>
- Usage walkthrough: [`docs/USAGE.md`](https://github.com/Agents365-ai/drawio-skill/blob/main/docs/USAGE.md)
- CLI install recipes: [`docs/INSTALL_CLI.md`](https://github.com/Agents365-ai/drawio-skill/blob/main/docs/INSTALL_CLI.md)
- Auto-layout reference: [`references/autolayout.md`](https://github.com/Agents365-ai/drawio-skill/blob/main/skills/drawio-skill/references/autolayout.md)
- Shapes cheatsheet: [`references/shapes.md`](https://github.com/Agents365-ai/drawio-skill/blob/main/skills/drawio-skill/references/shapes.md)
- Troubleshooting (incl. WSL2): [`references/troubleshooting.md`](https://github.com/Agents365-ai/drawio-skill/blob/main/skills/drawio-skill/references/troubleshooting.md)
- Local installer: [`scripts/install.sh`](scripts/install.sh)
- Local usage/flag reference: [`references/usage.md`](references/usage.md)
- Sibling diagram skills: `excalidraw-skill`, `mermaid`, `plantuml`, `tldraw-skill`
- Adjacent jeo-skills: `../presentation-builder/SKILL.md`, `../cli-anything/SKILL.md`, `../ccpi-marketplace/SKILL.md`
- License: MIT (see upstream `LICENSE`)
