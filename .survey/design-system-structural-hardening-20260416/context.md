# Context: design-system structural hardening

## Workflow Context
`design-system` is already the canonical frontend UI-system skill, so the opportunity is no longer alias cleanup. The problem is structural: the current `SKILL.md` is 459 lines long and mixes token dumps, page-spec examples, motion CSS, accessibility checklist, handoff snippets, troubleshooting, and multi-agent notes in one front door. Repo guidance says `SKILL.md` should stay within the activation-friendly instruction budget, and neighboring frontend anchors now use a tighter pattern: short front door, explicit route-outs, then focused `references/` packets.

Primary sources:
- `.agent-skills/design-system/SKILL.md`
- `.agent-skills/design-system/references/scope-boundaries.md`
- `.agent-skills/frontend-design-system/SKILL.md`
- `.agent-skills-wiki/concepts/frontend-skill-canonicalization.md`
- `graphify-out/GRAPH_REPORT.md`
- `.agent-skills/skill-standardization/SKILL.md`

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repo maintainer | Keep canonical frontend skill, manifest, compact files, docs, graph, and wiki aligned | Advanced |
| Agent runtime | Choose the right frontend skill from metadata before loading deeper instructions | Variable |
| Frontend / product engineer | Get reusable token, governance, page-system, and handoff guidance without landing in the wrong neighboring skill | Mixed |
| Adjacent frontend skill owner | Keep `design-system`, `ui-component-patterns`, `responsive-design`, `web-accessibility`, and `web-design-guidelines` boundaries explicit | Advanced |

## Current Workarounds
1. Treat the canonical skill as a long mixed manual and manually skim to the relevant section.
2. Lean on neighboring frontend skills' sharper handoff docs to infer boundaries that the canonical `design-system` front door does not state early enough.
3. Use the alias `frontend-design-system` as a compatibility wrapper, even though the canonical folder should be the clearest source of routing guidance.
4. Accept generic examples as a proxy for system decisions instead of getting a concise packet that says what belongs in `design-system` versus another frontend lane.

## Adjacent Problems
- Nearby frontend skills now have stronger route-outs and packet templates, which makes `design-system` the last obvious example-heavy catch-all in the cluster.
- High-degree discovery nodes (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `skills.json`, `skills.toon`) depend on the canonical skill staying clear and current.
- The current skill still contains stale related-skill residue (`image-generation`), which is a concrete maintenance signal rather than a purely stylistic concern.
- Support coverage is already complete repo-wide, so the next value comes from improving dense anchors, not adding more adjacent wrapper skills.

## User Voices
> "The `description` field determines when a skill triggers. A weak description means the skill never activates; an over-broad one triggers at wrong times."  
Source: `.agent-skills/skill-standardization/SKILL.md`

> "The graph remains docs-first ... Structural maintenance should keep shifting from missing support folders to trigger clarity, boundary quality, and stale high-visibility anchors."  
Source: `graphify-out/GRAPH_REPORT.md`

> "Public inventory surfaces list frontend skills side-by-side, so duplicated descriptions create avoidable activation noise."  
Source: `.agent-skills-wiki/concepts/frontend-skill-canonicalization.md`

> "This document describes the technical specification for a file format to exchange design tokens between different tools."  
Source: `https://www.designtokens.org/tr/drafts/format/`
