---
name: presentation-builder
description: >
  Build real presentation artifacts when the user needs an editable deck rather
  than just an outline: investor decks, roadmap reviews, launch decks,
  architecture/demo decks, workshop decks, and game pitch/update decks. Use when
  the workflow needs slide planning, visual iteration, and export or handoff to
  PPTX/PDF after approval. Triggers on: slide deck, presentation, pitch deck,
  launch deck, roadmap deck, investor deck, architecture review deck, demo deck,
  workshop slides, keynote, and presentation builder. Route long-form docs to
  `technical-writing`, end-user tutorials to `user-guide-writing`, research
  manuscripts to `research-paper-writing`, and broad marketing messaging work to
  `marketing-automation`.
allowed-tools: Read Write Edit Glob Grep
compatibility: >
  Best when the environment can run `slides-grab` with Node.js 18+ and Chromium.
  The skill assumes an HTML-first editable deck workflow with visual review, then
  export/handoff to PPTX or PDF when the content is approved.
license: MIT
metadata:
  tags: presentation, slides-grab, pitch-deck, roadmap-deck, investor-deck, demo-deck, pptx, pdf, html-slides, storytelling
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.0.0"
  modernization: 2026-04-15
---

# Presentation Builder

Use this skill when the real deliverable is **a presentation artifact people will review, present, or hand off as slides**.

`presentation-builder` is the documentation/publishing-cluster skill for:
- investor and fundraising decks
- roadmap, QBR, planning, and status decks
- GTM / launch / sales-enablement decks
- architecture review, product demo, and workshop decks
- game pitch decks and milestone-update decks

Read these support docs before choosing the workflow:
- [references/presentation-modes-and-routing.md](references/presentation-modes-and-routing.md)
- [references/review-and-export-checklist.md](references/review-and-export-checklist.md)
- [references/source-and-handoff-patterns.md](references/source-and-handoff-patterns.md)

## When to use this skill
- The user needs a deck, not just bullets or prose.
- The workflow needs slide planning, deck structure, visuals, and speaker/story flow.
- The output needs browser review before exporting or handing off a PPTX/PDF.
- The deck should be editable from stable HTML slide source rather than patched directly in exported binaries.
- The request names investor deck, roadmap deck, launch deck, workshop slides, keynote, pitch deck, or presentation artifact.

## When not to use this skill
- **The main job is a technical spec, ADR, runbook, migration guide, or internal implementation document** → use `technical-writing`
- **The main job is an end-user tutorial, onboarding guide, FAQ, or screenshot-heavy help-center flow** → use `user-guide-writing`
- **The main job is a research paper, rebuttal, or academic manuscript** → use `research-paper-writing`
- **The main job is broad messaging, positioning, campaign strategy, or launch planning without a concrete slide artifact** → use `marketing-automation`
- **The user only needs an outline, memo, or planning artifact and no presentation file** → use the relevant planning or writing skill first

## Instructions

### Step 1: Confirm that the artifact really needs slides
Normalize the request before authoring.

```yaml
presentation_builder_mode:
  deck_mode: investor | roadmap-review | launch-gtm | architecture-demo | workshop-training | game-pitch | other
  audience: executives | investors | customers | internal-team | mixed | unknown
  delivery_surface: live-presentation | async-review | send-as-pdf | editable-handoff | mixed
  source_material: brief | doc | screenshots | charts | prototype | mixed | unknown
  review_need: outline-approval | visual-approval | export-ready | mixed
  export_targets: pptx | pdf | html-viewer | multiple | unknown
```

Choose exactly one primary `deck_mode` for the run:
- `investor` → fundraising, board, or strategic pitch deck
- `roadmap-review` → roadmap, QBR, planning, status, or executive update deck
- `launch-gtm` → product launch, sales-enablement, marketing, or stakeholder brief deck
- `architecture-demo` → technical walkthrough, demo deck, architecture review, solution pitch, or developer presentation
- `workshop-training` → workshop, enablement, training, talk, or keynote deck
- `game-pitch` → publisher pitch, game concept, milestone update, or studio business-development deck

### Step 2: Define audience, promise, and evidence
Before generating slides, lock three things:
1. **Audience** — who will read or watch this deck?
2. **Deck promise** — what should they understand, decide, or approve by the end?
3. **Evidence set** — what visuals, screenshots, metrics, citations, or source material must appear?

If those are unclear, do not jump straight into HTML slides. Build the outline first.

### Step 3: Create the outline before the deck
Draft a concise outline file such as `decks/<deck-name>/slide-outline.md`.

Minimum fields per slide:
- slide number
- title
- one-sentence takeaway
- required evidence / visual
- notes on speaker intent or approval risk

Recommended outline skeleton:

```markdown
# <Deck Name>

## Slide 01 — Title / hook
- takeaway:
- evidence/visual:
- notes:

## Slide 02 — Context / problem
- takeaway:
- evidence/visual:
- notes:
```

