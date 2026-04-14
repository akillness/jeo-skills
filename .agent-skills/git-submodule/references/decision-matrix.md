# Git Submodule Decision Matrix

Use this note before emitting any `git submodule` commands.

## Choose Git submodule when
- The external code must remain a **separate Git repository with its own history**.
- The superproject should pin an **exact commit** of that external repo.
- Consumers need a clear upstream boundary instead of a copied-in directory.
- The team accepts recursive clone/bootstrap and CI checkout setup as part of the workflow.

## Prefer `git subtree` when
- Consumers should clone one repo and immediately have all code without submodule bootstrap.
- You still want to pull/merge upstream history, but the separate checkout boundary is more pain than value.
- The dependency behaves more like a long-lived integrated component than a separately operated repo.

## Prefer vendoring / checked-in copy when
- The dependency is tiny, changes rarely, or only needs occasional manual refresh.
- The team values clone simplicity over preserved upstream Git history.
- Upstream sync does not justify extra Git plumbing.

## Prefer package-manager / artifact delivery when
- The real goal is consuming a **build artifact or published library**, not another repo's raw history.
- Onboarding, CI reproducibility, or cross-team consumption matters more than direct repo-level editing.
- The dependency is already in the Node / Python / package-manager lane.

## Fast decision checklist
| Question | If yes | If no |
|---|---|---|
| Do we need a separate upstream Git history inside this repo? | keep evaluating submodule | use subtree / vendoring / package delivery |
| Is exact commit pinning the primary requirement? | submodule is plausible | other mechanisms may be simpler |
| Can the team support recursive clone/bootstrap + CI checkout? | submodule still viable | prefer subtree or artifact flow |
| Will contributors actively edit code inside the external repo? | plan for branch checkout + pointer commits | ordinary pinned-consumer flow may be enough |

## Boundary reminders
- Generic branch/history cleanup belongs to `git-workflow`.
- Node package delivery choices belong to `npm-git-install`.
- Repo bootstrap automation belongs to `workflow-automation` when the problem expands beyond submodule mechanics.
