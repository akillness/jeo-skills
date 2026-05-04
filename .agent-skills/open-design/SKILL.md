---
name: open-design
description: >
  Route design-generation work into the right Open Design workflow mode — prototype, deck, document, or media artifact.
  Use when the user needs local-first UI prototype generation, presentation deck creation, or design-system-aware
  HTML/PDF/PPTX artifacts via locally-installed coding agents. Supports 72 built-in design systems, 5 visual directions,
  93 media prompt templates, and multi-format export. Triggers on:
  open-design, local design tool, prototype generation, design deck, design artifact, design agent workflow,
  open design prototype, design system artifact, UI prototype generation.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: Requires Node.js ~24 and pnpm 10.33.x. Run `pnpm tools-dev run web` to launch the local UI. Auto-detects 13+ coding agent CLIs (Claude Code, Cursor, Gemini CLI, GitHub Copilot, etc.). Extend with file-based skills in the `skills/` directory. Plugin install via `claude plugin marketplace add nexu-io/open-design`.
license: MIT
metadata:
  tags: open-design, design-tool, local-first, prototype, deck, ui-generation, multi-format, design-system, media-generation, html-export, pptx-export
  version: "1.0"
  source: https://github.com/nexu-io/open-design
  platforms: Claude, Gemini, Codex, ChatGPT
---

# open-design — local-first design artifact generation

> **Keyword**: `open-design` · `local design tool` · `prototype generation` · `design artifact`
>
> Open-source alternative to Anthropic's Claude Design — generates web, mobile, and desktop prototypes, decks, and media artifacts using coding agents already installed on your machine.

Open Design is most useful when you choose the **smallest generation mode that fits the job**:
- start with a prototype before reaching for a full deck
- pick one design system before layering custom styles
- choose one output format (HTML review before PDF/PPTX export)
- use the Turn 1 discovery form to reduce redirect cycles before generation begins

## When to use this skill

- The user needs a local-first UI prototype, presentation deck, or document artifact from a single prompt
- The user wants to generate design artifacts using coding agents they already have installed (Claude Code, Cursor, Gemini CLI, etc.)
- The user wants to apply one of 72 built-in design systems (Linear, Stripe, Vercel, Notion, Apple, etc.) to their output
- The user needs multi-format export: HTML review → PDF, PPTX, ZIP, or Markdown
- The user wants AI-generated images, video, or audio media embedded in design artifacts
- The user wants to extend Open Design with custom file-based skills or install it as a Claude Code plugin

## Do not use this skill when

- The task is live UI component authoring in a real codebase → route to `stitch-skills` or `ui-component-patterns`
- The task is video production or Remotion animation → route to `video-production`
- The task is a data-driven presentation deck without design-system application → route to `presentation-builder`
- The task is compressing or optimizing existing media files → route to `compresso`
- The task is a broad web UI critique or audit → route to `web-design-guidelines`

## Instructions

### Step 1: Capture the generation mode

Collect the minimum packet before choosing a workflow:

- **Output type**: UI prototype, presentation deck, landing page, document, or media artifact
- **Design system**: one of the 72 built-ins (Linear, Stripe, Vercel, Notion, Tesla, Apple…) or custom
- **Visual direction**: one of 5 directions (minimal, bold, playful, enterprise, dark)
- **Export format**: HTML review, PDF, PPTX, ZIP, or Markdown
- **Agent**: which installed CLI to delegate to (auto-detected or explicit)

Use this rule set:

1. If output is a UI prototype or landing page → choose `prototype` mode
2. If output is a presentation or investor deck → choose `deck` mode
3. If output is a long-form document or spec → choose `document` mode
4. If media (image/video/audio) generation is the primary output → choose `media` mode
5. If the user has not chosen a design system → use the Turn 1 discovery form to reduce drift before generating

### Step 2: Install Open Design

```bash
# Clone and install
git clone https://github.com/nexu-io/open-design.git
cd open-design
corepack enable
pnpm install

# Start the local web UI
pnpm tools-dev run web
```

Requirements:
- Node.js ~24
- pnpm 10.33.x

**Plugin install (Claude Code):**
```bash
claude plugin marketplace add nexu-io/open-design
```

**Install from oh-my-skills:**
```bash
npx skills add https://github.com/akillness/oh-my-skills --skill open-design
```

**Lifecycle commands:**
```bash
pnpm tools-dev start    # start daemon
pnpm tools-dev stop     # stop daemon
pnpm tools-dev run web  # open local web UI
pnpm tools-dev status   # check status
pnpm tools-dev logs     # tail logs
pnpm tools-dev inspect  # inspect agent connections
pnpm tools-dev check    # preflight check
```

### Step 3: Choose the right generation mode

