# Solution Landscape: npm-git-install structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| npm package spec / package.json Git deps | Canonical package-spec and manifest rules | Primary-source syntax for GitHub, git URLs, tarballs, tags/commits | Syntax-heavy; does not tell you when Git is the wrong delivery mode | Direct page retrieval (unverified SSL context) + keyword confirmation |
| pnpm add / workspaces | Package-manager-specific install + workspace guidance | Good for package-manager syntax and local/workspace alternatives | Not a decision layer by itself | Direct page retrieval (unverified SSL context) |
| Yarn Git protocol / workspaces | Explicit Git + monorepo guidance | Strong on Git protocol and workspace framing | Still needs a higher-level “should we do this?” router | Direct page retrieval (unverified SSL context) |
| Bun add | Bun package-manager syntax | Useful for Bun-specific command parity | Less useful for broader policy choices | Direct page retrieval (unverified SSL context) |
| npm pack | Tarball artifact fallback | Strong alternative when raw Git build behavior is too risky | Artifact refresh ownership still needs explanation | Direct page retrieval (unverified SSL context) |
| GitHub Packages | Publish-first/private-hosting path | Durable team/CI/production package hosting story | Heavier operational overhead than short-term bridges | Direct page retrieval (unverified SSL context) |

## Categories
- **Direct Git**: branch/tag/commit installs, GitHub shorthand, git+https, git+ssh
- **Safer Git bridge**: SHA-pinned Git dependencies for short-lived team/CI use
- **Artifact fallback**: tarball / `npm pack` output instead of raw Git source installs
- **Local co-dev**: workspace / `file:` links when both sides move together
- **Durable distribution**: publish-first / private registry or package hosting

## What People Actually Use
In practice, teams still reach for the fastest visible path first: branch installs, direct private Git dependencies, or one-off commit pins. Indexed snippets and existing repo notes both reinforce the same pattern: Git refs are common as a bridge, but once teammates or CI depend on them, users run into reproducibility, auth, or lifecycle-build surprises. The durable alternatives are not missing; what is missing is a small front door that forces one packet choice and makes the exit path explicit.

## Frequency Ranking
1. Direct Git install from GitHub or another remote
2. SHA-pinned Git install for team / CI usage
3. Private Git install with auth caveats
4. Workspace / `file:` link for local co-development
5. Tarball / `npm pack` artifact
6. Publish-first / private registry

## Key Gaps
- Official docs explain syntax better than decision boundaries.
- Community evidence skews toward fixing broken installs after the fact rather than choosing the right delivery mode upfront.
- The repo's current skill still carries more front-door detail than newer packet-first skills, even though the support docs already cover the deeper cases.

## Contradictions
- **Marketed/documented reality**: package-manager docs make Git installs look like ordinary dependency syntax.
- **Operational reality**: indexed snippets repeatedly surface CI parity, private auth, lockfile/reproducibility, and source-build surprises once teams try to share that shortcut.

## Key Insight
The next bounded improvement is not another Node package helper and not another broad modernization pass. It is a structural-hardening pass: make `npm-git-install` choose one intake packet up front, move route-out detail into a dedicated support reference, and sync the compact/discovery surfaces so the skill reads like the repo's other routing-first anchors instead of a slightly oversized command-and-heuristics front door.
