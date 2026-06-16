---
name: git-submodule
description: >
  Decide when Git submodules are the right external-repo boundary, then choose one
  safe operator flow: add and pin, bootstrap recursively, sync to the recorded
  commit, advance a tracked branch, edit inside the submodule without detached-HEAD
  surprises, remove cleanly, or configure CI/hosted-platform checkout constraints.
  Use when the user asks about `.gitmodules`, `git submodule`, recursive clone/setup,
  pointer updates, detached HEAD, private submodules in CI, GitHub Pages submodule
  limits, or submodule vs subtree/vendoring/package delivery. Not for generic Git
  history cleanup or package-manager dependency delivery.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best for repositories where Git CLI is available and the main problem is the
  repo boundary around external code: submodule choice, bootstrap, pointer
  updates, detached-HEAD handling, or CI / hosted-platform behavior.
metadata:
  tags: git, submodule, subtree, dependencies, version-control, ci, repo-structure
  platforms: Claude, ChatGPT, Gemini, Codex, OpenCode
  version: "2.1.0"
  source: akillness/jeo-skills
---

# Git Submodule

Use this skill as the repository's **Git submodule choice and operator-workflow anchor**.

The job is not to dump every `git submodule` command in one blob. The job is to:
1. decide whether submodule is the right boundary at all,
2. choose one operating mode,
3. keep pinned-commit, detached-`HEAD`, and hosted-platform consequences explicit,
4. emit the next safe commands only for that mode.

Read [references/decision-matrix.md](references/decision-matrix.md) first.
Read [references/update-and-detached-head.md](references/update-and-detached-head.md) when the request involves pointer updates, detached `HEAD`, or editing inside the submodule.
Read [references/ci-and-automation.md](references/ci-and-automation.md) for CI/bootstrap expectations.
Read [references/mode-packets-and-hosted-constraints.md](references/mode-packets-and-hosted-constraints.md) for mode-specific command packets and GitHub Pages / URL-drift constraints.

If the user mainly needs:
- **local branch/history cleanup, rebase, conflict recovery, or push safety** → use `git-workflow`
- **Node package delivery from Git refs, tarballs, workspaces, or publish-first flows** → use `npm-git-install`
- **repo bootstrap/task-runner automation beyond submodule mechanics** → use `workflow-automation`
- **broader environment or container setup** → use `system-environment-setup`

## When to use this skill
- Add an external repository to a project via `git submodule add`
- Clone or initialize a repository that already contains submodules
- Sync a submodule back to the commit recorded by the superproject
- Advance a submodule to a tracked remote branch and commit the new pointer
- Work inside a submodule without getting surprised by detached `HEAD`
- Remove a submodule cleanly
- Configure GitHub Actions or other CI to fetch submodules, including private ones
- Check hosted-platform constraints such as GitHub Pages public-submodule limits
- Decide whether submodule vs subtree vs vendoring vs package delivery is the better fit

## When not to use this skill
- The main problem is ordinary Git collaboration, rebasing, or history repair
- The dependency should really be a package-manager / registry artifact
- The task is broader repo bootstrap automation rather than submodule mechanics
- The request is hosted repo administration outside submodule checkout / visibility constraints
- The user wants a giant Git tutorial instead of the next safe move for one submodule situation

## Instructions

### Step 1: Normalize the request
Capture the request in this form first:

```yaml
submodule_intake:
  current_goal: decide-boundary | add | bootstrap | sync-to-pinned-commit | advance-tracked-branch | edit-inside-submodule | remove | ci-checkout | hosted-constraint | unknown
  repo_role: superproject-consumer | submodule-maintainer | both | unknown
  dependency_shape: external-repo | vendor-copy | subtree-candidate | package-candidate | unknown
  submodule_state: absent | present-uninitialized | present-detached-head | present-on-branch | pointer-needs-update | unknown
  update_intent: none | match-recorded-commit | move-to-new-upstream-commit | develop-and-push-submodule | unknown
  ci_context: none | github-actions | other-ci | github-pages | unknown
  auth_context: public | private-ssh | private-token | unknown
  collaboration_risk: solo | shared | unknown
  confidence: high | medium | low
```

If context is incomplete, make the safest default explicit.

### Step 2: Decide whether submodule is the right tool
Answer these before giving commands:
- Do we need a **separate upstream Git history** inside this repo?
- Is **exact commit pinning** the real requirement?
- Can the team tolerate recursive clone/bootstrap and CI checkout setup?
- Is the dependency more like a subtree, a vendored snapshot, or a published package instead?

If the answer is "not really", route away instead of forcing submodules.

### Step 3: Choose exactly one primary mode
Pick one primary mode for the current run:
1. **boundary decision**
2. **add-and-pin**
3. **bootstrap-and-clone**
4. **sync-to-pinned-commit**
5. **advance-tracked-branch**
6. **edit-inside-submodule**
7. **remove-and-cleanup**
8. **ci-checkout**
9. **hosted-constraint**

