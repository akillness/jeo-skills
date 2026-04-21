# Source and Handoff Patterns

`presentation-builder` works best when the deck has a stable editable source and a separate delivery artifact.

## Recommended workspace

```text
decks/<deck-name>/
  slide-outline.md
  slide-01-cover.html
  slide-02-...
  assets/
```

## Preferred lifecycle
1. Collect source evidence and visuals.
2. Create or revise the outline.
3. Generate / edit HTML slides.
4. Review visually in the local viewer.
5. Export PPTX/PDF only after approval.
6. Keep source slides as the place for future edits.

## Common handoff patterns

### HTML source + PPTX handoff
Best when the requester wants an editable office file after agent-led authoring.

Good for:
- investor decks
- executive update decks
- launch decks
- game pitch decks

### HTML source + PDF handoff
Best when the deck is mainly for async review or preserving layout fidelity.

Good for:
- workshop decks
- customer/shareable summaries
- board-read or milestone packet attachments

### HTML source + browser viewer only
Best when the deck will stay inside a technical workflow and visual review matters more than office-tool editing.

Good for:
- engineering demos
- internal architecture walkthroughs
- tool or product prototype reviews

## Failure modes to call out
- export fidelity drift
- fonts / screenshots that look correct in the viewer but weak in PPTX/PDF
- too much narrative hidden in speaker notes
- using slides to hold detail that belongs in a document instead
