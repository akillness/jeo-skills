# Git Submodule Mode Packets and Hosted Constraints

Use this reference after `SKILL.md` chooses the primary mode.

## Mode packets

### 1. boundary decision
Use when the real question is submodule vs subtree vs vendoring vs package/artifact delivery.

Operator rule:
- Prefer **submodule** when separate repo history and exact commit pinning are non-negotiable.
- Prefer **subtree** when consumers should clone one repo with no recursive bootstrap.
- Prefer **vendoring** when the dependency is tiny or rarely updated.
- Prefer **package-manager / artifact delivery** when the real need is consuming a library, not embedding another repo boundary.

### 2. add-and-pin
```bash
git submodule add <repo-url> <path>
git add .gitmodules <path>
git commit -m "feat: add <name> as submodule"
```
Optional explicit branch intent:
```bash
git submodule set-branch --branch main <path>
git add .gitmodules
git commit -m "chore: set submodule branch intent"
```
Watch-out: the superproject still pins a commit, not "latest".

### 3. bootstrap-and-clone
```bash
git clone --recurse-submodules <repo-url>
# or inside an existing clone
git submodule update --init --recursive
```
Use for onboarding, fresh machines, and CI/bootstrap repair.

### 4. sync-to-pinned-commit
```bash
git submodule update --init --recursive
git submodule status --recursive
git diff --submodule
```
Watch-out: detached `HEAD` is normal here because Git is restoring the recorded commit.

### 5. advance-tracked-branch
```bash
git submodule set-branch --branch main path/to/submodule
git submodule update --remote path/to/submodule
git add .gitmodules path/to/submodule
git commit -m "chore: update submodule pointer"
```
Watch-outs:
- `update --remote` intentionally changes the pinned pointer.
- Review the resulting gitlink diff before committing.

### 6. edit-inside-submodule
```bash
cd path/to/submodule
git switch main   # or another real branch
# make / commit / push submodule changes here
cd -
git add path/to/submodule
git commit -m "chore: update submodule pointer"
```
Watch-out: do not leave contributors in detached `HEAD` if they intend to commit inside the submodule.

### 7. remove-and-cleanup
```bash
git submodule deinit -f path/to/submodule
git rm -f path/to/submodule
rm -rf .git/modules/path/to/submodule
git commit -m "chore: remove submodule"
```
Watch-out: `.gitmodules` state and `.git/modules/...` cleanup are both part of a real removal.

### 8. ci-checkout
For GitHub Actions:
```yaml
- uses: actions/checkout@v5
  with:
    submodules: recursive
```
For private submodules, add the chosen auth story explicitly:
```yaml
- uses: actions/checkout@v5
  with:
    submodules: recursive
    ssh-key: ${{ secrets.DEPLOY_KEY }}
```
Alternative: use a token with access to every referenced repo when SSH is not the right fit.

## Hosted-platform constraints

### GitHub Pages
GitHub Pages only supports submodules when they point to **public repositories** over read-only `https://` URLs.

Checklist:
- keep `.gitmodules` URLs on `https://`
- ensure nested submodules are also public and `https://`
- if the dependency must stay private, route away from a GitHub Pages submodule design instead of pretending auth will work

### URL drift / nested drift
Use this when upstream URLs changed or nested submodules still point at stale remotes:
```bash
git submodule sync --recursive
git submodule update --init --recursive
```

## Review commands
```bash
git submodule status --recursive
git diff --submodule
git submodule summary
git config -f .gitmodules --get-regexp '^submodule\..*\.branch$'
```

## Boundary reminders
- Generic branch/history cleanup belongs to `git-workflow`.
- Package delivery belongs to `npm-git-install` or the relevant package-manager skill.
- Wider bootstrap/task-runner automation belongs to `workflow-automation`.
