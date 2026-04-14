# Context: npm-git-install modernization

## Workflow Context
Direct Git-based package installs show up when teams need an unpublished fix, a fork, a branch/tag/commit pin, a private internal package, or a monorepo package that is not yet flowing cleanly through a registry. npm, pnpm, Yarn, and Bun all support Git-based dependencies, but they do not behave like a normal registry download: install-time packing, lifecycle scripts, and auth can suddenly become part of the consumer workflow rather than just the package author's workflow. In practice this is a bridge tactic for developer workflow and CI unblocking, not the default steady-state distribution path.

Primary sources:
- npm `package.json` / Git URL docs: https://docs.npmjs.com/cli/v11/configuring-npm/package-json
- npm package spec: https://docs.npmjs.com/cli/v11/using-npm/package-spec
- pnpm add: https://pnpm.io/cli/add
- Yarn Git protocol: https://yarnpkg.com/protocol/git
- Bun add: https://bun.sh/docs/pm/cli/add

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| App / product developers | Unblock a dependency before an upstream release, test a fork, or consume internal shared code | Intermediate |
| Library maintainers / contributors | Validate branch, tag, or commit-based installs before publishing | Intermediate–Advanced |
| CI / platform engineers | Make private Git installs, credentials, and build steps work consistently in automation | Advanced |
| Monorepo maintainers | Expose one package or workspace from a multi-package repo without confusing consumers | Advanced |
| AI coding agents | Choose between direct Git install, tarball, registry publish, or local workspace workflow based on durability and auth constraints | Intermediate |

## Current Workarounds
1. Pin to a commit SHA instead of a floating branch to reduce reproducibility drift.
2. Use tags or `#semver:` selectors when Git is still needed but release discipline matters.
3. Fall back to tarballs (`npm pack`, release artifacts, tarball URLs) when cloning/building from Git is brittle.
4. Use `file:`, links, or workspaces for active local co-development instead of fighting remote Git dependency behavior.
5. Move private dependencies to GitHub Packages or another private registry once auth and CI setup become the main pain.
6. Treat Git installs as short-lived bridges, then replace them with a published version or prerelease.

## Adjacent Problems
- Private-repo auth, CI token handling, SSH host-key setup, and machine onboarding
- Install-time `prepare` / `build` behavior surprising consumers of Git dependencies
- Lockfile clarity and branch/tag mutability vs SHA pinning
- Monorepo/subdirectory packaging ambiguity across package managers
- Supply-chain visibility and provenance compared with registry-first installs
- Cross-package-manager behavior differences when the upstream repo uses different metadata or packers

## User Voices
- “I need the fix before the maintainer cuts a release.” — the core reason Git refs stay in real workflows, especially for forks and emergency patches.
- “Why did install suddenly compile somebody else’s repo?” — npm and Yarn both document that Git dependencies may be packed/built during install instead of behaving like registry tarballs.
- “Private Git dependencies work locally but fail in CI.” — the pain is usually auth and environment setup, not syntax.
- “I only want one package from a monorepo.” — a real demand that workspace-aware tooling partly solves, but not uniformly across managers.
- “We used a Git URL as a bridge, then moved to a registry.” — the dominant durable pattern.

Evidence note: official doc sources were available; web search/extract tooling returned auth errors during this run, so broader community evidence is represented conservatively through issue-search entry points and workflow synthesis rather than direct quoted threads.
