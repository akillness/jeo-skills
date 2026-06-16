---
name: npm-git-install
description: >
  Route Node package-delivery ambiguity into one install packet: temporary Git
  bridge, SHA-pinned shared bridge, private-auth Git path, tarball / `npm pack`
  artifact, workspace / `file:` inner-loop, or publish-first registry handoff.
  Use when the user wants to install an npm / pnpm / Yarn / Bun package from a
  branch, tag, commit, fork, private repo, monorepo package, or unreleased fix,
  and the real question is which delivery path is safest rather than how Git or
  package registries work in general. Triggers on: npm install from GitHub, git
  dependency, github:owner/repo, git+ssh, git+https, private package from repo,
  install branch vs commit, monorepo package install, npm pack vs git, and
  should we publish this instead.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best for Node/TypeScript repositories where the main question is package
  delivery strategy and install mechanics, not local Git recovery, package-host
  administration, or full environment setup. Covers npm, pnpm, Yarn, and Bun at
  the decision level.
metadata:
  tags: npm, pnpm, yarn, bun, git, github, package-management, node, monorepo, private-packages
  platforms: Claude, ChatGPT, Gemini, Codex, OpenCode
  version: "2.1.0"
  source: akillness/jeo-skills
---

# Git-Based Node Package Install

Use this skill when the main question is **"what install packet should we trust, what delivery path fits this dependency, and what should we do next?"**

The job is not to dump every syntax variant or treat raw Git installs as normal infrastructure.
The job is to:
1. normalize the package-delivery packet already in hand,
2. choose one primary delivery mode,
3. make durability, auth, and build consequences explicit,
4. tailor commands to the package manager actually in use,
5. leave a clear exit path when a temporary Git bridge is starting to become permanent.

Read [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md) before handling an unfamiliar delivery packet.
Read [references/delivery-decision-matrix.md](references/delivery-decision-matrix.md) when deciding between Git, tarball, workspace, or publish-first.
Read [references/package-manager-behavior.md](references/package-manager-behavior.md) for manager-specific caveats.
Read [references/private-auth-and-ci.md](references/private-auth-and-ci.md) when CI or private auth is already part of the packet.

## When to use this skill
- The user wants to install a Node package from GitHub or another Git host
- The package is unpublished, forked, branch-pinned, tag-pinned, commit-pinned, or private
- The package lives in a monorepo and the user is unsure whether Git install, workspace linking, tarball, or publish-first is the honest answer
- The user asks about `git+ssh`, `git+https`, `github:owner/repo`, tarball installs, `npm pack`, or `file:` / workspace links
- A shared dependency is still being treated like a temporary Git shortcut and someone needs to decide whether that shortcut should continue

## When not to use this skill
- **The main task is fixing local Git branch/history problems** → use `git-workflow`
- **The main task is creating or operating GitHub repos, packages, or releases at the admin level** → use `github-repo-management`
- **The main task is monorepo/task-runner automation rather than package-delivery choice** → use `workflow-automation`
- **The main task is broader runtime, machine, container, or service setup** → use `system-environment-setup`
- **The user already has a normal registry dependency and only needs an ordinary version bump**

## Instructions

### Step 1: Start from the delivery packet already in hand
Use [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md).

Normalize the request into one of these packet shapes:
- `temporary-bridge-packet` — unpublished fix, fork, PR branch, or short-lived bridge to unblock work now
- `shared-bridge-packet` — teammates or CI need the bridge too, so branch drift and lockfile stability matter
- `private-auth-packet` — the install path is private and the real risk is credential parity across local and CI
- `artifact-fallback-packet` — raw Git source installs are too brittle, but a full registry workflow is still too heavy
- `workspace-inner-loop-packet` — both the app and package are being developed together locally or inside a monorepo
- `durable-distribution-packet` — the dependency is no longer a one-off bridge and should probably stop behaving like one

Capture the minimum useful frame:

```markdown
Packet: shared-bridge-packet
Package manager: pnpm
Package state: unpublished fork fix
Audience: CI + teammates
Current ref: feature branch
Main risk: branch drift and auth parity
```

Rule: start from the packet the user already has. Do not force them through a perfect release-management template before answering.

### Step 2: Choose one primary delivery mode
Pick exactly one primary mode:
- `direct-git-bridge` — local-only or clearly temporary bridge from Git
- `sha-pinned-shared-bridge` — Git is still the bridge, but shared reproducibility matters
- `private-git-auth-path` — the short-term answer is still private Git, and the key constraint is auth parity
- `tarball-or-pack-artifact` — package the dependency without relying on raw Git source install behavior
- `workspace-or-file-link` — keep co-development local or monorepo-scoped
- `publish-first-registry-path` — move to a durable distribution channel

Optional: mention one fallback mode, but do not flatten every request into a six-option menu.

### Step 3: Classify durability
Use a small durability model:
- **Tier 0 — local-only**
- **Tier 1 — team / CI bridge**
- **Tier 2 — durable shared package**
- **Tier 3 — production / release infrastructure**

Capture only what changes the decision:
- who consumes it
- whether the ref is floating or fixed
- whether raw source install behavior is acceptable
- whether local and CI already share one auth story
- what the exit path should be if the dependency stays around

If the packet spans multiple tiers, plan for the highest one.

### Step 4: Pick the safest mode from the ladder
Use [references/delivery-decision-matrix.md](references/delivery-decision-matrix.md).

Default order:
1. `publish-first-registry-path`
2. `workspace-or-file-link`
3. `sha-pinned-shared-bridge`
4. `tarball-or-pack-artifact`
5. `direct-git-bridge`

