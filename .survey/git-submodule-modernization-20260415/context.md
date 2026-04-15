# Context: git-submodule modernization

## Workflow Context
Git submodules show up when a repository needs to pin another repository at a specific commit while keeping histories separate. The recurring workflow is not just `git submodule add`: teams also need predictable clone/bootstrap commands, a safe daily update loop, CI checkout behavior, and a clear answer for when submodules are the wrong tool.

Primary evidence from this run:
- Git Book explains that adding a submodule creates `.gitmodules`, records the URL/path mapping, and that ordinary `git submodule update` can leave the sub-repository in detached `HEAD` state unless you deliberately work on a branch. Source: https://git-scm.com/book/en/v2/Git-Tools-Submodules
- `git-submodule` docs make the branch-tracking model explicit: `submodule.<name>.branch` in `.gitmodules` controls `update --remote`, and ordinary update checks out the recorded commit on detached `HEAD`. Source: https://git-scm.com/docs/git-submodule
- Atlassian frames submodules as a good fit for slowly changing vendor dependencies or delegated components, and also points users to subtree as the main alternative when the ergonomics trade-off changes. Sources: https://www.atlassian.com/git/tutorials/git-submodule and https://www.atlassian.com/git/tutorials/git-subtree
- GitHub Actions checkout docs show that CI still needs explicit submodule handling (`submodules: true` or `recursive`) and detached-HEAD behavior is common in automation. Source: https://github.com/actions/checkout#checkout-multiple-repos-private

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| App / platform developer | Pull external code into a repo while pinning exact revisions | Intermediate |
| Build / release engineer | Make clone/bootstrap and CI jobs fetch submodules reliably | Intermediate to advanced |
| Agent maintaining a repo | Decide whether submodule is the right dependency boundary and emit the next safe commands | Intermediate |
| Multi-repo maintainer | Update a tracked branch or move a submodule pointer without confusing collaborators | Advanced |

## Current Workarounds
1. Paste long `git submodule` command lists without first deciding whether submodule, subtree, vendoring, or package-manager delivery is the right fit.
2. Tell users to run `git submodule update --init --recursive` but skip the detached-HEAD warning, so later edits inside the submodule are surprising.
3. Treat `update --remote` as a universal upgrade command without explaining `.gitmodules` branch tracking or the need to commit the superproject pointer afterward.
4. Forget CI/bootstrap surfaces, which leaves clones or GitHub Actions jobs missing submodule content or private-auth setup.
5. Leave removal as a memorized multi-step incantation instead of a reusable operator checklist.

## Adjacent Problems
- Teams sometimes really need `git subtree`, vendoring, or package-manager delivery instead of submodules.
- Local Git collaboration inside a submodule overlaps with `git-workflow`, but the superproject pointer update still belongs in `git-submodule`.
- Repo bootstrap questions can drift into `workflow-automation` or `system-environment-setup` when the real issue is broader environment design.
- Private submodules create CI credential and checkout-scope problems that need explicit handling.

## User Voices
- Git Book: ordinary `git submodule update` “will leave the sub-repository in what’s called a detached HEAD state.” Source: https://git-scm.com/book/en/v2/Git-Tools-Submodules
- `git-submodule` docs: the branch used by `update --remote` is recorded as `submodule.<name>.branch` in `.gitmodules`. Source: https://git-scm.com/docs/git-submodule
- Atlassian: submodules fit vendor dependencies or delegated components that are not updated too frequently. Source: https://www.atlassian.com/git/tutorials/git-submodule
- GitHub Actions checkout docs: submodule checkout is opt-in (`submodules: true` / `recursive`) and PR automation commonly starts from detached `HEAD`. Source: https://github.com/actions/checkout#checkout-multiple-repos-private
