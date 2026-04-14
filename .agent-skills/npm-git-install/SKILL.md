---
name: npm-git-install
description: >
  Choose the safest way to consume a Node package from GitHub or another Git
  remote: direct Git install, SHA pin, private-repo auth, tarball, workspace/file
  link, or publish-first alternative. Use when the user wants to install an npm /
  pnpm / Yarn / Bun package from a branch, tag, commit, fork, private repo,
  monorepo package, or unreleased fix, or when they ask whether a direct Git
  dependency is the right tool at all. Triggers on: npm install from GitHub,
  git dependency, git+ssh, git+https, github:owner/repo, install branch, install
  commit, private npm package from repo, monorepo package install, npm pack vs git.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best for Node/TypeScript repositories where the main question is package delivery
  strategy and install mechanics, not general Git collaboration or registry admin.
  Covers npm, pnpm, Yarn, and Bun syntax at the decision level.
metadata:
  tags: npm, pnpm, yarn, bun, git, github, package-management, node, monorepo, private-packages
  platforms: Claude, ChatGPT, Gemini, Codex, OpenCode
  version: "2.0.0"
  source: akillness/oh-my-skills
---

# Git-Based Node Package Install

Use this skill as the repository's **decision-first guide for consuming Node packages from Git or safer alternatives**.

The job is not to dump every install command in existence. The job is to:
1. determine whether direct Git install is actually the right delivery path,
2. pick one package-delivery mode,
3. choose the right package-manager syntax,
4. make auth, build, and reproducibility risks explicit before the user gets surprised in CI.

Read [references/delivery-decision-matrix.md](references/delivery-decision-matrix.md) first, then use [references/package-manager-behavior.md](references/package-manager-behavior.md) and [references/private-auth-and-ci.md](references/private-auth-and-ci.md) for deeper cases.

## When to use this skill
- The user wants to install a Node package from GitHub or another Git host
- The package is unpublished, forked, branch-pinned, tag-pinned, commit-pinned, or private
- The package lives in a monorepo and the user is unsure whether Git install, workspace linking, or publish-first is better
- The user asks about `git+ssh`, `git+https`, `github:owner/repo`, tarball installs, or `npm pack`
- The user needs help deciding between direct Git dependency, tarball, local workspace link, or registry publish

## When not to use this skill
- The main task is fixing local Git branch/history problems → use `git-workflow`
- The main task is creating or operating GitHub repos, packages, or releases at the admin level → use `github-repo-management`
- The main task is monorepo/task-runner automation rather than package delivery choice → use `workflow-automation`
- The main task is general environment setup across runtimes, services, and containers → use `system-environment-setup`
- The user already has a normal registry package and only needs ordinary dependency updates

## Instructions

### Step 1: Normalize the package-delivery request
Capture the request in this form before recommending commands:

```yaml
git_package_request:
  package_manager: npm | pnpm | yarn | bun | mixed | unknown
  desired_source: github | generic-git | tarball | local-workspace | unknown
  package_state: unpublished | prerelease | private | fork | upstream-fix | monorepo-package | stable-release | unknown
  ref_type: branch | tag | commit | semver-tag | none | unknown
  audience: local-only | team | ci | production | unknown
  auth_mode: public | ssh | https-token | registry-token | unknown
  build_expectation: source-build-ok | prebuilt-only | unknown
  reproducibility_need: low | medium | high
  main_question: "what is the safest practical install path right now?"
```

If context is missing, state the assumptions instead of pretending every direct Git install is acceptable.

### Step 2: Choose exactly one delivery mode
Pick one primary mode.

1. **direct Git install**
   - Use when the goal is an unpublished fix, fork, or temporary bridge and the team accepts Git-based install behavior.

2. **direct Git install with SHA pin**
   - Use when Git is still the best short-term bridge but reproducibility matters more than branch convenience.

3. **private Git install**
   - Use when the package is private and the main challenge is auth/CI setup rather than public syntax.

4. **tarball / `npm pack` artifact**
   - Use when the team wants a packaged artifact without standing up or using a registry.

5. **workspace / `file:` / local link**
   - Use when both sides are being developed together locally or in a monorepo-style workflow.

6. **publish-first / private registry**
   - Use when the dependency is no longer a one-off bridge and now needs stable team/CI/production consumption.

### Step 3: Apply the decision ladder
Use these rules:

- Prefer **publish-first / private registry** when the dependency is shared across teammates, CI, or production and the package is expected to stay around.
- Prefer **SHA pinning** over floating branches when direct Git install is necessary.
- Prefer **tarball / `npm pack`** when the repo's build/prepare behavior is risky but a full registry workflow is overkill.
- Prefer **workspace / `file:`** when both the package and app are moving together locally.
- Prefer **private Git install** only when the team can actually support SSH/token auth in every required environment.
- Treat **branch installs** as convenience shortcuts, not durable infrastructure.

### Step 4: Choose the package-manager syntax
Once the delivery mode is chosen, provide the narrowest correct syntax.

Common patterns:
- **npm / pnpm / Bun public Git**
  - `npm install github:owner/repo#commit`
  - `pnpm add github:owner/repo#commit`
  - `bun add github:owner/repo#commit`
- **Git URL forms**
  - `git+https://github.com/owner/repo.git#commit`
  - `git+ssh://git@github.com/owner/repo.git#commit`
- **Yarn Git protocol**
  - `yarn add owner/repo#commit`
  - use Yarn's stronger Git/workspace flow when the package lives in a monorepo and the upstream repo already uses Yarn-oriented metadata
