---
name: git-submodule
description: >
  Decide when Git submodules are the right dependency boundary, then operate them
  safely: add a submodule, clone/init recursively, update a tracked branch,
  develop inside the submodule without getting lost in detached HEAD, remove a
  submodule cleanly, or configure CI checkout. Use when the user asks about
  `.gitmodules`, `git submodule`, recursive clone/setup, updating submodule
  pointers, private submodules in CI, or whether submodule vs subtree/vendoring
  is the better fit. Not for generic Git history cleanup or package-manager
  dependency delivery.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best for repositories where Git CLI is available and the main problem is the
  repo boundary around external code: submodule choice, bootstrap, pointer
  updates, detached-HEAD handling, or CI checkout behavior.
metadata:
  tags: git, submodule, subtree, dependencies, version-control, ci, repo-structure
  platforms: Claude, ChatGPT, Gemini, Codex, OpenCode
  version: "2.0.0"
  source: akillness/oh-my-skills
---

# Git Submodule

Use this skill as the repository's **Git submodule choice and operator-workflow anchor**.

The job is not to dump every `git submodule` command in one blob. The job is to:
1. decide whether submodule is the right boundary at all,
2. choose one operating mode,
3. make detached-HEAD, pointer, and CI consequences explicit,
4. emit the next safe commands only for that mode.

Read [references/decision-matrix.md](references/decision-matrix.md) first. Use [references/update-and-detached-head.md](references/update-and-detached-head.md) and [references/ci-and-automation.md](references/ci-and-automation.md) when the task involves branch tracking, automation, or editing inside the submodule.

If the user mainly needs:
- **local branch/history cleanup, rebase, conflict recovery, or push safety** → use `git-workflow`
- **Node package delivery from Git refs, tarballs, or workspaces** → use `npm-git-install`
- **repo bootstrap/task-runner automation beyond submodule mechanics** → use `workflow-automation`
- **broader environment or container setup** → use `system-environment-setup`

## When to use this skill
- Add an external repository to a project via `git submodule add`
- Clone or initialize a repository that already contains submodules
- Update a submodule to the commit recorded by the superproject
- Advance a submodule to a tracked remote branch and commit the new pointer
- Work inside a submodule without getting surprised by detached `HEAD`
- Remove a submodule cleanly
- Configure GitHub Actions or other CI to fetch submodules, including private ones
- Decide whether submodule vs subtree vs vendoring is the better fit

## When not to use this skill
- The main problem is ordinary Git collaboration, rebasing, or history repair
- The dependency should really be a package-manager / registry artifact
- The user wants a giant Git tutorial instead of the next safe move for one submodule situation
- The task is hosted repo administration rather than repo-internal dependency structure

## Instructions

### Step 1: Normalize the submodule request
Capture the request in this form first:

```yaml
submodule_intake:
  current_goal: decide-boundary | add | bootstrap | sync-to-pinned-commit | advance-tracked-branch | edit-inside-submodule | remove | ci-checkout | unknown
  repo_role: superproject-consumer | submodule-maintainer | both | unknown
  dependency_shape: external-repo | vendor-copy | subtree-candidate | package-candidate | unknown
  submodule_state: absent | present-uninitialized | present-detached-head | present-on-branch | pointer-needs-update | unknown
  update_intent: none | match-recorded-commit | move-to-new-upstream-commit | develop-and-push-submodule | unknown
  ci_context: none | github-actions | other-ci | unknown
  auth_context: public | private-ssh | private-token | unknown
  collaboration_risk: solo | shared | unknown
  confidence: high | medium | low
```

If the context is incomplete, pick the safest default and say what you assumed.

### Step 2: Decide whether submodule is the right tool
Ask this before giving commands:

- Do we need a **separate upstream Git history** inside this repo?
- Is **pinning an exact commit** the real requirement?
- Can the team tolerate recursive clone/bootstrap and CI checkout setup?
- Is the dependency more like a long-lived integrated component (`git subtree`) or a published artifact (`npm-git-install`) instead?

If the answer is "not really", route away instead of forcing submodules.

### Step 3: Choose exactly one workflow mode
Pick one primary mode for the current run.

1. **boundary decision**
   - Use when the real question is submodule vs subtree vs vendoring vs package delivery.

2. **add-and-pin**
   - Use when the repo needs a new submodule added and committed.

3. **bootstrap-and-clone**
   - Use when the repo already has submodules and the goal is getting a clone or CI worktree into a usable state.

4. **sync-to-pinned-commit**
   - Use when the goal is reproducibility: match the commit already recorded by the superproject.

5. **advance-tracked-branch**
   - Use when you intentionally want to move the submodule pointer to a newer upstream commit.

6. **edit-inside-submodule**
   - Use when work must happen inside the submodule repo and detached `HEAD` would be dangerous.

7. **remove-and-cleanup**
   - Use when a submodule should be deinitialized and removed cleanly.

8. **ci-checkout**
   - Use when the main issue is automation checkout, recursive fetch, or private-submodule auth.

### Step 4: Apply the decision ladder
Use these rules:

