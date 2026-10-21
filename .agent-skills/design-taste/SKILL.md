---
name: design-taste
description: >
  Operate madebymustafa/design-taste as a selective genre-and-craft reference
  for a brief-led marketing page or portfolio. Use when the user names Mustafa,
  madebymustafa/design-taste, its corporate-trust or editorial-minimal packs,
  or asks to choose among that repository's genre identities. Route ordinary
  anti-generic frontend work and Leonxlnx dial-based taste work to
  design-taste-frontend; route visual-effect recipe discovery to web-design.
allowed-tools: Read Grep Glob Bash Write Edit WebFetch
compatibility: >
  Stack-neutral design guidance. Normal use needs only this folder and read-only
  access to a selected public upstream reference; no upstream installer required.
metadata:
  version: "1.0.0"
  source: https://github.com/madebymustafa/design-taste
---

# Design Taste

A narrow operator for Mustafa's genre-and-craft collection, not a replacement
for the separately sourced `design-taste-frontend` skill.
Read [source and license evidence](references/upstream.md) before fetching a pack.

## When to use this skill

- The brief explicitly selects madebymustafa/design-taste or one of its packs.
- A user wants one identity selected from this repository's genre catalog.
- A named pack must be adapted without overriding brand or accessibility needs.

| Primary job | Owner |
| --- | --- |
| Generic-looking frontend or Leonxlnx's three dials | `design-taste-frontend` |
| Choose a MengTo visual or motion recipe | `web-design` |
| Adopt an animated React Bits component | `react-bits` |
| Shared token or primitive governance | `design-system` |
| Accessibility audit or remediation | `web-accessibility` |

Keep this operator independently usable: the local procedure below does not
require another skill to be installed. Route names identify adjacent ownership.

## Instructions

### 1. State the design read

Record page kind, audience, primary decision, protected assets and one intended
visual language. Use existing copy and assets before inventing replacements.
A sufficient read might be: enterprise product page for procurement buyers,
quiet evidence-led composition, existing brand blue and logo preserved.
Finish this step with a concrete hierarchy decision, not a claim of good taste.
If two interpretations change the audience or task, ask one focused question.

### 2. Select one genre, then only the needed craft

Use the catalog in the source reference to shortlist a single genre.
Read its pinned `skills/<pack>/SKILL.md` before applying its details.
Choose a craft skill only for a specific unresolved problem, such as typography
or motion. Read that selected source before using its rules.
The upstream README lists additional packs; listing is not evidence that their
implementation has been inspected by this operator's author.

Treat core rules as contextual defaults. `corporate-trust`, for example, uses
system sans and conventional grids, overriding the core's display contrast and
asymmetry preferences. Do not combine incompatible identities into one page.
Complete the selection by naming the chosen pack and any deliberate override.

### 3. Translate the identity into the existing page

Change the smallest set of hierarchy, type, spacing and color decisions that
expresses the selected identity. Preserve working navigation, form behavior,
legal copy, truthful product claims and the user's protected branding.
Prefer existing tokens and dependencies; an aesthetic choice does not justify
a second styling system, a new animation library or an unsolicited redesign.
Do not transplant demo names, invented metrics or compliance badges as facts.

### 4. Make motion optional and content durable

Start static. Add motion only where it explains a state or reading sequence.
Provide a reduced-motion path that leaves headings, links and actions visible.
For any added animation, identify its owner and cancellation/unmount path;
remove duplicate listeners or perpetual work introduced by the change.
A decorative effect must not be required to find or activate an action.

### 5. Verify the actual change

Check narrow and wide layouts, keyboard order, visible focus, readable contrast,
zoom/reflow and error/loading states on any controls touched by the change.
Inspect the reduced-motion result separately from the animated version.
Use a screenshot or live-page check when available; source review alone is not
visual or assistive-technology proof. Report unavailable checks as unverified.
Measure any performance claim on the target page rather than repeating upstream
marketing language or assuming that fewer effects makes a page fast.

### 6. Deliver a bounded design decision

Return the design read, selected source pin and pack, protected elements,
changed surfaces, checks actually run and unresolved failures.
Describe specific choices and observable results rather than promising
conversion gains, an award-winning result or an objectively premium aesthetic.

## Approval boundaries

Reading a public pinned pack is the normal path. Ask separately before
installing upstream skills, adding dependencies, changing global agent paths,
using paid assets or publishing/deploying the result.
The upstream installer targets multiple agent directories; it is not a normal
prerequisite. Manual upstream installation can also collide with this skill's
`design-taste` name, so identify destination and overwrite behavior first.

## Examples

- "Use Mustafa's corporate-trust for our fintech landing page." Select that
  pack, preserve evidence and brand, and keep the conventional typography/grid.
- "Make this less generic using the 8/6/4 dials." Route to
  `design-taste-frontend`; Mustafa's operator does not own those dials.

## Best practices

Use one identity, inspect only relevant craft, and keep functional content ahead
of decoration. Newer repository activity alone is not a reason to retire an
unrelated taste skill.

## References

- [Pinned sources, complete license observation and boundaries](references/upstream.md)
- [Behavioral fixtures, authored but not executed](evals/evals.json)
