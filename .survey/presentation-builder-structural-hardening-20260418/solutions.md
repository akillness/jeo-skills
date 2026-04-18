# Solution Landscape: presentation-builder structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| slides-grab | Agent-first HTML slide authoring, browser review, export/handoff | Best fit for AI-authored editable source + review loop; validates and previews deck work | PPTX/Figma handoff is still experimental/unstable; manual cleanup remains likely | Strongest upstream match for `presentation-builder` ([npm](https://www.npmjs.com/package/slides-grab), [GitHub](https://github.com/vkehfdl1/slides-grab)) |
| Slidev | Markdown + Vue/Vite developer slide system | Excellent for developer-native authoring, demos, and interactive technical decks | More web-app complexity; office-native editing is still downstream, not native | Strong for dev/workshop/architecture modes ([Slidev README](https://github.com/slidevjs/slidev/blob/main/README.md)) |
| Marp / Marp CLI | Markdown-to-HTML/PDF/PPTX/images pipeline | Mature CLI export path; good for workshops, docs-adjacent decks, and CI-friendly flows | Editable PPTX is less reproducible and not feature-complete | Strong export reference for structured handoff ([Marp CLI README](https://github.com/marp-team/marp-cli/blob/main/README.md)) |
| reveal.js | HTML/Markdown web presentation framework | Flexible long-lived OSS option for browser-hosted decks | Weak office-native last-mile editing; more web skill required | Good indirect competitor for engineering/browser-first decks ([reveal.js](https://revealjs.com/)) |
| PowerPoint | Native PPTX editing and review surface | De facto downstream handoff format for mixed teams and external sharing | Weak as an agent-friendly source-of-truth format | Usually the last-mile editor, not the source workspace ([Microsoft PowerPoint](https://support.microsoft.com/en-us/powerpoint)) |
| Google Slides | Browser-native collaboration and async review | Easy sharing/comments; common PM/marketing destination surface | Import fidelity limits; less precise than code-first authoring | Frequent destination for cross-functional review ([Google Slides](https://workspace.google.com/products/slides/)) |
| Figma Slides | Design-first collaborative slide tool | Strong design-system continuity and co-editing | Newer, less universal as final delivery surface | Useful destination when design polish matters most ([Figma Slides](https://www.figma.com/slides/)) |
| Beautiful.ai / Pitch class tools | AI-assisted/browser-native deck builders | Fast ideation, templates, analytics, and editable office exports | Still rely on docs/outlines upstream and PowerPoint/PDF downstream | Good evidence that AI deck builders still need last-mile cleanup ([Beautiful.ai export docs](https://support.beautiful.ai/hc/en-us/articles/30629528652685-Exporting-your-slides-and-presentations), [Pitch](https://pitch.com/)) |

## Categories
- **Agent-first editable-source authoring:** slides-grab
- **Developer-native slide frameworks:** Slidev, Marp, reveal.js
- **Editable destination surfaces:** PowerPoint, Google Slides, Figma Slides
- **AI/browser-native deck builders:** Beautiful.ai, Pitch
- **Indirect substitutes / JTBD alternatives:** docs + outline workflows, spreadsheet-linked charts, and memo/brief artifacts that later become decks ([Beautiful.ai AI workflow](https://support.beautiful.ai/hc/en-us/articles/12885226948109-Creating-a-presentation-with-AI), [Google linked objects](https://support.google.com/docs/answer/7009814?hl=en))

## What People Actually Use
Real behavior is more layered than vendor marketing:
- briefs/docs/links/screenshots/spreadsheets upstream
- HTML/Markdown/browser-native tooling for fast authoring or technical review
- PowerPoint / Google Slides / PDF / Figma as the last-mile review or handoff surface
- manual cleanup for fonts, animations, chart refreshes, or collaboration needs when the export boundary leaks

That means the durable workflow is not “generate final deck once.” It is “choose the right packet, build a reviewable source, then hand off honestly to the destination surface.”

## Frequency Ranking
1. PowerPoint
2. Google Slides
3. Slidev
4. Marp
5. Figma Slides
6. reveal.js
7. Beautiful.ai / Pitch-style AI deck builders
8. slides-grab

The ranking is based on likely real-world destination or workflow frequency across dev/product/marketing/game teams, not on elegance of authoring alone. `slides-grab` is strategically important here because it matches the repo’s AI-agent workflow, but it is not yet the universal last-mile surface.

## Key Gaps
- No single tool cleanly owns both **agent-friendly source authoring** and **editable office-native last-mile handoff**.
- Export fidelity, font handling, interactivity, and notes still degrade across boundaries.
- Many requests that mention “deck” are really asking for one of several smaller artifact packets: outline, storyboard, browser-reviewed HTML deck, PDF async handoff, or editable PPTX/Slides cleanup packet.
- Spreadsheet/data refresh and destination-surface cleanup remain manual and should be planned explicitly, not implied away.

## Contradictions
- Vendors market AI deck creation as streamlined, but their docs still start from outlines, docs, links, spreadsheets, and staged refinement rather than one-shot finished decks ([Beautiful.ai AI workflow](https://support.beautiful.ai/hc/en-us/articles/12885226948109-Creating-a-presentation-with-AI)).
- Developer-native frameworks promise flexible presentation authoring, but real users still hit office-file sharing pressure and export drift ([reveal.js issue #1702](https://github.com/hakimel/reveal.js/issues/1702), [Marp issue #141](https://github.com/marp-team/marp-cli/issues/141)).
- Editable export exists, but it often comes with caveats about reproducibility, unsupported features, or downstream manual cleanup ([Marp CLI README](https://github.com/marp-team/marp-cli/blob/main/README.md), [Beautiful.ai editable PowerPoint export](https://support.beautiful.ai/hc/en-us/articles/360035562031-How-do-I-export-as-an-editable-PowerPoint)).

## Key Insight
The best bounded improvement is not another deck-generation wrapper. It is tightening `presentation-builder` into a routing-first deck artifact front door that chooses one deck mode, one smallest useful artifact packet, and one destination handoff surface early. That aligns the skill with how deck work actually happens across developer demos, PM reviews, GTM decks, and game pitches: source material first, visual review in the middle, and explicit last-mile office or async handoff at the end.
