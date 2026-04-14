# Package-Manager Behavior Notes

## Shared reality
All major managers can install from Git, but Git dependencies are not always equivalent to registry tarballs.

Common consequences:
- install may involve cloning the repo
- lifecycle/build steps can run
- auth and Git host access become part of dependency installation
- monorepo/subdir support is uneven

## npm
- Strong baseline syntax support for GitHub shorthands and Git URLs
- Important caveat: Git dependencies may trigger packing/build-related lifecycle behavior
- Good fit when the repo already uses npm and the need is straightforward

## pnpm
- Similar Git-install ergonomics to npm for many cases
- Strong workspace story for pnpm-managed repos, but still decide whether remote Git is the right tool before defaulting to it

## Yarn
- Git protocol is a first-class concept
- Especially relevant when the upstream repo is Yarn-oriented or the package lives in a workspace/monorepo setup
- Better place to mention repo/workspace-specific Git behavior than pretending npm-style rules cover everything

## Bun
- Bun can install from Git and tarballs with concise syntax
- Still apply the same decision rules: direct Git is a bridge, not automatically the best long-term package channel

## Operator rule
When the package manager is known, give only the commands for that manager unless a contrast is necessary.
