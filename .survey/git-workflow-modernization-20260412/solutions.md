# Solution Landscape: git-workflow modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Core Git workflow docs (`gitworkflows`) | Upstream/downstream branch discipline and topic branches | Maintainer-grade clarity, strong branch-role guidance | More complex than many app teams need | Good source for boundary discipline |
| Feature branch workflow | Branch-per-change with review before merge | Familiar default, maps well to PR review | Long-lived branches drift and conflict | Common SaaS/app team baseline |
| GitHub flow | Small branches off `main` with PR review and frequent integration | Simple mental model, good for continuous delivery | Weak fit for complex release-branch setups | Strong for fast-moving web teams |
| Trunk-based development | Very short-lived branches or direct-to-trunk integration | Minimizes merge pain, encourages fast CI loops | Requires strong tests, CI, and discipline | Useful contrast when advising branch length |
| Gitflow | `develop`, release, and hotfix branches | Explicit release structure | Often too branch-heavy for modern product teams | Declining default recommendation |
| Merge / rebase / squash policies | History-shaping habits | Lets teams optimize for auditability vs cleanliness | Easy to misuse without clear rules | Must be explained as tradeoffs, not dogma |
| Conflict/recovery helpers (`rerere`, `range-diff`, `worktree`, `reflog`) | Advanced Git safety/recovery tools | High leverage for repeated rebases and recovery | Underused and poorly understood | Good material for references/support docs |

## Categories
- **Workflow models**: feature branches, GitHub flow, trunk-based development, Gitflow, maintainer-style `gitworkflows`
- **History-shaping habits**: merge commits, rebase-before-merge, squash merge, cherry-pick/backport patterns
- **Conflict and recovery helpers**: `rerere`, `range-diff`, `worktree`, `mergetool`, `reflog`

## What People Actually Use
Most teams still use feature branches plus hosted PR review, then fall back to raw Git commands for rebasing, conflict resolution, safe force-pushes, and recovery. That means a modern `git-workflow` skill should optimize for the moment where local repository state is changing, not pretend the hosted PR layer and the local Git layer are the same job.

## Frequency Ranking
1. Feature branches + PR review
2. GitHub flow
3. Merge vs rebase guidance
4. Squash-merge policy choices
5. Trunk-based development
6. `gitworkflows` / maintainer-style branch discipline
7. Gitflow
8. Advanced conflict helpers like `rerere`, `range-diff`, and `worktree`

## Key Gaps
- Legacy Git guidance often lists commands without clearly saying **when not to use them**.
- Hosted PR workflows and local Git mechanics are frequently mixed together even though they fail differently and should often route to different skills.
- Recovery guidance (`reflog`, `revert`, `restore`, `force-with-lease`) is still treated as “advanced” despite being one of the highest-safety parts of practical Git use.
- Many skill catalogs describe Git help too broadly, which makes trigger boundaries weak and overlaps with review, planning, and repo-admin skills.

## Contradictions
- Marketed claim: PR tooling makes collaboration intuitive.  
  User reality: conflict handling, history repair, and safe push behavior still depend on local Git fluency.
- Marketed claim: linear history is always cleaner.  
  User reality: rebasing improves cleanliness but increases rewrite risk on shared branches.
- Repo-local claim: `git-workflow` covers commit, branch, merge, and PR workflows.  
  Repo-local reality: the current skill is strong on local Git commands and weak on actual PR lifecycle behavior.

## Key Insight
The best bounded upgrade is not “teach more Git commands.” It is to recast `git-workflow` as the repository’s **local Git collaboration and recovery anchor**: branch hygiene, commit shaping, rebase/merge decision-making, conflict handling, lease-safe pushes, and recovery patterns. That keeps the skill broadly useful while delegating review quality, repo administration, and sprint planning to adjacent specialists.
