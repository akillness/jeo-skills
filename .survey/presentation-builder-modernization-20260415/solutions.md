# Solution Landscape: presentation-builder modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Canva Presentations / Magic Design | Design-first collaborative deck builder with AI drafting | Strong templates, brand kits, collaboration, broad business familiarity | Less git-friendly; weak for code-first reproducibility | Good for marketing-heavy and visually branded decks ([Canva Presentations](https://www.canva.com/presentations/), [Magic Design](https://www.canva.com/magic-design/)) |
| Microsoft PowerPoint + Copilot | Mainstream enterprise editor + AI | Strongest `.pptx` target, mature review/comment workflows, enterprise handoff | Proprietary editing model, weaker reproducibility | Default editable target in many orgs ([PowerPoint](https://www.microsoft.com/microsoft-365/powerpoint), [Copilot for PowerPoint](https://www.microsoft.com/microsoft-365/copilot/powerpoint)) |
| Google Slides + Workspace AI | Browser-native slide collaboration | Easy sharing/comments, familiar review flow, common handoff target | Export fidelity drift, limited deterministic structure | Strong for lightweight collaboration ([Google Slides](https://workspace.google.com/products/slides/), [Gemini for Workspace](https://workspace.google.com/products/gemini/)) |
| Gamma | AI-native deck/doc builder | Fast prompt-to-deck drafting, modern layouts, easy sharing | Less deterministic, weaker office round-tripping | Good for fast first drafts ([Gamma](https://gamma.app/)) |
| Pitch | Collaborative presentation platform | Strong team workflow, comments, startup/product popularity | Platform-centric; office export still needed | Good for team presentation authoring ([Pitch](https://pitch.com/)) |
| Beautiful.ai | Layout-automation presentation tool | Rapid polished output, strong auto-layout guidance | Lower low-level control, generated designs can fight bespoke needs | Useful for speed-oriented business decks ([Beautiful.ai](https://www.beautiful.ai/)) |
| Tome | AI storytelling / presentation canvas | Good for narrative prototyping | Less conventional office-editable workflow | More story-first than editability-first ([Tome](https://tome.app/)) |
| Figma Slides | Design-system-aware collaborative slide surface | Good for visually demanding decks, embeds, design reuse | Not the universal stakeholder-editable default yet | Often paired with Slides/PPT workflows ([Figma Slides](https://www.figma.com/slides/), [Introducing Figma Slides](https://www.figma.com/blog/introducing-figma-slides/)) |
| Marp | Markdown-first slide authoring with HTML/PDF/PPTX export | Git-friendly, reproducible, good bridge from structured text to deck artifacts | Advanced layout work may still need CSS; office fidelity not perfect | Strong model for code/docs-first authoring ([Marp](https://marp.app/)) |
| Slidev | Developer-first HTML/Vue slide system | Great for code, demos, interactive decks, reusable components | Best for technical audiences; weaker office-native handoff | Strong signal for developer workflows ([Slidev](https://sli.dev/)) |
| reveal.js | HTML slide framework | Highly extensible, programmable, web-native | More framework than turnkey deck builder | Good for custom interactive decks ([reveal.js](https://revealjs.com/)) |
| Quarto Presentations | Reproducible publishing / data-slide workflow | Great for code, notebooks, analytics-heavy decks | Less suited for heavily branded business decks | Strong in technical/reporting contexts ([Quarto presentations](https://quarto.org/docs/presentations/)) |
| PptxGenJS | Programmatic PowerPoint generation | Deterministic `.pptx` output from structured content | Not a visual editor; design iteration must be abstracted | Important for export automation ([PptxGenJS](https://pptxgenjs.github.io/pptxgenjs/)) |

## Categories
- **Mainstream editable targets:** PowerPoint, Google Slides
- **AI deck builders:** Canva Magic Design, Gamma, Beautiful.ai, Tome, Copilot/Gemini features
- **Design-system / visual collaboration tools:** Figma Slides, Canva, Pitch
- **HTML / Markdown / code-first slide systems:** Marp, Slidev, reveal.js, Quarto
- **Programmatic export / generation tools:** PptxGenJS, Google Slides API, Microsoft automation surfaces

## What People Actually Use
- Teams still rely on Google Slides and PowerPoint for final review and stakeholder handoff.
- Figma and Canva are frequently used for the visually demanding slides or early narrative polish.
- AI builders help draft outlines and first-pass decks, but final manual editing still happens in familiar slide tools.
- Technical teams use Markdown/HTML slide tools for reproducibility, but still need PDF/PPTX handoff for nontechnical audiences.

## Frequency Ranking
1. PowerPoint-centric workflows
2. Google Slides-centric workflows
3. Canva / design-led collaborative deck workflows
4. AI deck builders (Gamma, Beautiful.ai, Pitch, Tome)
5. HTML / Markdown slide systems (Marp, Slidev, reveal.js, Quarto)
6. Programmatic export and generation tooling (PptxGenJS, Slides API, Microsoft automation)

## Key Gaps
- No universal neutral deck schema across Slides, PowerPoint, and HTML-first systems.
- Final-mile editability and deterministic source control are still split across different tools.
- Review/approval workflows remain fragmented from content generation.
- Brand rules, slide-density rules, and export choices are often implicit instead of explicit.
- Most AI deck tools solve blank-page pain, not durable source-of-truth or round-trip editing.

## Contradictions
- Vendor tools market “generate a deck fast,” but teams still hand-edit structure, visuals, and exports afterward.
- HTML-first systems are best for reproducible source, but many stakeholders still require PowerPoint/Slides/PDF.
- Design-first tools make strong visual slides, but source review and structured regeneration remain weaker than text-first systems.

## Key Insight
`presentation-builder` should not act like a generic slides-grab command catalog. The durable job is helping an agent decide when a request really needs a presentation artifact, choose the right presentation mode, keep a stable structured source, iterate visually, and hand off an actually editable output (or PDF) without blurring into general documentation or marketing-copy work.
