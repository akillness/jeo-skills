---
name: presentation-builder
description: >
  Build real deck artifacts when the user needs editable slides, not just prose:
  investor decks, roadmap/QBR decks, launch decks, architecture/demo decks,
  workshop/training decks, and game pitch or milestone decks. Use when the job is
  to choose one deck mode, one smallest useful artifact packet, and one honest
  handoff surface (HTML review, PPTX, PDF, Google Slides, or Figma Slides).
  Triggers on: presentation, slide deck, slides, pitch deck, roadmap deck,
  investor deck, launch deck, architecture review deck, demo deck, workshop
  slides, keynote, board deck, QBR deck, and game pitch deck. Route long-form
  docs to `technical-writing`, end-user tutorials to `user-guide-writing`,
  research manuscripts to `research-paper-writing`, and broad marketing planning
  to `marketing-automation`.
allowed-tools: Read Write Edit Glob Grep
compatibility: >
  Best when the environment can run `slides-grab` with Node.js 18+ and Chromium.
  The skill assumes an HTML-first editable deck workflow with browser review,
  then export or downstream cleanup in PPTX/PDF/Slides surfaces after approval.
license: MIT
metadata:
  tags: presentation, slides-grab, pitch-deck, roadmap-deck, investor-deck, demo-deck, pptx, pdf, html-slides, storytelling
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.1.0"
  modernization: 2026-04-15
  hardening: 2026-04-18
---

# Presentation Builder

Use this skill when the deliverable is **a deck artifact people will review, present, or hand off as slides**, not just an outline or narrative document.

`presentation-builder` is the documentation/publishing-cluster anchor for:
- investor, fundraising, board, and executive decks
- roadmap, QBR, status, and decision-review decks
- launch, GTM, and sales-enablement decks
- architecture walkthroughs, demo decks, and technical presentations
- workshop, training, and keynote decks
- game pitch, publisher, and milestone-update decks

Read these support docs before choosing the workflow:
- [references/presentation-modes-and-routing.md](references/presentation-modes-and-routing.md)
- [references/artifact-packets-and-last-mile-handoffs.md](references/artifact-packets-and-last-mile-handoffs.md)
- [references/source-and-handoff-patterns.md](references/source-and-handoff-patterns.md)
- [references/review-and-export-checklist.md](references/review-and-export-checklist.md)

## When to use this skill
- The user needs an actual slide deck, not just bullets or a memo.
- The workflow needs slide planning, visual iteration, and deck-specific evidence.
- The work must survive browser review before export or downstream office/design-tool cleanup.
- The output needs an editable or shareable slide surface such as HTML viewer, PPTX, PDF, Google Slides, or Figma Slides.
- The request names a deck artifact directly or clearly implies a presentation deliverable for review, pitching, enablement, or decision-making.

## When not to use this skill
- **The main job is a technical spec, ADR, runbook, migration guide, or internal implementation document** → use `technical-writing`
- **The main job is an end-user tutorial, onboarding guide, FAQ, or screenshot-heavy help-center flow** → use `user-guide-writing`
- **The main job is a research paper, rebuttal, or academic manuscript** → use `research-paper-writing`
- **The main job is broad launch planning, campaign strategy, positioning, or messaging without a concrete deck artifact** → use `marketing-automation`
- **The main job is only an outline, memo, or planning artifact and no deck file is actually needed** → use the relevant planning or writing skill first

## Instructions

### Step 1: Classify one deck mode, one artifact packet, and one handoff surface
Normalize the request before drafting.

```yaml
presentation_builder_mode:
  deck_mode: investor | roadmap-review | launch-gtm | architecture-demo | workshop-training | game-pitch | other
  audience: executives | investors | customers | internal-team | mixed | unknown
  source_material: brief | doc | spreadsheet | screenshots | charts | prototype | mixed | unknown
  review_need: outline-approval | visual-approval | export-ready | mixed
  artifact_packet: outline-brief | storyboard | review-ready-html | export-handoff | sync-packet | unknown
  handoff_surface: html-viewer | pptx | pdf | google-slides | figma-slides | mixed | unknown
```

Choose exactly one primary `deck_mode` for the run:
- `investor` → fundraising, board, strategic pitch, or executive narrative deck
- `roadmap-review` → roadmap, QBR, planning, KPI, status, or decision-review deck
- `launch-gtm` → launch briefing, sales-enablement, product narrative, or GTM deck
- `architecture-demo` → technical walkthrough, architecture review, developer talk, or demo deck
- `workshop-training` → workshop, training, keynote, or enablement deck
- `game-pitch` → publisher pitch, game concept, milestone update, or studio BD deck

Use [references/artifact-packets-and-last-mile-handoffs.md](references/artifact-packets-and-last-mile-handoffs.md) to pick the smallest useful packet and the real last-mile surface early.

### Step 2: Lock the promise, evidence, and downstream editor
Before generating slides, answer these three questions:
1. **What should the audience understand, approve, or decide by the end?**
2. **What evidence must appear on the slides?** Screenshots, charts, metrics, citations, links, footage, or product visuals.
3. **Where will the final cleanup happen?** Browser-only viewer, PPTX, PDF, Google Slides, or Figma Slides.

