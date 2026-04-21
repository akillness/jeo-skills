# Delivery Decision Matrix

Use this matrix before giving commands.

| Situation | Prefer | Why |
|---|---|---|
| Need an unpublished fix or fork right now | Direct Git install with **SHA pin** | Fast bridge with better reproducibility than a floating branch |
| Need a private package for one repo or short-lived internal test | Private Git install | Acceptable if SSH/token auth is already solved everywhere it must run |
| Need a package shared across teammates, CI, or production for more than a short bridge | Publish-first / private registry | Best release hygiene, onboarding, lockfile clarity, and CI reliability |
| Need packaged output without registry overhead | Tarball / `npm pack` artifact | Safer than raw Git when build/prepare behavior is risky |
| Developing package + app together on the same machine or monorepo | Workspace / `file:` / local link | Best inner-loop speed; not a remote distribution strategy |
| User asks for `#main` / `#master` on a dependency that will be shared | Push them to SHA pin or publish | Branches drift and make incident response harder |
| Monorepo package root is not repo root | Prefer workspace-aware tooling or publish-per-package | Raw Git install support varies; avoid pretending all managers behave the same |

## Default recommendation order
1. Publish-first / private registry for durable shared usage
2. Workspace / `file:` for active local co-development
3. SHA-pinned Git install for short-lived bridges
4. Tarball / `npm pack` when packaged artifacts are needed without full registry setup
5. Floating-branch Git install only as an explicitly temporary convenience
