# Intake Packets and Route-outs

Start from the package-delivery packet the user already has. Do not force every request through a giant syntax tour.

## `temporary-bridge-packet`
Use when the request is about an unpublished fix, fork, PR branch, or short-lived unblocker.

Capture:
- package manager
- repo/ref currently being considered
- whether the bridge is local-only or already shared
- how long the bridge is expected to live

Good outcomes:
- one direct Git bridge recommendation
- one warning if the user is about to use a floating branch for shared work
- one exit strategy note

Route out when:
- the real work is fixing the underlying branch/history state → `git-workflow`
- the real work is publishing or administering the package host → `github-repo-management`

## `shared-bridge-packet`
Use when teammates or CI need the same bridge and reproducibility now matters.

Capture:
- current ref type: branch, tag, SHA
- whether lockfiles and deterministic install commands are already part of the workflow
- whether multiple repos or deploy environments depend on the same bridge

Look for:
- SHA pin over floating branch
- one clear package-manager-specific command
- one honest recommendation for when to stop bridging and publish/package properly

Route out when:
- the next job is wiring scripts or repeatable repo automation around the chosen flow → `workflow-automation`

## `private-auth-packet`
Use when the install path is private and auth parity is the real blocker.

Capture:
- SSH vs HTTPS token vs registry token path
- whether local and CI use the same auth story
- whether the bridge is still temporary or has become routine infrastructure

Good outcomes:
- one chosen auth path
- one explicit CI parity note
- one warning against committing secrets into manifests or docs

Route out when:
- package hosting/repo admin is now the real work → `github-repo-management`
- machine/runtime provisioning is the blocker rather than package choice → `system-environment-setup`

## `artifact-fallback-packet`
Use when raw Git installs are too brittle but a full registry workflow is not justified yet.

Capture:
- whether install-time build/prepare behavior is unsafe or surprising
- who owns artifact refresh/versioning
- whether a tarball URL or `npm pack` flow is acceptable

Look for:
- tarball / `npm pack` recommendation
- explicit artifact ownership
- clear explanation of why raw Git is the wrong fit here

Route out when:
- release/package publication is now the better long-term answer → `github-repo-management`

## `workspace-inner-loop-packet`
Use when both the app and package are being developed together locally or within one monorepo-style workflow.

Capture:
- whether the package is only needed on one machine/repo right now
- whether workspace-aware tooling already exists
- whether the user is accidentally solving a local co-dev problem with a remote Git dependency

Good outcomes:
- workspace / `file:` recommendation
- explicit note that this is not a remote distribution strategy
- route away from raw Git when the package root / monorepo layout makes that misleading

Route out when:
- the main job is monorepo automation or task-runner wiring → `workflow-automation`

## `durable-distribution-packet`
Use when the package is no longer a one-off bridge and multiple repos, teammates, CI, or production depend on it routinely.

Capture:
- number of consuming repos/environments
- onboarding/release friction
- whether branch/SHA installs are now acting like permanent infrastructure

Good outcomes:
- publish-first / private registry recommendation
- artifact fallback only when registry overhead is still genuinely too high
- clear statement that floating Git refs are not durable shared infrastructure

Route out when:
- the next job is package-host administration, release setup, or registry configuration → `github-repo-management`

## Quick route-out table
| If the real question is... | Route to |
|---|---|
| How should we consume this Node package right now? | `npm-git-install` |
| How do we fix the branch/history state behind the dependency? | `git-workflow` |
| How do we run or automate the chosen install/release flow in the repo? | `workflow-automation` |
| How do we administer repos, releases, packages, or package hosts? | `github-repo-management` |
| How do we provision the machine/runtime/container so installs work at all? | `system-environment-setup` |

## Rule of thumb
A good delivery packet is the smallest artifact set that lets you choose one honest install path. If the packet still cannot support that choice, ask for one missing artifact or route to the neighboring skill that owns the next step.