#### A. Prototype mode
Use when the user needs a web, mobile, or desktop UI mockup.

```
Mode: Prototype
Design system: Linear (or any of 72 built-ins)
Visual direction: minimal / bold / playful / enterprise / dark
Output: HTML review → PPTX / PDF / ZIP
```

Best for:
- SPA dashboards, landing pages, mobile screens
- Multi-page prototype flows
- Design-system-aligned mockups before actual implementation

#### B. Deck mode
Use when the user needs an investor pitch, roadmap, or architecture deck.

```
Mode: Deck
Design system: Vercel / Stripe / Notion (pick one)
Visual direction: enterprise / bold
Output: PPTX, PDF, or Google Slides
```

Best for:
- Investor / roadmap / launch decks
- Architecture and demo presentations
- Workshop or game-pitch slide decks

Routes: for deck-only work without design-system application, route to `presentation-builder`.

#### C. Document mode
Use when the output is a long-form technical document, spec, or styled report.

```
Mode: Document
Design system: pick one for consistent typography/spacing
Output: Markdown, PDF
```

Best for:
- Design specs and system documentation
- Styled technical reports exported to PDF

#### D. Media mode
Use when the primary output is generated images, video, or audio.

Supported generation backends:
- **Images**: gpt-image-2 (via integrated coding agents)
- **Video**: Seedance 2.0
- **HTML → MP4**: HyperFrames
- **93 ready-to-use prompt templates** across product, marketing, and social media categories

### Step 4: Apply a design system

Open Design includes **72 built-in design systems** with:
- Consistent color palettes, typography, and spacing tokens
- Cross-format coherence (same system across HTML, PPTX, and PDF)
- Named systems from real products (Linear, Stripe, Vercel, Notion, Tesla, Apple, and more)

Keep to one design system per artifact. Mixing multiple systems produces inconsistent output.

### Step 5: Export the artifact

Choose the **smallest output format that meets the need**:

| Format | Best for |
|--------|----------|
| HTML review | Quick stakeholder review, iteration before final export |
| PPTX | Presentation slides, editable after export |
| PDF | Final delivery, print |
| ZIP | Full artifact package including assets |
| Markdown | Documentation, wiki integration |

Prefer HTML review first to catch direction issues before committing to PDF/PPTX export.

### Step 6: Extend with custom skills

Open Design supports **file-based skill plugins**:
- Drop a skill folder into the `skills/` directory and restart
- Skill folders follow the same `SKILL.md` convention used in this repo
- Community skills and design systems can be contributed via GitHub issues and PRs

```bash
# Add a custom skill to Open Design
cp -r my-custom-skill open-design/skills/
pnpm tools-dev stop && pnpm tools-dev run web
```

## Examples

### Example 1: SaaS dashboard prototype
```
Mode: Prototype | Design system: Linear | Direction: minimal
Prompt: "Analytics dashboard with sidebar nav, KPI cards, and a time-series chart"
Export: HTML review → PPTX
```

### Example 2: Investor pitch deck
```
Mode: Deck | Design system: Vercel | Direction: enterprise
Prompt: "10-slide investor deck: problem, solution, market, traction, team, ask"
Export: PPTX
```

### Example 3: Product image generation
```
Mode: Media | Backend: gpt-image-2 | Template: Product hero
Prompt: "Clean product hero image for a developer CLI tool, dark background, code aesthetic"
```

### Example 4: Plugin install
```bash
# Claude Code plugin
claude plugin marketplace add nexu-io/open-design
```

## Best practices

1. Use the Turn 1 discovery form to freeze design system, visual direction, and output format before generation — do not skip it for ambiguous requests.
2. Choose one design system per artifact to keep cross-format output coherent.
3. Prefer HTML review before committing to PDF/PPTX to save iteration cost.
4. Use media mode only when generated images/video are the primary deliverable, not a side effect.
5. For real codebase UI components, route to `stitch-skills` or `ui-component-patterns` instead.
6. When adding file-based skills to Open Design, follow the same `SKILL.md` format used in this repo.
7. Prefer `pnpm tools-dev check` before first use to verify Node.js and pnpm version requirements.

## References

- [Open Design GitHub Repository](https://github.com/nexu-io/open-design)
- [stitch-skills](../stitch-skills/SKILL.md) — for live AI-generated UI components in a real codebase
- [presentation-builder](../presentation-builder/SKILL.md) — for data-driven deck artifacts without design-system application
- [video-production](../video-production/SKILL.md) — for Remotion/programmable video production
- [compresso](../compresso/SKILL.md) — for offline media compression
- [web-design-guidelines](../web-design-guidelines/SKILL.md) — for broad web UI audits and guidelines