- Prefer **submodule** when separate repo history + exact commit pinning matter most.
- Prefer **subtree** when consumers should clone one repo without submodule bootstrap and the integrated-history trade-off is acceptable.
- Prefer **vendoring** when the dependency is tiny or changes rarely.
- Prefer **package-manager / artifact delivery** when the need is distributing a library, not embedding another repo boundary.
- Prefer **`git clone --recurse-submodules`** or **`git submodule update --init --recursive`** for bootstrap.
- Prefer **plain `git submodule update`** when the goal is to match the pinned commit.
- Prefer **explicit branch tracking + `git submodule update --remote`** only when intentionally advancing the pointer.
- Prefer **switching to a real branch inside the submodule** before making commits there.
- Prefer **documented CI checkout config** over assuming submodules appear automatically.

### Step 5: Build the submodule brief
Return this exact structure:

```markdown
# Git Submodule Brief

## Recommended mode
- Mode: boundary decision | add-and-pin | bootstrap-and-clone | sync-to-pinned-commit | advance-tracked-branch | edit-inside-submodule | remove-and-cleanup | ci-checkout
- Why this mode fits: ...

## Current state
- Superproject goal: ...
- Submodule state: ...
- Auth / CI context: ...
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

### Step 6: Use these mode-specific patterns

#### boundary decision
- say clearly whether submodule is justified
- if not, name the preferred alternative and why
- do not emit submodule commands for a case that is really subtree, vendoring, or package delivery

#### add-and-pin
```bash
git submodule add <repo-url> <path>
git add .gitmodules <path>
git commit -m "feat: add <name> as submodule"
```
- If a tracked branch matters, set it explicitly rather than assuming collaborators know the intent:
```bash
git submodule set-branch --branch main <path>
git add .gitmodules
```
- Call out that the superproject pins a commit, not “latest”.

#### bootstrap-and-clone
```bash
git clone --recurse-submodules <repo-url>
# or inside an existing clone
git submodule update --init --recursive
```
- Use this for onboarding, fresh machines, and repo bootstrap.
- Mention private-auth requirements if any submodule is private.

#### sync-to-pinned-commit
```bash
git submodule update --init --recursive
git submodule status --recursive
git diff --submodule
```
- This mode is about reproducing the committed state, not upgrading anything.
- Detached `HEAD` after update is normal here.

#### advance-tracked-branch
```bash
git submodule set-branch --branch main path/to/submodule
git submodule update --remote path/to/submodule
git add .gitmodules path/to/submodule
git commit -m "chore: update submodule pointer"
```
- Explain that `update --remote` changes what commit the superproject pins.
- Review the resulting pointer diff before committing.
- If the branch is shared, call out review risk explicitly.

#### edit-inside-submodule
```bash
cd path/to/submodule
git switch main   # or another real branch
# make and commit changes here
git push origin main
cd -
git add path/to/submodule
git commit -m "chore: update submodule pointer"
```
- Do not leave a contributor in detached `HEAD` if they plan to commit inside the submodule.
- Keep submodule commits and superproject pointer commits conceptually separate.

#### remove-and-cleanup
```bash
git submodule deinit -f path/to/submodule
git rm -f path/to/submodule
rm -rf .git/modules/path/to/submodule
git commit -m "chore: remove submodule"
```
- Verify the path is really no longer needed before cleanup.
- Explain that both `.gitmodules` and `.git/modules/...` state are part of the removal.

#### ci-checkout
For GitHub Actions:
```yaml
- uses: actions/checkout@v5
  with:
    submodules: recursive
```
For private submodules, add the chosen auth story (SSH key or token with access to every repo).
- Make CI auth an explicit part of the answer.
- If the workflow only needs pinned contents, avoid mixing checkout guidance with pointer-upgrade logic.

### Step 7: Keep these operator rules visible
- `git submodule update` usually checks out the recorded commit and may leave the submodule in detached `HEAD`.
- `.gitmodules` is part of the contract; branch-tracking intent belongs there when `update --remote` is expected.
- A submodule commit is not reflected in the superproject until the submodule path is staged and committed there.
- Recursive bootstrap belongs in onboarding and automation docs if the repo depends on submodules.

## Output format
Return a **short operator-style Git submodule brief**.

Required qualities:
- pick one workflow mode
- say whether submodule is actually the right tool
- make detached-HEAD / pointer consequences explicit
- include CI/auth notes when relevant
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

## Best practices
1. Start with the boundary decision, not the command list.
2. Distinguish **match pinned commit** from **advance upstream pointer**.
3. Treat detached `HEAD` as normal-but-important operator state, not as a mysterious Git bug.
4. Keep submodule mechanics separate from generic Git history repair.
5. Make CI checkout and auth part of the main workflow whenever submodules are involved.

## References
- [Git Book: Submodules](https://git-scm.com/book/en/v2/Git-Tools-Submodules)
- [git-submodule documentation](https://git-scm.com/docs/git-submodule)
- [Atlassian: Git submodule](https://www.atlassian.com/git/tutorials/git-submodule)
- [Atlassian: Git subtree](https://www.atlassian.com/git/tutorials/git-subtree)
- [GitHub Actions checkout](https://github.com/actions/checkout#checkout-multiple-repos-private)