Do not pretend the handoff surface is irrelevant. Real deck workflows often start in HTML or Markdown but still end with office/design-tool cleanup.

### Step 3: Route out non-deck work early
Use the smallest honest boundary:

| If the request is mainly about... | Use |
|---|---|
| technical specs, rollout docs, ADRs, migration details | `technical-writing` |
| tutorials, help docs, onboarding, screenshot walkthroughs | `user-guide-writing` |
| academic papers, rebuttals, manuscript sections | `research-paper-writing` |
| messaging, launch strategy, campaigns, content calendars | `marketing-automation` |
| a reviewable or handoff-ready deck artifact | `presentation-builder` |

Many “make slides” requests are really document or messaging requests. Confirm the artifact before building slides.

### Step 4: Choose the smallest artifact packet
Default to the smallest output that makes progress:
- `outline-brief` → slide-by-slide outline with takeaway + evidence + risk notes
- `storyboard` → stronger slide sequence and rough content plan before visual polish
- `review-ready-html` → browser-reviewable deck source with visual iteration still open
- `export-handoff` → approved deck plus explicit PPTX/PDF/Slides handoff status
- `sync-packet` → deck plus short list of downstream artifacts or cleanup follow-ups

Do not jump straight to exported binaries when an outline or storyboard is the real next step.

### Step 5: Build the deck from a stable source workspace
Default to a dedicated workspace such as:

```text
decks/<deck-name>/
  slide-outline.md
  slide-01-cover.html
  slide-02-...
  assets/
```

Source rules:
- keep the editable source in the deck workspace
- keep raw evidence/assets close to the deck
- revise the source slides, not the exported PPTX/PDF
- keep spreadsheet/chart dependencies explicit if numbers may refresh later
- treat PowerPoint / Google Slides / Figma as last-mile surfaces, not the hidden source of truth

Use [references/source-and-handoff-patterns.md](references/source-and-handoff-patterns.md) for source-lifecycle rules.

### Step 6: Use the mode packet, then review visually
Use [references/presentation-modes-and-routing.md](references/presentation-modes-and-routing.md) for mode-specific slide patterns.

After creating or editing slides:

```bash
slides-grab build-viewer --slides-dir decks/<deck-name>
slides-grab validate --slides-dir decks/<deck-name>
```

For visual iteration:

```bash
slides-grab edit --slides-dir decks/<deck-name>
```

Review rules:
- every slide should have one clear takeaway
- screenshots, charts, and footage must remain legible
- unsupported claims or placeholder visuals must be called out
- if async review matters, plan for PDF readability, not only live presentation flow
- if the deck will be edited outside the browser workflow, note the likely cleanup surface explicitly

Use [references/review-and-export-checklist.md](references/review-and-export-checklist.md) before export.

### Step 7: Export or hand off honestly
Only export after the chosen packet is ready.

```bash
slides-grab convert --slides-dir decks/<deck-name> --output decks/<deck-name>.pptx
slides-grab pdf --slides-dir decks/<deck-name> --output decks/<deck-name>.pdf
```

Report all of these:
- source workspace path
- artifact packet selected
- validation status
- review status (outline approved / visually approved / export-ready)
- handoff surface and likely cleanup location
- output file paths
- remaining manual-polish risks such as fonts, layout drift, chart refresh, or office-tool cleanup

### Step 8: Return the deck status in the right shape
Preferred response structure:
1. deck mode + audience
2. artifact packet selected
3. source workspace path
4. evidence used and review findings
5. export / handoff status and remaining risks

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

## Examples

### Example 1: Investor deck with explicit PPTX handoff
```text
Turn this product brief into a 10-slide investor deck. Show me the outline first, then generate the deck in decks/series-a and hand off an editable PPTX after visual review.
```

### Example 2: Architecture review deck for async review
```text
Build an 8-slide architecture review deck for our browser automation service. Use screenshots, flow diagrams, and one slide on failure handling. I need a reviewable HTML deck first and a PDF for async review.
```

### Example 3: Launch planning that should route out
```text
Help me figure out the launch messaging, channel plan, and owners for next month's release.
```
Good direction: route to `marketing-automation` unless the user also needs a concrete deck artifact.

## Best practices
1. Treat deck work as a narrative + evidence + handoff problem, not just a styling task.
2. Pick one deck mode, one packet, and one last-mile surface first.
3. Prefer a stable HTML source and regenerate exports instead of editing binaries directly.
4. Keep docs, spreadsheets, screenshots, and other upstream evidence explicit.
5. Call out where manual cleanup is likely instead of hiding fidelity limits.
6. Use the smallest packet that keeps progress honest.
7. Keep route-outs sharp: many “slides” requests are really docs, research, or marketing work.

## References
- Upstream tool: `https://github.com/vkehfdl1/slides-grab`
- Figma Slides: `https://www.figma.com/slides/`
- Marp: `https://marp.app/`
- Slidev: `https://sli.dev/`
- Google Slides: `https://workspace.google.com/products/slides/`
- Microsoft PowerPoint: `https://support.microsoft.com/en-us/powerpoint`
