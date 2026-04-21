# Solution Landscape: git-workflow structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| `git-workflow` structural hardening | Keep the canonical skill, shrink the front door, move packet detail into focused references, refresh evals + compact/discovery surfaces | Preserves the existing cluster boundary, improves trigger clarity, matches the repo's post-support-coverage maintenance pattern | Requires synchronized updates across `SKILL.md`, `SKILL.toon`, README surfaces, setup prompt, wiki, and graph artifacts | Best bounded fit for this run |
| Add another Git wrapper skill | New skill for push safety, recovery, or PR-prep subcases | Might look narrower at first glance | Creates duplicate activation pressure in a lane the wiki already says is cleanly owned by `git-workflow` | Reject |
| Leave `git-workflow` alone | No code/docs churn today | Zero risk | Keeps a 298-line front door in a high-frequency utility skill despite graph advice to shrink dense anchors | Weak keep option |
| Broaden hosted PR skills instead | Tell users to use PR/repo-management skills for most Git asks | Strong hosted-service coverage | Breaks the current local-vs-hosted boundary; local history cleanup is still a different problem | Reject |

## Categories
- **Canonical in-place hardening:** shrink front door, keep boundary, move depth to references.
- **Duplicate creation:** add a wrapper for one subcase like recovery or push safety.
- **Status quo:** accept current front-door size and rely on reader discipline.
- **Boundary drift:** blur local Git mechanics into hosted PR/repo-management flows.

## What People Actually Use
In practice, Git users still need quick local decisions: whether to rebase or merge, how to push rewritten history safely, how to recover after a bad reset, and how to get a diff ready for review without asking for PR metadata yet. The repo's eval prompts, prior wiki decision, and upstream docs all line up on the same reality: users are not asking for a Git encyclopedia; they need a short safe-path brief. That makes the in-place hardening option stronger than any new wrapper.

## Frequency Ranking
1. `git-workflow` structural hardening — strongest fit because it improves a high-traffic utility anchor already visible in discovery docs and the developer-workflow cluster.
2. `sprint-retrospective` structural hardening — also oversized, but the PM lane just received a fresh `task-planning` ratchet in PR #97.
3. `vercel-deploy` or `fabric` follow-up — plausible, but both already have richer support packets and lower immediate boundary pressure than `git-workflow`.
4. New Git wrapper skill — weak because the cluster already has a clean canonical owner.

## Key Gaps
- `git-workflow` still keeps too much packet structure and mode detail in the front door instead of using support packets.
- The compact discovery surface still describes the skill like a generic Git helper rather than a routing-first local-collaboration anchor.
- Discovery docs can fall out of sync with a structural rewrite unless updated in the same pass.

## Contradictions
- Marketed reality in the repo: `git-workflow` is already the canonical local Git anchor.
- Structural reality: the main file still behaves more like a compact handbook than the routing-first front doors used by the repo's newer hardening pattern.

## Key Insight
The strongest bounded win is not another Git skill. It is finishing the post-support-coverage ratchet on the existing canonical Git anchor: keep `git-workflow` as the one local-history skill, shrink the top-level instructions into a quicker router, move packet detail outward, and sync every discovery surface in the same branch.
