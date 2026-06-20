---
name: slides-grab
description: >
  Generate, visually edit, and export beautiful HTML/CSS presentation decks
  with agents using slides-grab (NomaDamas, MIT) — the open-source Claude
  Design alternative and "best harness + editor + linter for generating slides
  in Claude Code / Codex". One routing-first skill across the full deck
  lifecycle: Plan (agent drafts a structured outline), Design (each slide is a
  self-contained `slide-XX.html`), Edit (a pure-JavaScript browser editor where
  you drag a bbox over any region and ask the agent to rewrite just that area —
  or tweak text/size/bold by hand), and Export (one command to a
  capture-or-print PDF, per-slide PNGs incl. Instagram 1:1 card-news, plus
  experimental/unstable PPTX and Figma-importable PPTX). Picks an install path
  (npm package + `npx skills add`, or clone to develop slides-grab itself),
  a deck workspace (`--slides-dir`, multi-deck `decks/<name>/`), one of 35
  bundled design styles, and the right asset flow (local `./assets/<file>`
  only — `slides-grab image` via god-tibo-imagen/codex/nano-banana,
  `fetch-video` via yt-dlp, `tldraw` .tldr→SVG), validating with
  `slides-grab validate` before any export. Use when the user wants to build,
  restyle, point-and-edit, or export a slide deck or card-news set.
  Triggers on: slides-grab, slides grab, generate slides, slide deck, ai slides,
  html slides, presentation editor, edit slide, card news, slides to pdf,
  slides to pptx, claude design alternative, slide showcase.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: >
  Cross-platform slide-generation/editing/export wrapper usable from Claude
  Code and Codex (the upstream ships dedicated install guides for both) and
  other agents via the shared skill. Wraps the upstream slides-grab CLI
  (NomaDamas/slides-grab, MIT) — a Node.js >= 20 package (`npm install
  slides-grab`) with a Playwright/Chromium render+export pipeline and a
  pure-JS browser editor. No MCP server and no daemon; `slides-grab edit`
  runs a local editor server on demand. Routes editable vector diagrams to
  `drawio`/`mermaid`, packet-first deck planning/handoff to
  `presentation-builder`, AI image generation to `god-tibo-imagen`, and
  broad local design-artifact generation to `open-design`.
metadata:
  tags: slides-grab, slide-generation, presentation, html-slides, slide-editor, pdf-export, pptx-export, card-news, claude-design-alternative, plugin
  platforms: Claude, Codex, Gemini, OpenCode, All
  keyword: slides-grab
  version: "1.0.0"
  upstream: https://github.com/NomaDamas/slides-grab
  installer: npm install slides-grab && npx playwright install chromium && npx skills add ./node_modules/slides-grab -g -a codex -a claude-code --yes --copy
  source: akillness/jeo-skills
  license: MIT
---

# slides-grab — Point-and-Edit AI Slide Decks in HTML/CSS

