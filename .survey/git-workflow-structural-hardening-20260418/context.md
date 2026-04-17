# Context: git-workflow structural hardening

## Workflow Context
The repo has already completed the support-coverage phase: every live skill now has `references/`, `evals/`, and a compact discovery variant. That changes the maintenance job. The strongest next wins are no longer missing folders; they are high-degree front-door skills whose top-level SKILLs still carry too much routing, packet, and example detail. The current graph report explicitly calls out that dense anchors should be shrunk into routing-first fronts while leaving detail in support files. In the developer-workflow lane, `git-workflow` is still a highly reused anchor, indexed in README / setup surfaces and adjacent to `git-submodule`, `npm-git-install`, `workflow-automation`, and hosted PR skills. Sources: `graphify-out/GRAPH_REPORT.md`, `.agent-skills-wiki/concepts/developer-workflow-cluster.md`, `.agent-skills-wiki/concepts/skill-support-coverage.md`.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repo maintainer | Keep high-traffic skills truthful, short, and easy to activate | Advanced |
| Agent user doing local Git cleanup | Needs the next safe Git move fast, not a handbook | Mixed |
| Agent user managing PR prep | Needs local history shaping without drifting into hosted PR admin | Intermediate |
| Future maintenance loop | Needs bounded artifacts that can be ratcheted without re-reading a 300-line front door | Advanced |

## Current Workarounds
1. Keep `git-workflow/SKILL.md` large and rely on the reader to find the relevant section.
   - Limitation: activation stays broad, and the front door still mixes mode selection with packet detail.
2. Use the existing references for boundaries and recovery, but keep the main file as the primary handbook.
   - Limitation: the repo has already learned that dense canonical skills age badly when detail is not moved outward.
3. Route Git questions to PR/repo-management skills or ad hoc terminal habits.
   - Limitation: that weakens the clean boundary already established in the developer-workflow cluster.

## Adjacent Problems
- `git-workflow` still uses an older compact discovery summary (`SKILL.toon`) that undersells the newer routing-first intent.
- README / README.ko / setup prompt still surface a broad one-liner, so discovery can lag behind a structural rewrite if not refreshed.
- The same dense-anchor pressure also exists in `survey`, `sprint-retrospective`, `clawteam`, `scrapling`, `vercel-deploy`, and `fabric`, so this run needs to choose one bounded win rather than spray edits.

## User Voices
- "I rebased my feature branch onto main and now I need to push it safely without overwriting teammates." — `.agent-skills/git-workflow/evals/evals.json`
- "Help me clean up my local commits and get this branch ready for review." — `.agent-skills/git-workflow/evals/evals.json`
- "I think I hard-reset the wrong branch. Can Git recover this?" — `.agent-skills/git-workflow/evals/evals.json`
- Git's own docs keep the key safety surfaces explicit: `git push` documents `--force-with-lease`, `git reflog` exists for local recovery, and GitHub's rebase-conflict docs emphasize the inspect → resolve → continue/abort loop rather than magical recovery. Sources: https://git-scm.com/docs/git-push, https://git-scm.com/docs/git-reflog, https://docs.github.com/en/get-started/using-git/resolving-merge-conflicts-after-a-git-rebase
