---
title: OpenContext Modernization 2026-04-15
created: 2026-04-15
updated: 2026-04-15
type: query
tags: [skills, survey, trigger-design, skill-quality, graphify]
sources: [.survey/opencontext-modernization-20260415/context.md, .survey/opencontext-modernization-20260415/solutions.md, .survey/opencontext-modernization-20260415/platform-map.md, graphify-out/GRAPH_REPORT.md]
---

# OpenContext Modernization 2026-04-15

## Question
What is the highest-value bounded improvement after the latest utility-skill passes, given the required hourly scan across CLI/dev workflow, web/fullstack, PM/ops, marketing/content, and game-development lanes?

## Answer
Modernize `opencontext` rather than adding another memory wrapper.

Why:
1. The broad hourly scan found no stronger bounded support-gap than the active project-memory lane.
2. `opencontext` had no `references/` or `evals/` and still behaved like a command catalog.
3. Upstream evidence and adjacent repo skills showed a clear boundary: `opencontext` for active project/repo memory, `llm-wiki` for compounding markdown knowledge bases, `graphify` for structural memory, and note/vault tools for human-authored organization.
4. The graph refresh confirmed this was another support-file ratchet opportunity, not a new-skill opportunity.

## Accepted changes
- Rewrote `opencontext/SKILL.md` into a decision-first workflow with explicit route-outs
- Added `references/memory-layer-decision-guide.md`
- Added `references/load-search-store-playbook.md`
- Added `references/setup-and-integration.md`
- Added `evals/evals.json`
- Refreshed `SKILL.toon`, `skills.json`, `skills.toon`, `README.md`, `README.ko.md`, and `setup-all-skills-prompt.md`
- Refreshed graph artifacts and recorded the persistent-memory boundary in the wiki

## Rejected changes
- Adding another generic persistent-memory or agent-memory wrapper
- Treating OpenContext as a replacement for `llm-wiki` or `graphify`
- Keeping the skill as a raw command list with no support files

## Durable takeaway
When a user asks for persistent context in active delivery work, the first routing question should be: **project-memory packet, compounding wiki, structure graph, or human-authored notes?** `opencontext` only owns the first of those.

## Related pages
- [[persistent-memory-cluster]]
- [[skill-support-coverage]]
- [[developer-workflow-cluster]]
