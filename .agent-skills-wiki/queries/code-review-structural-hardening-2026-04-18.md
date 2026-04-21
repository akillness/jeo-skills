---
title: Code Review Structural Hardening
created: 2026-04-18
updated: 2026-04-18
type: query
tags: [skills, survey, trigger-design, skill-quality]
sources: [.survey/code-review-structural-hardening-20260418/context.md, .survey/code-review-structural-hardening-20260418/solutions.md, graphify-out/GRAPH_REPORT.md, .agent-skills/code-review/SKILL.md, .agent-skills/code-review/references/intake-packets-and-escalations.md]
---

# Code Review Structural Hardening

## Question
What is the best bounded next improvement for the existing `code-review` skill now that support coverage is already complete across the live skill catalog?

## Answer
Harden `code-review` in place.

The strongest move was to shrink the front door around an evidence-first intake contract instead of adding another review wrapper. Hosted review platforms and bot tooling already cover approval mechanics, ownership routing, and automated annotations. The missing reusable layer inside this repo is still reviewer judgment on a concrete change: what is risky, what proof is missing, what blocks merge, and which neighboring skill owns the next step when the job shifts.

## Why this won
1. The graph refresh still places `code-review` among the highest-degree skill nodes, which makes it a high-leverage front door to simplify rather than duplicate.
2. GitHub PR reviews, CODEOWNERS, GitLab approval rules, reviewdog, and Danger all reinforce the same boundary: platform/admin and bot-assist surfaces are not the same thing as reviewer judgment.
3. The existing `code-review` skill was already directionally correct, but it still carried more repeated packet/output detail than needed for a routing-first skill.
4. The repo-wide maintenance pattern after support coverage reached 100% is now clear: shrink dense anchors, move reusable packets into references, sync compact/discovery surfaces, and expand evals where route boundaries are easy to regress.

## Accepted changes
- Rewrite `code-review/SKILL.md` into a smaller evidence-first review front door
- Add `references/intake-packets-and-escalations.md`
- Expand `evals/evals.json` with repo-admin and gameplay-validation cases
- Refresh `SKILL.toon`, `skills.json`, `skills.toon`, `README.md`, `README.ko.md`, and `setup-all-skills-prompt.md`
- Refresh graph artifacts and wiki memory for the code-quality cluster

## Rejected changes
- Adding another PR-review / secure-review / merge-readiness wrapper in the same lane
- Letting `code-review` absorb reviewer assignment, CODEOWNERS handling, branch rules, merge queue operations, or other repo-admin workflows
- Treating CI bot comments as the review itself
- Folding Git cleanup, debugging, test-policy, visual-governance, and review judgment back into one generic quality surface

## Durable findings
- Review quality improves when the packet shape is explicit: diff only, diff + tests, schema/auth rollout, preview/screenshot, bot annotations, game/runtime validation, or mixed packet.
- Missing evidence is still a first-class review outcome, not just a footnote after bug-finding.
- CODEOWNERS, branch protection, review requests, and approval rules matter, but they belong to routing/admin layers around review rather than inside the reviewer-judgment core.
- Bot tooling like reviewdog and Danger is best treated as evidence and policy input, not as the final merge-readiness decision.

## Related pages
- [[code-quality-cluster]]
- [[skill-support-coverage]]
- [[code-review-modernization-2026-04-13]]
- [[debugging-structural-hardening-2026-04-18]]
- [[performance-optimization-structural-hardening-2026-04-18]]