- **Tarball / pack artifact**
  - `npm install https://.../package.tgz`
  - `pnpm add https://.../package.tgz`
  - `yarn add https://.../package.tgz`
  - `bun add https://.../package.tgz`
- **Local workspace / file path**
  - `"dep": "file:../relative-path"`
  - or the package manager's normal workspace dependency flow

Do not emit every syntax variant if one package manager is already clear from context.

### Step 5: Make auth, build, and reproducibility visible
Every answer must explicitly cover:
- whether the ref should be **branch / tag / SHA**,
- whether the install will likely pull **source + lifecycle/build behavior** rather than a clean registry artifact,
- what auth/setup is required for local dev and CI,
- what the recommended exit path is if this dependency stops being temporary.

### Step 6: Use this output structure

```markdown
# Git Package Install Brief

## Recommended mode
- direct Git install | direct Git install with SHA pin | private Git install | tarball / pack artifact | workspace / file link | publish-first / private registry
- Why: ...

## Current assumptions
- Package manager: ...
- Package state: ...
- Audience: local-only | team | ci | production
- Reproducibility need: low | medium | high
- Confidence: high | medium | low

## Recommended install path
1. ...
2. ...
3. ...

## Commands
```bash
...
```

## Auth / environment notes
- ...
- ...

## Build / packaging notes
- ...
- ...

## Exit strategy
- When to replace this with tarball, workspace, or registry publish: ...

## What not to do yet
- 1-3 bullets that prevent the wrong long-term choice

## Adjacent handoff
- `git-workflow` when ...
- `github-repo-management` when ...
- `workflow-automation` when ...
- `system-environment-setup` when ...
```

### Step 7: Use these mode-specific heuristics

**For direct Git install**
- good for forks, unreleased fixes, or short-lived bridge cases
- warn about branch drift if the user asks for `main` / `master`
- prefer commit pin if the result will be shared

**For direct Git install with SHA pin**
- make the SHA part of the recommendation, not an optional footnote
- call out that this is the safest Git-based temporary path for team/CI usage
- still recommend a publish/tarball exit if the dependency becomes durable

**For private Git install**
- tell the user whether SSH or HTTPS token auth is the chosen path
- remind them that CI and teammate machines need the same credential story
- do not recommend embedding secrets into committed manifests or docs

**For tarball / `npm pack` artifact**
- recommend this when the team wants packaged output without registry overhead
- use it when install-time build/prepare behavior from raw Git is the bigger risk
- mention who owns artifact refresh/versioning

**For workspace / `file:` / local link**
- use this for active co-development, not remote third-party consumption
- keep it local/repo-scoped and say so explicitly
- avoid pretending it solves cross-machine distribution

**For publish-first / private registry**
- make this the default recommendation when the package is shared infrastructure
- emphasize stable versions, easier CI, and cleaner onboarding
- reserve Git refs for emergency bridges, not normal dependency governance

## Output format
Return a **short operator-style package-install brief**.

Required qualities:
- pick one delivery mode, not five parallel options
- clearly say when **not** to use direct Git install
- make auth/build/reproducibility consequences explicit
- tailor commands to the package manager actually in use
- leave a clear exit strategy for temporary Git-based dependencies

## Examples

### Example 1: unpublished upstream fix
**Input**
> We need a package fix from a GitHub PR branch before the maintainer publishes a release.

**Output sketch**
- Recommended mode: `direct Git install with SHA pin`
- Notes that branch install is too floaty for CI/team use
- Gives one package-manager-specific command and an exit plan back to a registry release

### Example 2: private repo in CI
**Input**
> Our app needs a private package from a GitHub repo and CI keeps failing auth.

**Output sketch**
- Recommended mode: `private Git install` or `publish-first / private registry`, depending on how shared/durable the package is
- Clarifies SSH vs token auth and calls out CI credential parity
- Warns against committing secrets into package manifests

### Example 3: monorepo package confusion
**Input**
> The package lives in a monorepo. Should we install from GitHub or do something else?

**Output sketch**
- Often recommends `workspace / file:` for local co-dev or `publish-first` for durable external use
- Mentions that monorepo/subdir support differs across package managers
- Avoids overselling raw Git install as the universal answer

## Best practices
1. **Decide the delivery mode before writing commands** — syntax is the easy part.
2. **Treat Git refs as a bridge, not a default release channel**.
3. **Prefer SHA pins over floating branches** when a Git dependency must be shared.
4. **Surface lifecycle/build behavior early** — Git installs may behave like source packaging, not registry downloads.
5. **Keep auth stories explicit and portable** across local machines and CI.
6. **Recommend a durable exit path** once the dependency stops being temporary.

## References
- [Delivery decision matrix](references/delivery-decision-matrix.md)
- [Package-manager behavior](references/package-manager-behavior.md)
- [Private auth and CI notes](references/private-auth-and-ci.md)
- `../git-workflow/SKILL.md`
- `../github-repo-management/SKILL.md`
- `../workflow-automation/SKILL.md`
- `../system-environment-setup/SKILL.md`
- npm package spec: https://docs.npmjs.com/cli/v11/using-npm/package-spec
- npm package.json Git docs: https://docs.npmjs.com/cli/v11/configuring-npm/package-json
- pnpm add: https://pnpm.io/cli/add
- Yarn Git protocol: https://yarnpkg.com/protocol/git
- Bun add: https://bun.sh/docs/pm/cli/add