Do not move to slide generation until the outline is stable enough for the chosen audience.

### Step 4: Choose the slide workspace and source pattern
Default to a dedicated workspace such as:

```text
decks/<deck-name>/
  slide-outline.md
  slide-01-cover.html
  slide-02-problem.html
  slide-03-solution.html
  assets/
```

Source rules:
- keep one primary idea per slide
- keep HTML/CSS easy for an agent to revise
- keep raw evidence/assets in the deck workspace instead of scattering them across unrelated folders
- keep notes/rationale outside the visible slide body when possible
- revise the HTML source, not the exported PPTX/PDF

### Step 5: Map content to slide mode, not one generic deck template
Use the smallest structure that fits the mode.

#### A. Investor deck
Typical sequence:
- company / product hook
- problem
- solution / product
- market / audience
- traction or proof
- business model
- go-to-market
- team
- ask / next step

#### B. Roadmap / review deck
Typical sequence:
- summary / headline
- goal or KPI status
- current state
- progress / shipped work
- risks / blockers
- next phase / decision needed
- appendix or supporting detail

#### C. Launch / GTM deck
Typical sequence:
- launch objective
- audience / segment
- positioning / message
- offer or feature summary
- channel / enablement plan
- timeline / owners
- risks / dependencies
- ask / approval / next step

#### D. Architecture / demo deck
Typical sequence:
- use case / audience
- system or workflow overview
- architecture / flow
- key screens / code / evidence
- trade-offs or differentiators
- validation / metrics / next step

#### E. Workshop / training deck
Typical sequence:
- learning objective
- agenda
- concept / model
- example / walkthrough
- exercise or prompt
- recap / reference links

#### F. Game pitch / milestone deck
Typical sequence:
- game fantasy / hook
- audience / market fit
- gameplay / loop
- art / proof / footage
- production plan / milestones
- budget / funding / partner ask
- risks / next step

### Step 6: Build and visually review the deck
After creating or editing slides, run the local viewer and validation steps:

```bash
slides-grab build-viewer --slides-dir decks/<deck-name>
slides-grab validate --slides-dir decks/<deck-name>
```

For visual iteration:

```bash
slides-grab edit --slides-dir decks/<deck-name>
```

Visual review rules:
- fix the source slide files, never the exported binary
- note any slide with crowding, weak hierarchy, unreadable screenshots, or unsupported claims
- verify that the deck still tells one coherent story from slide 1 to the final ask
- keep manual-polish notes explicit when an export is acceptable but not perfect

### Step 7: Export only after approval
Only export once the outline and visual pass are acceptable.

```bash
slides-grab convert --slides-dir decks/<deck-name> --output decks/<deck-name>.pptx
slides-grab pdf --slides-dir decks/<deck-name> --output decks/<deck-name>.pdf
```

Always report:
- output file paths
- validation status
- review status (outline approved / visually approved / export-ready)
- any slides that still need manual polish or office-tool cleanup

### Step 8: Return the artifact in the right shape
Preferred response structure:
1. deck mode + audience
2. source workspace path
3. outline status
4. review findings
5. export paths and remaining risks

## Core commands
```bash
slides-grab edit
slides-grab build-viewer
slides-grab validate
slides-grab convert
slides-grab pdf
slides-grab list-templates
slides-grab list-themes
```

All commands support `--slides-dir <path>`.

## Best practices
1. Treat deck creation as a narrative + evidence problem, not just a styling task.
2. Keep source-of-truth slides in editable HTML and regenerate exports when content changes.
3. Use one primary deck mode per run so the structure stays coherent.
4. Get outline approval before spending time on polished visual HTML.
5. Keep route-outs explicit: many requests that mention “slides” are really docs, research, or marketing-planning requests.
6. Prefer stable assets and citations over decorative filler.
7. Call out when PPTX/PDF export is good enough for handoff but still needs final office-tool polish.

## Examples

### Example 1: Investor deck
```text
Turn this product brief into a 10-slide investor deck. Show me the outline first, then generate the slides in decks/series-a and export PPTX/PDF after visual approval.
```

### Example 2: Architecture review deck
```text
Build an 8-slide architecture review deck for our browser automation service. Use screenshots, flow diagrams, and one slide on failure handling. I need an editable PPTX after we review the HTML deck.
```

### Example 3: Game pitch deck
```text
Create a publisher pitch deck for our indie tactics game. Include hook, audience, gameplay loop, milestone plan, budget ask, and next step. Keep the deck source in decks/tactics-pitch.
```

## References
- Upstream tool: `https://github.com/vkehfdl1/slides-grab`
- Figma Slides: `https://www.figma.com/slides/`
- Marp: `https://marp.app/`
- Slidev: `https://sli.dev/`