Use `hosted-constraint` when the user is blocked by platform rules such as GitHub Pages public-only submodules or stale submodule URL forms, rather than by ordinary local Git usage.

### Step 4: Keep the operator invariants visible
These truths should survive every answer:
- A superproject records a submodule by **commit**, not by "latest branch".
- `git submodule update` usually restores the recorded commit and may leave the submodule in detached `HEAD`.
- `.gitmodules` is part of the contract; branch-tracking intent belongs there when `update --remote` is expected.
- A submodule commit is not reflected in the superproject until the submodule path is staged and committed there.
- Recursive bootstrap belongs in onboarding and automation docs if the repo depends on submodules.
- Hosted platforms may add visibility, URL, or auth constraints that normal local Git use does not reveal.

### Step 5: Build the submodule brief
Return this exact structure:

```markdown
# Git Submodule Brief

## Recommended mode
- Mode: boundary decision | add-and-pin | bootstrap-and-clone | sync-to-pinned-commit | advance-tracked-branch | edit-inside-submodule | remove-and-cleanup | ci-checkout | hosted-constraint
- Why this mode fits: ...

## Current state
- Superproject goal: ...
- Submodule state: ...
- Auth / CI / hosted context: ...
- Collaboration risk: solo | shared | unknown
- Confidence: high | medium | low

## Safest next move
1. ...
2. ...
3. ...

## Commands
```bash
...
```

## Watch-outs
- ...
- ...

## Pointer / branch consequences
- ...

## Adjacent handoff
- `git-workflow` when ...
- `npm-git-install` when ...
- `workflow-automation` when ...
```

### Step 6: Use the mode packets, not a giant improvised command dump
Pull the exact packet from [references/mode-packets-and-hosted-constraints.md](references/mode-packets-and-hosted-constraints.md).

Rules:
- `boundary decision` should compare submodule with subtree / vendoring / package delivery directly.
- `bootstrap-and-clone` and `sync-to-pinned-commit` must preserve the difference between **restore recorded state** and **upgrade pointer**.
- `advance-tracked-branch` must make branch intent explicit and commit the resulting pointer update in the superproject.
- `edit-inside-submodule` must avoid detached-`HEAD` commit loss.
- `ci-checkout` must make private-submodule auth explicit.
- `hosted-constraint` must call out public-only or URL-form restrictions instead of pretending hosted builds will authenticate like a local clone.

## Output format
Return a short operator-style **Git Submodule Brief**.

Required qualities:
- pick one workflow mode
- say whether submodule is actually the right tool
- make detached-`HEAD` / pointer consequences explicit
- include CI/auth or hosted-platform notes when relevant
- route away cleanly when the problem belongs to another skill

## Examples

### Example 1: bootstrap after clone
Input: "I cloned the repo and the vendor directory is empty. There's a `.gitmodules` file."
Output: choose `bootstrap-and-clone`, recommend `git submodule update --init --recursive`, explain that this restores the pinned contents rather than upgrading anything, and mention private-auth caveats if applicable.

### Example 2: update a tracked dependency
Input: "We track the main branch of a docs repo as a submodule and want the latest commit."
Output: choose `advance-tracked-branch`, set or confirm `submodule.<name>.branch`, run `git submodule update --remote <path>`, then commit the pointer update in the superproject.

### Example 3: choose boundary
Input: "Should this shared component repo be a submodule or subtree?"
Output: choose `boundary decision`, compare separate-history/pinning needs against clone simplicity, and route to subtree if consumers should not deal with recursive bootstrap.

### Example 4: hosted-platform constraint
Input: "Our GitHub Pages build uses a private docs-theme submodule and keeps failing."
Output: choose `hosted-constraint`, explain the public-`https://` GitHub Pages limitation, and route away from a private-submodule Pages design instead of pretending auth fixes it.

## Best practices
1. Start with the boundary decision, not the command list.
2. Distinguish **match pinned commit** from **advance upstream pointer**.
3. Treat detached `HEAD` as normal-but-important operator state, not as a mysterious Git bug.
4. Keep submodule mechanics separate from generic Git history repair.
5. Make CI checkout, hosted-platform limits, and auth part of the main workflow whenever submodules are involved.

## References
- [Git Book: Submodules](https://git-scm.com/book/en/v2/Git-Tools-Submodules)
- [git-submodule documentation](https://git-scm.com/docs/git-submodule)
- [Atlassian: Git submodule](https://www.atlassian.com/git/tutorials/git-submodule)
- [Atlassian: Git subtree](https://www.atlassian.com/git/tutorials/git-subtree)
- [GitHub Actions checkout](https://github.com/actions/checkout#checkout-multiple-repos-private)
- [GitHub Pages submodule limitations](https://docs.github.com/en/pages/getting-started-with-github-pages/using-submodules-with-github-pages)
