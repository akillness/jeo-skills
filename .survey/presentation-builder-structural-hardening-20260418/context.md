# Context: presentation-builder structural hardening

## Workflow Context
`presentation-builder` already targets a real cross-domain workflow: an editable slide artifact that has to move from source material to browser review and then into PPTX/PDF or another collaboration surface. The same shape shows up in developer demos, roadmap/QBR decks, launch/GTM decks, workshop decks, investor decks, and game pitch or milestone decks.

Across the landscape, the upstream material is rarely “just make slides from nothing.” Official AI/deck tooling still starts from prompts plus briefs, docs, PDFs, links, screenshots, charts, or spreadsheets rather than a one-shot finished deck ([Beautiful.ai AI workflow](https://support.beautiful.ai/hc/en-us/articles/12885226948109-Creating-a-presentation-with-AI), [Google linked objects](https://support.google.com/docs/answer/7009814?hl=en), [PptxGenJS README](https://github.com/gitbrent/PptxGenJS/blob/master/README.md)). Developer-native tools keep HTML/Markdown/browser workflows strong, but office-native handoff still matters because downstream reviewers often live in PowerPoint, Google Slides, or increasingly Figma Slides ([Slidev README](https://github.com/slidevjs/slidev/blob/main/README.md), [Marp CLI README](https://github.com/marp-team/marp-cli/blob/main/README.md), [Figma Slides](https://www.figma.com/slides/)).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Developer / solutions engineer | Turn demos, architecture explanations, and screenshots into reviewable technical decks | Medium–high |
| Product / ops lead | Prepare roadmap, KPI, QBR, and decision decks from mixed notes, charts, and status docs | Medium |
| Marketing / GTM operator | Convert launch planning, messaging, owners, and timelines into stakeholder-facing slide artifacts | Medium |
| Founder / sales / BD lead | Build investor or executive decks with a clean narrative and editable downstream file | Medium |
| Game producer / studio founder | Build publisher pitch or milestone update decks with visual proof, milestones, budget, and ask | Medium |

## Current Workarounds
1. Author the story in docs first, then turn the approved outline into slides later because direct “prompt to finished deck” remains unreliable ([Beautiful.ai AI workflow](https://support.beautiful.ai/hc/en-us/articles/12885226948109-Creating-a-presentation-with-AI)).
2. Keep charts and tables in Sheets or another data source, then paste/import/link them into slides and refresh manually when numbers change ([Google linked objects](https://support.google.com/docs/answer/7009814?hl=en), [Beautiful.ai data import](https://support.beautiful.ai/hc/en-us/articles/360029683592-How-can-I-import-my-Data)).
3. Use HTML-first or Markdown-first slide tools for authoring, but still export to PPTX/PDF and do final cleanup in PowerPoint or another office-style editor for nontechnical collaborators ([Marp CLI README](https://github.com/marp-team/marp-cli/blob/main/README.md), [Beautiful.ai editable PowerPoint export](https://support.beautiful.ai/hc/en-us/articles/360035562031-How-do-I-export-as-an-editable-PowerPoint)).
4. Fall back to PDF when fidelity matters more than editability because browser/native exports and imports still drift ([Beautiful.ai export docs](https://support.beautiful.ai/hc/en-us/articles/30629528652685-Exporting-your-slides-and-presentations), [Slidev issue #2013](https://github.com/slidevjs/slidev/issues/2013)).
5. Patch environment or font issues manually when export pipelines depend on browser engines, LibreOffice, or local PowerPoint setup ([Marp issue #631](https://github.com/marp-team/marp-cli/issues/631), [Beautiful.ai custom fonts in PowerPoint](https://support.beautiful.ai/hc/en-us/articles/360035539832-Installing-Custom-Fonts-in-PowerPoint)).

## Adjacent Problems
- Export fidelity and feature loss: animations, fragments, links, or speaker notes often do not survive PPTX/PDF handoff cleanly ([Marp issue #141](https://github.com/marp-team/marp-cli/issues/141), [Beautiful.ai export docs](https://support.beautiful.ai/hc/en-us/articles/30629528652685-Exporting-your-slides-and-presentations)).
- Collaboration-surface mismatch: engineering-friendly HTML decks still need an office-native landing zone for broader stakeholder review ([reveal.js issue #1702](https://github.com/hakimel/reveal.js/issues/1702)).
- Data-refresh friction: linked objects and charts remain manual refresh workflows instead of durable sync ([Google linked objects](https://support.google.com/docs/answer/7009814?hl=en)).
- Accessibility and async review remain separate concerns from slide generation itself: PDF handouts, readability, and non-live consumption need explicit review steps ([Slidev issue #2426](https://github.com/slidevjs/slidev/issues/2426)).
- Brand/template continuity still leaks into template loading, font installation, and destination-tool cleanup ([PptxGenJS template issue](https://github.com/gitbrent/PptxGenJS/issues/27), [Beautiful.ai custom fonts in PowerPoint](https://support.beautiful.ai/hc/en-us/articles/360035539832-Installing-Custom-Fonts-in-PowerPoint)).

## User Voices
- “These work in Chrome so I had to use it for exporting. The CLI could also be used.” — Slidev user on export inconsistency across browsers ([Slidev issue #2013](https://github.com/slidevjs/slidev/issues/2013))
- “The fragmented effect works fine in HTML, but not in PPTX.” — Marp user on HTML-to-PPTX mismatch ([Marp issue #141](https://github.com/marp-team/marp-cli/issues/141))
- “LibreOffice soffice binary could not be found.” — Marp editable-PPTX export user on environment friction ([Marp issue #631](https://github.com/marp-team/marp-cli/issues/631))
- “it’s difficult to provide a simple way to share content to people who are usually using .ppt or .odp files” — reveal.js user on office-native collaboration pressure ([reveal.js issue #1702](https://github.com/hakimel/reveal.js/issues/1702))
- “may I check if I can load pptx template from server to browser then replace / insert content” — PptxGenJS user on browser-side template-driven handoff needs ([PptxGenJS issue #27](https://github.com/gitbrent/PptxGenJS/issues/27))
