# Context: git-submodule structural hardening

## Workflow Context
Git submodule pain still clusters around four operator moments: recursive bootstrap after clone, syncing to the superproject's pinned commit, intentionally advancing a tracked branch, and keeping CI/auth setup honest for private or nested submodules. The Git book and `git-submodule` manual both emphasize that the superproject records a commit, not "latest", which is why `git submodule update` restores recorded state and often lands contributors on detached `HEAD` unless they explicitly switch to a real branch before editing. GitHub's hosted workflows add more friction: `actions/checkout` requires explicit `submodules: true|recursive`, and GitHub Pages only supports public submodules over read-only `https://` URLs.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| New contributors / repo consumers | Clone a repo and get submodule-backed directories into a usable state | beginner to intermediate |
| Superproject maintainers | Add/remove submodules, decide submodule vs subtree/vendoring/package delivery, and commit pointer updates safely | intermediate |
| Contributors editing inside submodules | Avoid detached-HEAD loss and keep submodule commits separate from superproject pointer commits | intermediate to advanced |
| CI / release maintainers | Configure recursive checkout and auth for private submodules in Actions or similar hosted runners | intermediate |
| Docs/site maintainers on hosted platforms | Keep submodule URLs and visibility compatible with GitHub Pages / hosted build constraints | intermediate |

## Current Workarounds
1. Use `git clone --recurse-submodules` or `git submodule update --init --recursive` whenever a clone lands with empty directories. Limitation: onboarding still depends on humans remembering recursive flags.
2. Switch to a real branch inside the submodule before editing, then return to the superproject and commit the updated gitlink. Limitation: the extra branch/pointer choreography is easy to forget.
3. Use `.gitmodules` branch settings plus `git submodule update --remote` when intentionally advancing a pointer. Limitation: users still expect branch tracking to mean "auto-follow latest" instead of "fetch, update, then commit the new pointer."
4. Patch CI with `actions/checkout` `submodules: recursive`, PATs, or SSH deploy keys for private submodules. Limitation: auth remains brittle and hosted build defaults do not "just work."
5. Rewrite `.gitmodules` URLs or run `git submodule sync --recursive` when upstream URLs drift. Limitation: URL and nested-submodule drift are still operator chores, not self-healing behavior.

## Adjacent Problems
- Submodule vs subtree choice when clone simplicity matters more than a strict external-repo boundary.
- Submodule vs vendoring when the dependency is tiny or changes rarely.
- Submodule vs package/artifact delivery when the real need is library consumption rather than embedding another repo's Git history.
- Generic Git collaboration and history repair, which belong in `git-workflow` rather than inside the submodule skill.
- Repo bootstrap automation, where submodules are only one part of a bigger setup flow.

## User Voices
- “Currently the checkout action doesn't work with private repositories using a private submodule. As a work-around we use the following in our workflow.” — [`actions/checkout` issue #287](https://github.com/actions/checkout/issues/287)
- “My goal is to initialize submodules behind a private repo with the whole history. I am not sure if I am doing this right...” — [`actions/checkout` issue #268](https://github.com/actions/checkout/issues/268)
- “Working with submodules can be tedious... we have up to 45 submodules in some projects.” — [GitExtensions issue #12316](https://github.com/gitextensions/gitextensions/issues/12316)
- “if you have gone into the submodule and checked out a specific branch, this branch is blown away, as all new checkouts are done as detached HEADs... it's inconvenient” — [GitExtensions issue #10801](https://github.com/gitextensions/gitextensions/issues/10801)

## Sources
- Git Book, *Git Tools - Submodules* — https://git-scm.com/book/en/v2/Git-Tools-Submodules
- `git-submodule` manual — https://git-scm.com/docs/git-submodule
- GitHub Docs, *Using submodules with GitHub Pages* — https://docs.github.com/en/pages/getting-started-with-github-pages/using-submodules-with-github-pages
- GitHub Docs, *Migrate from Travis CI to GitHub Actions* — https://docs.github.com/en/actions/tutorials/migrate-to-github-actions/manual-migrations/migrate-from-travis-ci
- `actions/checkout` README — https://github.com/actions/checkout
- `actions/checkout` issues #287, #268, #589 — https://github.com/actions/checkout/issues/287 , https://github.com/actions/checkout/issues/268 , https://github.com/actions/checkout/issues/589
- GitExtensions issues #12316, #10801 — https://github.com/gitextensions/gitextensions/issues/12316 , https://github.com/gitextensions/gitextensions/issues/10801
