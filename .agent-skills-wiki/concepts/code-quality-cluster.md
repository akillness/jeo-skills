---
title: Code Quality Cluster
created: 2026-04-13
updated: 2026-04-13
type: concept
tags: [skills, consolidation, trigger-design, skill-quality]
sources: [.survey/testing-strategies-modernization-20260413/context.md, .survey/testing-strategies-modernization-20260413/solutions.md, graphify-out/GRAPH_REPORT.md]
---

# Code Quality Cluster

## Durable finding
The code-quality lane is cleaner when each high-traffic skill owns a different stage of the confidence loop instead of all of them offering generic "quality" advice.

Current cluster shape:
- `testing-strategies` = policy and orchestration: choose validation depth, gate scope, and exception language
- `backend-testing` = implementation: write or repair API/service/database/fixture/contract coverage
- `debugging` = diagnosis: reproduce, isolate, and verify failures or flake causes
- `code-review` = judgment: assess whether a specific diff is safe, convincing, and ready

## Why it matters
- Trigger precision improves when policy, implementation, diagnosis, and review are not collapsed into one generic testing/debugging skill.
- Modernization work compounds: strengthening one anchor skill makes the next boundary easier to define.
- Discovery docs are enough to steer activation, but only if the canonical anchors have clear one-line roles.

## Boundary rules
- If the question is **"what should we test?"** → `testing-strategies`
- If the question is **"how do we implement those backend tests?"** → `backend-testing`
- If the question is **"why is this test or system failing?"** → `debugging`
- If the question is **"is this diff/PR ready?"** → `code-review`

## Structural note
The graph refresh after the `testing-strategies` modernization strengthened the same pattern already visible after `debugging` and `code-review`: improving a legacy anchor with support files is more valuable than creating another wrapper skill in the code-quality lane.

## Related pages
- [[skill-support-coverage]]
- [[backend-api-cluster]]
- [[debugging-modernization-2026-04-13]]
- [[code-review-modernization-2026-04-13]]
- [[testing-strategies-modernization-2026-04-13]]
