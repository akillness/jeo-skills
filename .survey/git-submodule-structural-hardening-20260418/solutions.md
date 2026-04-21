# Solution Landscape: git-submodule structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Git submodule | Separate upstream repo boundary with a gitlink pinned by the superproject | Best fit when exact commit pinning and separate history matter | Recursive bootstrap, detached `HEAD`, pointer commits, CI/auth setup | Canonical skill target; keep distinct from generic Git and package delivery |
| Git subtree | Integrate upstream code as a normal subdirectory while preserving a pull/push path | Clone simplicity and no `.gitmodules` / gitlink burden | Weaker external-boundary semantics; split/push flows are specialized | Best Git-native alternative when clone simplicity beats strict boundary isolation |
| Vendoring / checked-in copy | Copy dependency into the repo tree | Simplest clone and strong reproducibility | Manual refresh burden; poor fit for active upstream collaboration | Good escape hatch for small or rarely updated dependencies |
| Package manager / artifact delivery | npm/pnpm/Yarn workspaces or registry artifacts | Best when the dependency is really a library or artifact | Requires package semantics; not a substitute for embedded upstream Git history | Maps to `npm-git-install` / package-manager lanes, not this skill |
| CI checkout patterns | `actions/checkout` recursive fetch, PAT / SSH auth, explicit second checkout | Essential companion when submodules stay | Private-submodule auth remains brittle and noisy | This is a support packet, not a separate neighboring skill |
| Helper tooling (`git-subrepo`, bootstrap scripts) | Replace or soften submodule workflows with extra tooling | Can lower operator burden in specific repos | Lower standardization than built-in Git flows | Worth mentioning as an alternative, not centering in the skill |

## Categories
- **Keep separate repo boundary:** Git submodule
- **Integrate code but preserve upstream sync path:** Git subtree, `git-subrepo`
- **Copy code in-tree:** vendoring / checked-in snapshot
- **Deliver packages/artifacts instead of repos:** npm/pnpm/Yarn workspaces, registry publishing
- **Operational support around submodules:** recursive checkout, SSH/token auth, bootstrap docs/scripts

## What People Actually Use
In practice people still solve submodules manually: recursive clone/update flags, `.gitmodules` branch settings, `git submodule update --remote`, `git submodule foreach ...` loops, and explicit PAT/SSH auth fixes in CI. The strongest recurring operator pain is not "what command exists?" but "which mode am I in, what state am I trying to preserve, and why did this land on detached `HEAD` again?"

## Frequency Ranking
1. **Git submodule** — strongest primary-source footprint and the main built-in Git mechanism for exact commit pinning with separate history.
2. **Package-manager / workspace delivery** — common alternative when the real need is consuming a library or artifact, not embedding another repo boundary.
3. **CI checkout/auth patterns alongside submodules** — recurring operational layer with high issue volume around private submodules.
4. **Git subtree** — mature official alternative when clone simplicity matters more than separate checkout boundaries.
5. **Vendoring** — common simplification path for tiny or slow-moving dependencies.
6. **Helper tooling** — useful in specific repos, but weaker as a generic catalog anchor.

## Key Gaps
- Docs and skills still have to teach the same four operator truths repeatedly: pinned commit vs tracked branch, detached `HEAD`, recursive bootstrap, and private-submodule CI/auth.
- Users want branch-following and hosted checkout to feel more automatic than the underlying Git model allows.
- Dense front doors become hard to scan once they try to teach routing, commands, CI pitfalls, and hosted-platform constraints in one file.

## Contradictions
- Marketed expectation: "track the latest branch". User reality: Git still records a pinned commit in the superproject, so someone must run the update and commit the changed pointer.
- Docs expectation: `actions/checkout` supports submodules. User reality: private-submodule auth and SSH/URL edge cases still generate large workaround threads.
- Intuition: submodules are just another Git folder. Reality: they introduce a separate repo boundary with detached-HEAD and pointer semantics that ordinary Git workflows do not hide.

## Key Insight
The strongest bounded improvement is not adding another Git helper. It is shrinking `git-submodule` into a routing-first front door that teaches mode selection and consequence boundaries quickly, then pushes command-heavy or hosted-platform detail into focused support packets. The skill already owns the right lane; the remaining gap is front-door density and clearer distinction between bootstrap/pinned-state work, intentional pointer advancement, editing-inside-submodule flows, and hosted CI/page constraints.

## Curated Sources
- Repo-native: `.agent-skills/git-submodule/SKILL.md`, `references/decision-matrix.md`, `references/update-and-detached-head.md`, `references/ci-and-automation.md`
- Git docs: `gitsubmodules` and `git-submodule` — https://git-scm.com/docs/gitsubmodules , https://git-scm.com/docs/git-submodule
- Git Book, *Git Tools - Submodules* — https://git-scm.com/book/en/v2/Git-Tools-Submodules
- `git subtree` manpage — https://manpages.debian.org/testing/git-man/git-subtree.1.en.html
- npm workspaces — https://docs.npmjs.com/cli/v10/using-npm/workspaces
- pnpm workspaces — https://pnpm.io/workspaces
- Yarn workspaces — https://yarnpkg.com/features/workspaces
- Go modules vendoring reference — https://golang.org/ref/mod
- `git-subrepo` README — https://github.com/ingydotnet/git-subrepo
- `actions/checkout` README and issues #287, #1750, #2080, #2178, #924 — https://github.com/actions/checkout
