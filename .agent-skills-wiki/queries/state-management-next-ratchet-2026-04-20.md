---
title: State Management Next Ratchet (2026-04-20)
created: 2026-04-20
updated: 2026-04-20
type: query
tags: [skills, survey, frontend, trigger-design, skill-quality, consolidation, graphify]
sources: [.survey/state-management-next-ratchet-20260420/context.md, .survey/state-management-next-ratchet-20260420/solutions.md, .survey/state-management-next-ratchet-20260420/loop-charter.md, .survey/state-management-next-ratchet-20260420/loop-results.md, .agent-skills/state-management/SKILL.md, graphify-out/GRAPH_REPORT.md]
---

# State Management Next Ratchet (2026-04-20)

## Question
What is the best bounded next improvement for `state-management` after the 2026-04-18 structural-hardening pass?

## Answer
Keep `state-management` as the canonical frontend ownership skill, but ratchet it into a faster packet-first router: force one primary packet, run an explicit wrong-owner check, and compare client stores only after URL/form/server packets are removed.

## Why this won
- Fresh survey evidence still points to ownership classification as the durable need; the ecosystem is not missing another state library or wrapper skill.
- React and React Router keep reinforcing the same distinction: local/lifted state first, route-native ownership for navigation-shaped state, and server-state ownership when cache/revalidation dominate.
- The graph layer still rewards smaller, truer front doors. `state-management` remained one of the larger frontend anchors even after the previous pass.

## Accepted change
- Shrink `state-management/SKILL.md` from 272 lines to 211 lines.
- Reframe the front door around one **primary packet** plus optional secondary packets.
- Add an explicit **wrong-owner check** so answers call out cache duplication, URL-state hiding, and one-store-for-everything drift.
- Expand evals with React Router misuse and debugging-boundary cases.
- Refresh compact/runtime discovery surfaces (`SKILL.toon`, `skills.json`, `skills.toon`) and regenerate graph artifacts.

## Rejected alternatives
- Adding another React state wrapper for router state, server caches, or “global state”.
- Expanding the skill back into a broad library tour.
- Treating performance or broken-state debugging as if they were state-ownership decisions.

## Durable takeaway
`state-management` should own one thing: classify the packet, choose the smallest viable owner, name the likely wrong owner, and hand off adjacent work fast. The next durable win came from making that loop quicker, not broader.

## Related pages
- [[frontend-skill-canonicalization]]
- [[state-management-modernization-2026-04-13]]
- [[state-management-structural-hardening-2026-04-18]]
- [[react-best-practices-support-hardening-2026-04-16]]
- [[responsive-design-structural-hardening-2026-04-19]]
