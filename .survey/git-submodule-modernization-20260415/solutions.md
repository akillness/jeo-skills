# Solution Landscape: git-submodule modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Git submodule (`git submodule`) | Keep external repo as separate history pinned by superproject commit | Exact commit pinning, explicit upstream boundary, good for shared external repos | Detached-HEAD surprises, clone/bootstrap friction, awkward updates, CI auth/setup overhead | Canonical tool when separate history matters most |
| Git subtree | Copy another repo into the tree while preserving mergeable history | Easier clone/bootstrap, no separate checkout step for consumers | Heavier history integration, less explicit external boundary, update flow differs from submodule | Main structural alternative called out in Atlassian docs |
| Vendoring / checked-in copy | Copy files directly into repo | Simplest consumer clone, no Git cross-repo plumbing | Manual update drift, unclear upstream sync story | Best for tiny or rare-update dependencies |
| Package manager / registry dependency | Consume published artifact instead of Git repo | Better onboarding/CI ergonomics, versioned artifact flow | Not appropriate when the need is editing or pinning another repo's raw history | Route these cases to `npm-git-install` or ecosystem-specific package workflows |
| Multi-repo checkout in CI only | Fetch separate repos in automation without committing submodule metadata | Good for build-only orchestration | Not the same as a repo-embedded dependency boundary | Adjacent but not a submodule replacement |

## Categories
- **Canonical mechanism:** Git submodule
- **Git-native alternative:** Git subtree
- **Artifact/package alternatives:** package manager, registry, tarball, vendoring
- **Automation-only workaround:** multi-checkout CI fetch without changing repo structure

## What People Actually Use
In practice, teams mix four behaviors:
1. `git clone --recurse-submodules` or `git submodule update --init --recursive` for bootstrap
2. normal `git submodule update` to sync to the recorded commit
3. `git submodule update --remote` only when they intentionally want to advance the tracked branch pointer
4. ad hoc CI configuration (`actions/checkout` with `submodules: true` or `recursive`) to keep builds from silently missing submodule content

The durable manual workflow persists even when people know the commands: initialize recursively, beware detached `HEAD`, commit the superproject pointer after updating, and decide early whether submodule is still the right dependency boundary.

## Frequency Ranking
1. Git submodule clone/init/update mechanics
2. Detached-HEAD / branch-tracking confusion
3. CI checkout/auth handling
4. Submodule-vs-subtree / vendoring decision
5. Removal / cleanup workflow

## Key Gaps
- Existing long command lists rarely start with **“should this be a submodule at all?”**
- Many guides explain add/update commands but underweight the detached-HEAD and branch-tracking model.
- CI/bootstrap behavior is often treated as an afterthought instead of part of the main workflow.
- Skills often overlap with generic Git workflows instead of cleanly separating submodule-boundary logic from branch-history mechanics.

## Contradictions
- Marketed simplicity: “just add a submodule.”
  - Reality: the hard part is ongoing operator behavior — recursive clone, branch tracking, pointer commits, CI auth, and escape hatches.
- Marketed update flow: `update --remote` feels like a normal upgrade.
  - Reality: it is only safe when `.gitmodules` branch intent is explicit and the superproject pointer update is reviewed/committed.

## Key Insight
The right modernization is not another wall of `git submodule` commands. It is a boundary-setting operator skill that first decides whether submodule is the right dependency mechanism, then chooses one mode (add, bootstrap, update, develop, remove, or CI automation), and makes detached-HEAD, branch-tracking, and superproject-pointer consequences explicit before emitting commands.