[slides-grab](https://github.com/NomaDamas/slides-grab) (NomaDamas, MIT) is the
**open-source Claude Design alternative** — a harness + visual editor + linter
for generating presentation decks with coding agents. Every slide is a
self-contained `slide-XX.html` file of **plain HTML & CSS** — the language AI
agents are strongest at — so decks are beautiful, trivially editable by the
agent, and exportable to PDF (and experimental/unstable PPTX or Figma). Its
signature move: in the browser editor you **drag a box over any region and ask
the agent to rewrite just that area**; small things (text, size, bold) you can
still tweak by hand "like in the 2024 era". This skill is the routing-first
wrapper: pick an install path, a deck workspace, a design style, and the right
asset/export flow.

## When to use this skill

- The user wants to **generate a slide deck** from a topic or source files and
  then iterate on it visually rather than re-prompting from scratch
- The user wants to **point at a region of a rendered slide and have the agent
  edit only that area** (bbox selection + agent rewrite) — the core slides-grab
  workflow via `slides-grab edit`
- The user wants a deck in **HTML/CSS they can hand-tweak** (text, size, bold)
  and that the agent can restyle with any of the **35 bundled design styles**
- The user wants to **export** a deck — `slides-grab pdf` (capture or
  searchable `--mode print`), `slides-grab png` (per-slide, incl. 1:1
  **card-news** for Instagram), or the experimental/unstable `convert` (PPTX)
  / `figma` (Figma-importable PPTX)
- The user is building **Instagram-style card news** (square 720pt × 720pt)
  and wants PNG-first output
- The user needs deck **assets** done the supported way — generate imagery with
  `slides-grab image` (god-tibo-imagen / codex / nano-banana), pull a web video
  with `fetch-video` (yt-dlp), or turn a `.tldr` diagram into a slide-sized SVG
  with `slides-grab tldraw`
- The user wants to **validate** a deck (`slides-grab validate`, Playwright)
  before exporting to catch missing local assets and discouraged path forms

## When not to use this skill

- The user wants **editable vector diagrams** (architecture, ERD, UML,
  sequence, flowchart) inside a slide → author them with `drawio` or `mermaid`
  and embed the exported image
- The user wants **packet-first deck planning, narrative structure, or the
  last-mile handoff decision** (HTML review vs PPTX vs PDF vs Google/Figma
  Slides) without committing to slides-grab's HTML pipeline →
  `presentation-builder`
- The user just wants **AI-generated images** (not a deck) → `god-tibo-imagen`
- The user wants **broad local design-artifact generation** (web/mobile/desktop
  prototypes, media, 72 design systems) → `open-design`
- The deck must be **pixel-perfect PowerPoint or native Figma** — slides-grab's
  `convert`/`figma` paths are explicitly **experimental / unstable**, emit
  best-effort `.pptx` for manual import, and expect cleanup; do not promise
  faithful PPTX/Figma parity

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Node.js >= 20 | Hard requirement for the CLI |
| Chromium via Playwright | `npx playwright install chromium` — render, validate, and export pipeline |
| A coding agent | Claude Code or Codex have first-class install guides; the bbox "edit this region" loop hands selections to the agent |
| `yt-dlp` (optional) | Only for `slides-grab fetch-video` |
| A Codex/ChatGPT login (optional) | Default `slides-grab image` provider (god-tibo-imagen) reuses `~/.codex/auth.json`; alternative providers need `OPENAI_API_KEY` or `GOOGLE_API_KEY` |

## Instructions

### Step 1 — Install slides-grab

| Path | When | Command |
|------|------|---------|
| **npm package** (recommended) | Normal usage — CLI + shared skills | `npm install slides-grab` → `npx playwright install chromium` → `npx skills add ./node_modules/slides-grab -g -a codex -a claude-code --yes --copy` |
| **Agent install guide** | Let the agent wire it end-to-end | Claude Code: read `docs/installation/claude.md`; Codex: read `docs/installation/codex.md` and follow every step |
| **Clone** | Develop/contribute to slides-grab itself | `git clone … && cd slides-grab && npm ci && npx playwright install chromium` |

The skill ships [`scripts/install.sh`](scripts/install.sh) to run the npm path
(install + Playwright Chromium + `npx skills add`), with `SLIDES_GRAB_NO_SKILLS=1`
to skip the agent-skill registration step.

### Step 2 — Choose a deck workspace

Workflow commands take `--slides-dir <path>` (default: `slides`). For more than
one deck, keep each under `decks/<name>/` and pass `--slides-dir decks/<name>`
to every stage. On a fresh install the discovery commands (`--help`,
`list-templates`, `list-styles`, `preview-styles`) work with no deck;
`edit`, `build-viewer`, `validate`, `convert`, and `pdf` require an existing
workspace containing `slide-*.html`.

### Step 3 — Plan → Design

1. **Plan** — have the agent draft a structured outline from the topic/files.
2. **Design** — the agent generates each slide as a self-contained
   `slide-XX.html`. Browse styles with `slides-grab list-styles` (35 bundled:
   30 from [corazzon/pptx-design-styles](https://github.com/corazzon/pptx-design-styles)
   + 5 originals) or `slides-grab preview-styles` for the visual gallery, then
   just tell the agent which style to use (or ask for a custom one — no config
   files).

### Step 4 — Edit visually (the slides-grab move)

bash
slides-grab edit --slides-dir decks/my-deck


Launches the pure-JavaScript browser editor. **Drag a bbox over any region and
ask the agent to rewrite just that area**; do simple text/size/bold edits by
hand. Use `--mode card-news` here (and at every later stage) for square 1:1
decks. The editor file is plain JS — easy to extend with new agents/designs.

### Step 5 — Add assets the supported way

Store local images/videos in `<slides-dir>/assets/` and reference them as
`./assets/<file>`. **Remote `http(s)://` image URLs and absolute filesystem
paths are disallowed in saved slides; `data:` URLs are allowed.**

| Need | Command |
|------|---------|
| Generate an image | `slides-grab image --slides-dir decks/my-deck --prompt "…"` (default **god-tibo-imagen** reuses `~/.codex/auth.json`; `--provider codex` needs `OPENAI_API_KEY`, `--provider nano-banana` needs `GOOGLE_API_KEY`) |
| Pull a web video | `slides-grab fetch-video --url <youtube-url> --slides-dir decks/my-deck --output-name hero-video` (needs `yt-dlp`) |
| Diagram → SVG | `slides-grab tldraw --input …/system.tldr --output …/assets/system.svg --width 640 --height 320` |

god-tibo-imagen calls an **unsupported private Codex backend that may break
without notice** and needs an image-entitled account; on failure slides-grab
falls back to any provider with credentials, else to web-search + local
download into `assets/`.

### Step 6 — Validate → Export

Always validate first to catch missing assets and bad paths:

bash
slides-grab validate --slides-dir decks/my-deck


| Output | Command |
|--------|---------|
| **PDF (capture, default)** — rasterized, best fidelity | `slides-grab pdf --slides-dir decks/my-deck --output decks/my-deck.pdf` |
| **PDF (print)** — searchable/selectable text | `slides-grab pdf --slides-dir decks/my-deck --mode print --output …-searchable.pdf` |
| **PNG per slide** (default 2160p) | `slides-grab png --slides-dir decks/my-deck --output-dir …/out-png` |
| **Card-news PNG** (Instagram 1:1) | `slides-grab png --slides-dir decks/my-cards --slide-mode card-news --resolution 2160p` |
| **PPTX** (experimental/unstable) | `slides-grab convert --slides-dir decks/my-deck --output decks/my-deck.pptx` |
| **Figma-importable PPTX** (experimental/unstable) | `slides-grab figma --slides-dir decks/my-deck --output …-figma.pptx` |
| **Single-file viewer** | `slides-grab build-viewer` |

`pdf` and `convert` default to `2160p` / `4k`; override with
`--resolution 720p|1080p|1440p|2160p|4k`. For a `<video>` slide, set
`poster="./assets/<file>"` so PDF export uses a stable still.

### Step 7 — Plugin-style installation alongside jeo-skills

This skill folder is plugin-installable through the standard jeo-skills flow so
the wrapper, references, and installer land on disk for any supported runtime:

bash
# Project install (writes into .agents/skills/slides-grab/)
npx skills add https://github.com/akillness/jeo-skills --skill slides-grab

# Global install for every detected agent
npx skills add -g https://github.com/akillness/jeo-skills --skill slides-grab

# Target specific agents
npx skills add -g https://github.com/akillness/jeo-skills --skill slides-grab -a claude-code -a codex -y


## Output format

When the user asks `slides-grab` for help, return a compact brief:

markdown
# slides-grab Routing Brief

## Scope
- Install path: npm-package | agent-guide | clone | already-installed
- Deck: slides/ | decks/<name> | card-news | undecided
- Stage: plan | design | edit | assets | validate | export

## Recommended next move
- npm-install | slides-grab edit | list-styles | slides-grab image | validate | pdf | png-card-news | convert

## Why
- 2–3 bullets grounded in the user's packet

## Route-outs
- `drawio` / `mermaid` for editable vector diagrams embedded in a slide
- `presentation-builder` for packet-first planning + export-target handoff
- `god-tibo-imagen` for standalone AI image generation
- `open-design` for broad local design-artifact generation


## Best practices

1. **Validate before every export** — `slides-grab validate` (Playwright)
   catches missing local assets and discouraged path forms before PDF/PNG/PPTX.
2. **Keep assets local** — store under `<slides-dir>/assets/` and reference
   `./assets/<file>`; remote image URLs and absolute paths are rejected in
   saved slides. Download web video with `fetch-video` first.
3. **Use `--slides-dir` consistently** — pass the same deck path to every stage;
   for card-news pass `--mode card-news` (editor/validate) and
   `--slide-mode card-news` (pdf/png) at *every* step.
4. **Treat PPTX/Figma as best-effort** — `convert` and `figma` are
   experimental/unstable; expect layout shifts and manual cleanup. Prefer PDF
   (capture) for fidelity and PNG for card-news.
5. **Prefer the bbox edit loop** — drag a region and ask the agent to rewrite
   just it, instead of regenerating whole slides; hand-edit only trivial text.
6. **Mind the image backend caveat** — god-tibo-imagen is an unsupported private
   Codex backend needing an image-entitled account; have `OPENAI_API_KEY` or
   `GOOGLE_API_KEY` ready as a fallback, or fall back to web-search + download.

## References

- Upstream repo: <https://github.com/NomaDamas/slides-grab>
- Live showcase gallery: <https://nomadamas.github.io/slides-grab/>
- Install guides: `docs/installation/claude.md`, `docs/installation/codex.md`
- Feature + command reference: [`references/features.md`](references/features.md)
- Installer script: [`scripts/install.sh`](scripts/install.sh)
- Adjacent skills: `../drawio/SKILL.md`, `../presentation-builder/SKILL.md`,
  `../god-tibo-imagen/SKILL.md`, `../open-design/SKILL.md`
- License: MIT