Rules:
- prefer **SHA pins** over floating branches for shared use
- prefer **artifact or publish-first** when raw Git build/prepare behavior is the risk
- prefer **workspace / file** when both sides move together locally
- treat **private auth** as a constraint, not proof that Git is the right long-term channel

### Step 5: Tailor commands to the manager in use
Give the narrowest correct syntax only.

Common patterns:
- SHA-pinned bridge: `npm install github:owner/repo#<commit>` / `pnpm add github:owner/repo#<commit>` / `yarn add owner/repo#<commit>` / `bun add github:owner/repo#<commit>`
- Git URL forms: `git+https://github.com/owner/repo.git#<commit>` or `git+ssh://git@github.com/owner/repo.git#<commit>`
- Tarball: `npm install https://.../package.tgz` (or equivalent for pnpm / Yarn / Bun)
- Local path: `"dep": "file:../relative-path"` or the normal workspace flow

If publish-first is the right answer, give the handoff plan before dumping temporary Git syntax.

### Step 6: Make auth, build, and reproducibility visible
Every answer must cover:
- chosen ref / artifact / published version strategy
- whether install pulls raw source + lifecycle/build behavior
- local + CI auth story
- deterministic install expectation (`npm ci`, frozen lockfile equivalents, pinned ref)
- replacement path once the dependency stops being temporary

Defaults:
- floating branches are convenience shortcuts, not shared infrastructure
- private Git is only as good as the worst environment's auth setup
- tarballs trade Git surprises for artifact ownership
- publish-first is usually the honest answer once the package becomes routine shared infrastructure

### Step 7: Route the next owner immediately
This skill owns package-delivery choice, not every downstream task.

Typical route-outs:
- `git-workflow` — fix or shape the underlying branch/history state
- `github-repo-management` — operate repos, packages, releases, or package-host settings
- `workflow-automation` — wire repeatable repo scripts or monorepo automation around the chosen package flow
- `system-environment-setup` — handle machine/runtime/container/service setup once the dependency question is no longer the main blocker

If the user asks “how should we consume this package?” stay here.
If they ask “how do we administer hosting or fix auth at the platform level?” route out.

### Step 8: Produce one concise install brief
Return a short operator-style brief with:
- packet
- primary mode
- durability tier
- 1-3 recommended steps
- only the needed commands
- auth / build / reproducibility notes
- exit strategy
- next owner if the work leaves this skill

If the honest answer is “publish this or package it properly,” say that directly.

## Output format
Always return a **Git package install brief**, **artifact recommendation brief**, or **publish-first handoff brief**.

Required qualities:
- identify the packet already in hand
- choose one primary delivery mode
- classify durability explicitly
- make auth/build/reproducibility consequences visible
- tailor commands to the package manager actually in use
- leave a clear exit strategy
- route package hosting, repo admin, workflow glue, or environment setup to the right neighboring skill

## Examples

### Example 1: unpublished fix shared in CI
**Input**
> We need an unpublished fix from a GitHub repo for our npm app. Should we install from the branch or do something safer for CI?

**Good output direction**
- `shared-bridge-packet`
- `sha-pinned-shared-bridge`
- rejects floating branch use for shared CI
- gives one npm-specific command plus an exit path

### Example 2: private package auth trouble
**Input**
> Our package is in a private GitHub repo and pnpm install keeps failing in CI. What path should we take?

**Good output direction**
- `private-auth-packet`
- chooses `private-git-auth-path` or `publish-first-registry-path`
- clarifies CI credential parity and avoids committed secrets

### Example 3: monorepo or durable shared package
**Input**
> The package lives in a monorepo. I use Yarn locally but the rest of the team just needs the package in normal projects. Should we install straight from GitHub?

**Good output direction**
- `workspace-inner-loop-packet` or `durable-distribution-packet`
- prefers workspace / `file:` for local co-development or publish-first for durable use
- does not oversell raw Git install

## Best practices
1. Start from the delivery packet already in hand, not from a favorite syntax form.
2. Treat Git refs as a bridge, not a default release channel.
3. Prefer SHA pins over floating branches whenever a Git dependency will be shared.
4. Surface lifecycle/build behavior early; raw Git installs can behave like source packaging, not registry downloads.
5. Keep local, team/CI, and durable shared usage clearly separated.
6. Treat private-auth pain as a signal to re-evaluate the delivery path, not just patch credentials forever.
7. Recommend a durable exit path once the dependency stops being temporary.
8. Update compact and discovery surfaces when the front-door wording changes materially.

## References
- [Intake packets and route-outs](references/intake-packets-and-route-outs.md)
- [Delivery decision matrix](references/delivery-decision-matrix.md)
- [Package-manager behavior](references/package-manager-behavior.md)
- [Private auth and CI notes](references/private-auth-and-ci.md)
- `../git-workflow/SKILL.md`
- `../github-repo-management/SKILL.md`
- `../workflow-automation/SKILL.md`
- `../system-environment-setup/SKILL.md`
- npm package spec: https://docs.npmjs.com/cli/v11/using-npm/package-spec
- npm package.json Git docs: https://docs.npmjs.com/cli/v11/configuring-npm/package-json
- npm pack: https://docs.npmjs.com/cli/v11/commands/npm-pack
- pnpm add: https://pnpm.io/cli/add
- pnpm workspaces: https://pnpm.io/workspaces
- Yarn Git protocol: https://yarnpkg.com/protocol/git
- Yarn workspaces: https://yarnpkg.com/features/workspaces
- Bun add: https://bun.sh/docs/pm/cli/add
- GitHub Packages: https://docs.github.com/en/packages/learn-github-packages/introduction-to-github-packages
