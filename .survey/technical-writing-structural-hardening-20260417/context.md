# Context: technical-writing structural hardening

## Workflow Context
This lane activates when the real deliverable is an internal technical document for builders and operators: a pre-implementation spec, architecture explanation, ADR, runbook, migration plan, or implementation guide. The repo already made the conceptual boundary choice on 2026-04-13: `technical-writing` is the internal-docs anchor, distinct from `api-documentation`, `user-guide-writing`, `changelog-maintenance`, and presentation or marketing work.

The remaining problem is structural. `technical-writing/SKILL.md` is still 320 lines, includes a malformed route-out block near the end, and duplicates more mode templates and output scaffolding than the current repo-wide routing-first pattern needs. The support files already cover document modes, quality checks, and docs-as-code maintenance, so the highest-value move is to shrink the front door rather than invent another documentation wrapper.

Cross-domain scan for this run:

| Domain | Representative skill | Current state | Why not the best target now |
|------|----------------|-------------|------------------------------|
| CLI / developer workflow | `file-organization` | Recently hardened to 233 lines and merged; boundary now clean | Freshly fixed and no longer the highest-urgency dense anchor |
| Web / fullstack | `api-documentation` | Recently hardened to 201 lines and merged; support/docs sync already refreshed | Freshly fixed this run via merged PR #91 |
| Product / ops / UX | `technical-writing` | 320-line high-reuse anchor with correct boundary but oversized front door and broken route-out formatting | **Chosen**: strongest bounded remaining docs/ops anchor cleanup |
| Marketing / GTM / content | `marketing-automation` | Structurally stable and below the current watchlist threshold | Lower urgency than the dense documentation anchor |
| Game development | `steam-store-launch-ops` | Open PR exists; skill body already reduced and discovery/docs were updated there | Better to merge/update the existing PR separately than open another game-skill thread |

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Staff / senior engineer | Write or review specs, architecture docs, and ADRs before implementation | Advanced |
| Platform / SRE / ops engineer | Maintain runbooks, rollback guides, and migration plans | Advanced |
| Fullstack / backend developer | Produce internal implementation guides and operational notes | Intermediate |
| Agent maintaining docs-heavy repos | Route internal docs work without drifting into API portals, release notes, or user help | Advanced |
| Product / engineering lead | Request a decision-ready technical artifact with clear scope and assumptions | Intermediate |

## Current Workarounds
1. Read a 320-line `SKILL.md` linearly to reconstruct which mode actually fits the request.
2. Reuse the support references but still keep duplicated section skeletons and output examples in the main skill because the front door has not yet been shrunk.
3. Route internal docs manually from memory because the current route-out section is malformed and visually easy to miss.
4. Let adjacent doc requests drift into the wrong lane because the main skill spends more space on templates than on boundary enforcement.

## Adjacent Problems
- Internal technical docs can drift into API publishing unless `api-documentation` stays an explicit route-out.
- Tutorial or help-center work can drift into internal docs unless `user-guide-writing` stays explicit.
- Release notes and migration communication can be confused unless `changelog-maintenance` remains a separate lane.
- Product/marketing asks can hide inside "launch plan" language unless the skill keeps positioning and GTM work out of scope.
- The graph shows support coverage is already complete across the live skill set, so the next wins come from shrinking dense anchors and syncing derived discovery surfaces rather than adding more skills.

## User Voices
> "Diátaxis" separates tutorials, how-to guides, reference, and explanation, reinforcing that one documentation surface should not pretend all doc modes are the same. — direct page retrieval
> Source: https://diataxis.fr/

> "Documentation as Code (Docs as Code) refers to a philosophy that you should be writing documentation with the same tools as code" — Write the Docs docs-as-code guide (direct page retrieval)
> Source: https://www.writethedocs.org/guide/docs-as-code/

> "An Architectural Decision Record (ADR) captures a single AD and its rationale" — ADR project site (direct page retrieval)
> Source: https://adr.github.io/

> "Write internal technical documentation for engineers and operators... Route published API portals to `api-documentation`, end-user tutorials to `user-guide-writing`, and release-note hygiene to `changelog-maintenance`." — current repo skill front door
> Source: `.agent-skills/technical-writing/SKILL.md`
