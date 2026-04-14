---
title: Playwriter modernization 2026-04-15
created: 2026-04-15
updated: 2026-04-15
type: query
tags: [skills, survey, trigger-design, skill-quality, docs, graphify]
sources: [.survey/playwriter-modernization-20260415/triage.md, .survey/playwriter-modernization-20260415/context.md, .survey/playwriter-modernization-20260415/solutions.md, .survey/playwriter-modernization-20260415/platform-map.md, graphify-out/GRAPH_REPORT.md]
---

# Playwriter modernization 2026-04-15

## Why this was the best bounded improvement
`playwriter` was a high-utility browser skill, but it still read like a command-heavy Playwright/MCP guide instead of a decision-first router. The strongest bounded improvement was to modernize the existing skill rather than add another browser wrapper, because the real repo gap was **runtime choice clarity**: running-browser reuse versus fresh-session isolation.

## Durable findings
- `playwriter` should own the **running-browser / authenticated-session reuse** lane.
- `agent-browser` should remain the clean fresh-session / deterministic verification lane.
- The most important trigger text is not “browser automation,” but phrases like “use the browser I already have open,” “don’t make me log in again,” and “keep my current Chrome tabs / cookies / extensions.”
- Upstream `playwriter` behavior is better represented by an explicit `browser start` + `session new` flow and explicit tab consent than by vague wording that implies the extension invisibly handles everything.
- Support-file ratchets matter here because `playwriter` is a high-visibility browser skill with cross-platform MCP appeal; adding `references/` and `evals/` improves future maintenance more than another one-off wrapper would.

## Accepted changes
- Rewrote `playwriter/SKILL.md` into a decision-first running-browser skill with explicit route-outs to `agent-browser`.
- Added `references/` docs for routing, session workflow, and MCP integration.
- Added `evals/evals.json` covering logged-in-browser activation, clean-browser route-out, and MCP/browser-bridge prompts.
- Updated `SKILL.toon` plus README / README.ko / setup prompt / `skills.json` so discovery surfaces reflect the stronger role.
- Refreshed graph outputs and recorded the improved support coverage and boundary clarity.

## Rejected changes
- Adding another browser skill for "authenticated browser automation" — the repo already had the right anchor, just not the right framing.
- Letting `playwriter` compete directly with `agent-browser` as a generic browser tool.
- Treating MCP as a runtime answer instead of an integration layer above runtime choice.

## Structural note
The graph refresh after this run showed the same general pattern as earlier maintenance passes: a weaker high-traffic anchor is usually better fixed by support files plus clearer route-outs than by catalog expansion. `playwriter` now fits that pattern cleanly.

## Related pages
- [[skill-support-coverage]]
- [[core-orchestration-platform-cluster]]
- [[skill-standardization-variant-sync-2026-04-15]]
- [[ohmg-modernization-2026-04-15]]
