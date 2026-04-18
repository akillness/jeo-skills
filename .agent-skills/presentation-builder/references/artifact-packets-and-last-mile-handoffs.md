# Artifact Packets and Last-Mile Handoffs

Use this reference when the work clearly belongs in `presentation-builder` but the next move is still unclear. The real decision is usually **which smallest deck packet to build now** and **which surface owns the last-mile cleanup**.

## Packet chooser

| Situation | Best packet | Why |
|---|---|---|
| Audience, story, or evidence is still fuzzy | `outline-brief` | Locks the narrative before visual work burns time |
| The deck structure is known but slide-by-slide content still needs shaping | `storyboard` | Stronger than bullets, cheaper than polished slides |
| The deck needs real visual review in the browser workflow | `review-ready-html` | Keeps source-of-truth editable and easy to iterate |
| The deck is approved and must ship as PPTX/PDF/Slides | `export-handoff` | Captures outputs plus cleanup risks honestly |
| The deck is one artifact in a larger launch/review package | `sync-packet` | Keeps the deck bounded while tracking downstream follow-ups |

## Packet skeletons

### 1. `outline-brief`
Use when the audience and slide promise matter more than visual polish right now.

```markdown
# Deck Outline Brief

## Deck mode
## Audience
## Final ask / decision
## Evidence set
## Slide list
- slide number
- title
- takeaway
- evidence / visual
- risk / missing proof
```

### 2. `storyboard`
Use when the deck flow exists but the team still needs stronger content framing.

```markdown
# Deck Storyboard

## Narrative arc
## Slide blocks
## Evidence gaps
## Visual notes
## Approval risks
```

### 3. `review-ready-html`
Use when the browser review loop is the next honest milestone.

```markdown
# Deck Build Status

## Workspace path
## Current mode
## Slides built
## Review findings
## Open polish items
```

### 4. `export-handoff`
Use when the deck is ready to leave the source workspace.

```markdown
# Deck Handoff Brief

## Output files
## Validation status
## Handoff surface
## Cleanup likely needed
## Remaining risks
```

### 5. `sync-packet`
Use when the deck must stay aligned with adjacent artifacts without absorbing them.

```markdown
# Deck Sync Packet

## Primary deck artifact
## Required follow-ups
- marketing brief
- technical appendix
- help doc
- spreadsheet refresh
- destination-surface cleanup
```

## Handoff surface chooser

| Surface | Best when | Caveats |
|---|---|---|
| `html-viewer` | Technical teams will review/present in the browser workflow | Weak fit for nontechnical collaborators who expect office files |
| `pptx` | Executives, investors, customers, or partners need editable office-native slides | Expect font/layout cleanup and feature loss on export/import |
| `pdf` | Async review and fidelity matter more than editability | Harder to revise downstream; animations/interactivity are gone |
| `google-slides` | Cross-functional collaboration and comments matter most | Imports may need cleanup; linked charts/tables still refresh manually |
| `figma-slides` | Design-system continuity and visual collaboration matter most | Not as universal as PPTX for external handoff |
| `mixed` | Browser source stays canonical but downstream reviewers need multiple outputs | Report which surface is canonical and where cleanup will happen |

## Common last-mile patterns
- **HTML source → PPTX handoff**: best for investor, exec, launch, and game pitch decks where final editing happens in office tooling.
- **HTML source → PDF handoff**: best for async review, board-read packets, and fidelity-first sharing.
- **HTML source → Google Slides / Figma Slides cleanup**: best when collaboration and shared editing matter more than exact browser parity.
- **Browser-only review**: best for technical demos or internal walkthroughs when no office-native deck is required.

## Common mistakes
- Jumping straight to exported binaries before the outline or storyboard is stable
- Pretending PPTX / Google Slides / Figma cleanup will not be needed when nontechnical collaborators own the final review
- Mixing the deck with the launch plan, spec, tutorial, or research manuscript instead of routing that work outward
- Treating spreadsheet-linked charts as static truth when the data will probably refresh later
- Hiding fidelity risks instead of calling out fonts, notes, animations, or layout drift explicitly
