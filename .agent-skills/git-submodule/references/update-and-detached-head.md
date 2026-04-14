# Update Flow and Detached-HEAD Notes

## Core truth
A superproject records a submodule by **commit**, not by “latest branch”. That is why normal `git submodule update` checks out the recorded commit and can leave the submodule in **detached `HEAD`** state.

## Bootstrap patterns
```bash
# Fresh clone with all submodules
git clone --recurse-submodules <repo-url>

# Existing clone missing submodules
git submodule update --init --recursive
```

## Daily sync modes
### 1. Match the superproject's recorded commit
Use when the goal is reproducibility, onboarding, or CI parity.
```bash
git submodule update --init --recursive
```

### 2. Advance to the tracked remote branch
Use only when you intentionally want to move the pointer.
```bash
git submodule set-branch --branch main path/to/submodule
git submodule update --remote path/to/submodule
```
Then review and commit the new pointer from the superproject:
```bash
git add .gitmodules path/to/submodule
git commit -m "chore: update submodule pointer"
```

## Detached-HEAD operator rule
If you need to make or keep commits **inside** the submodule, do not stay detached.
```bash
cd path/to/submodule
git switch main   # or another real branch
# make/commit/push submodule changes
cd -
git add path/to/submodule
git commit -m "chore: update submodule pointer"
```

## Review commands
```bash
git submodule status --recursive
git diff --submodule
git submodule summary
```

## Watch-outs
- `git submodule update --remote` is not a harmless refresh; it changes the pointer you are pinning.
- If `.gitmodules` does not set the branch explicitly, collaborators may assume the wrong upgrade target.
- A submodule commit is not part of the superproject until you stage and commit the submodule path there.
