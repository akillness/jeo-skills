# Solution Landscape: npm-git-install modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| npm registry / private npm registry | Publish package versions to a registry | Strongest reproducibility, semver flow, best CI/tool compatibility | Requires publish pipeline and registry auth/setup | Best default for durable consumption |
| GitHub Packages / scoped private registry | Registry semantics tied to GitHub org access | Better than raw private Git for shared packages | Token/scoped-registry setup overhead | Strong for org-private packages |
| Direct Git dependency (`git+ssh`, `git+https`, GitHub shorthand) | Install from repo source, branch, tag, or commit | Fastest way to consume an unreleased fix or fork | Auth friction, install-time build surprises, weaker release discipline | Best as a bridge, not a steady state |
| Tarball (`npm pack`, release artifact, tarball URL) | Consume packaged artifact without full registry flow | More reproducible than raw Git, avoids some source-build surprises | Artifact management is manual | Good middle ground for temporary distribution |
| `file:` / link / workspace flow | Local or monorepo development linkage | Fastest inner-loop dev workflow | Not a general remote distribution method | Best when both repos are locally available |
| Workspace-aware Git / monorepo-specific packaging | Select one package from a multi-package repo | Helps when repo root != package root | Tool support varies by package manager | Yarn is stronger here than classic npm-style flows |
| Niche helpers (for example gitpkg-style bridges) | Turn GitHub source/subdirs into installable package artifacts | Can paper over subdir gaps | More moving parts, niche adoption | Lower-priority fallback |

## Categories
- **Registry-first distribution**: npm registry, GitHub Packages, private registries
- **Source-based installation**: direct Git URLs, GitHub shorthands, branch/tag/commit installs
- **Artifact-based distribution**: tarball URLs, `npm pack`, release assets
- **Local development linking**: `file:`, workspaces, link-based workflows
- **Monorepo/subdir strategies**: workspace-aware packaging, publish-per-package, subdir helpers
- **Private access/auth**: SSH Git auth, HTTPS token auth, `.npmrc` scoped-registry auth

## What People Actually Use
Developers use direct Git refs mostly as a short-lived escape hatch for forks, unreleased fixes, and internal repos. Once teammates, CI, or production are involved, they usually move to one of three safer patterns: publish a prerelease, ship a tarball, or switch to a private registry. For local co-development, they often abandon remote Git installs entirely and use `file:` / workspace linking.

## Frequency Ranking
1. Registry publish (public or private)
2. Local workspaces / `file:` during active co-development
3. Direct Git dependencies for temporary forks/unreleased fixes
4. Private registry options such as GitHub Packages
5. Tarball URLs / release artifacts
6. Monorepo subdirectory / workspace-aware Git strategies
7. Niche helper tooling

## Key Gaps
- Existing repo skill is npm-only and does not teach **when not to use direct Git install**.
- It underplays install-time `prepare` / build behavior, which is one of the most important real-world surprises.
- It lacks a decision layer between **Git ref**, **tarball**, **workspace**, and **registry publish**.
- It lacks practical guidance on **private repo auth**, **CI implications**, and **SHA pinning vs branch refs**.
- It does not reflect package-manager differences across npm, pnpm, Yarn, and Bun.
- It lacks support files and evals, so the skill is easy to trigger incorrectly and hard to keep current.

## Contradictions
- Marketed claim: Git-based install is a simple package source shortcut.
  Reality: for many repos it behaves like a source-clone + pack/build workflow with more auth and toolchain dependencies than a normal package install.
- Marketed claim: branch installs are convenient.
  Reality: most durable workflows quickly pin SHAs or move off Git dependencies because floating refs complicate lockfiles and incident response.
- Marketed claim: installing from GitHub is enough for private distribution.
  Reality: once multiple humans and CI systems need the package, teams often prefer registry auth over repeated Git credential setup.

## Key Insight
A good `npm-git-install` skill should not be a command cheat sheet. It should be a decision-first operator skill that picks the safest practical delivery path for the situation: direct Git install for a short-lived bridge, SHA pinning for reproducibility, tarballs when you need packaged artifacts without full registry overhead, workspaces for active local development, and registry publication when the dependency becomes shared infrastructure.

## Curated Sources
- npm `package.json` and package spec: https://docs.npmjs.com/cli/v11/configuring-npm/package-json , https://docs.npmjs.com/cli/v11/using-npm/package-spec
- npm publish guide: https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/
- pnpm add / workspaces: https://pnpm.io/cli/add , https://pnpm.io/workspaces
- Yarn Git protocol / file protocol / workspaces: https://yarnpkg.com/protocol/git , https://yarnpkg.com/protocol/file , https://yarnpkg.com/features/workspaces
- Bun add / scopes and registries: https://bun.sh/docs/pm/cli/add , https://bun.sh/docs/pm/scopes-registries
- GitHub Packages npm registry: https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry
- Issue-search entry points: https://github.com/npm/cli/issues?q=is%3Aissue+git+dependency , https://github.com/pnpm/pnpm/issues?q=is%3Aissue+git+dependency , https://github.com/yarnpkg/berry/issues?q=is%3Aissue+git+dependency
