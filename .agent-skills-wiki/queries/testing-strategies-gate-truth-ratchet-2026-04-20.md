---
title: Testing Strategies Gate-Truth Ratchet (2026-04-20)
created: 2026-04-20
updated: 2026-04-20
type: query
tags: [skills, survey, trigger-design, skill-quality, consolidation]
sources: [.survey/testing-strategies-gate-truth-ratchet-20260420/context.md, .survey/testing-strategies-gate-truth-ratchet-20260420/solutions.md, .survey/testing-strategies-gate-truth-ratchet-20260420/loop-charter.md, .survey/testing-strategies-gate-truth-ratchet-20260420/loop-results.md, .agent-skills/testing-strategies/SKILL.md]
---

# Testing Strategies Gate-Truth Ratchet (2026-04-20)

## Question
What is the best bounded next improvement for `testing-strategies` after the 2026-04-19 packet-first structural-hardening pass?

## Answer
Keep `testing-strategies` as the policy anchor, but ratchet it around **gate truth**: make the skill name whether the user is shaping merge blockers, release-only proof, or scheduled breadth before it recommends layers or route-outs.

## Why this won
- Fresh survey evidence still points to the same durable gap: teams confuse protected-branch blocking checks with full release confidence, and they drag launch/platform checklist work back into ordinary PR gating.
- The code-quality lane split is still right; the repo does not need another QA/release wrapper.
- The graph still recommends bounded front-door ratchets over catalog growth.

## Accepted change
- Reframe `testing-strategies` around explicit `merge-gate-truth`, `release-gate-truth`, and `scheduled-breadth-truth` decisions.
- Add `references/gate-truth-and-release-handovers.md` for merge-vs-release-vs-scheduled boundary handling.
- Expand evals with protected-branch and Steam/build-checklist boundary cases.
- Refresh compact/runtime discovery surfaces (`SKILL.toon`, `skills.json`, `skills.toon`) plus README / README.ko / setup wording.

## Rejected alternatives
- Adding a separate release-readiness or QA-governance wrapper.
- Expanding `testing-strategies` back into a generic test-pyramid lecture.
- Treating platform launch checklist work as justification for broader branch-blocking PR coverage.

## Durable takeaway
`testing-strategies` should decide the truthful confidence gate first, then choose the smallest convincing evidence and the next owner. Merge checks, release proof, and scheduled breadth are related, but they are not the same contract.

## Related pages
- [[code-quality-cluster]]
- [[testing-strategies-modernization-2026-04-13]]
- [[testing-strategies-structural-hardening-2026-04-19]]
- [[steam-store-launch-ops-packet-first-hardening-2026-04-20]]
- [[performance-optimization-structural-hardening-2026-04-18]]
