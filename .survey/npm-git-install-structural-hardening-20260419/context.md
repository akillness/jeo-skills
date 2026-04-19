# Context: npm-git-install structural hardening

## Workflow Context
`npm-git-install` already owns the right utility boundary: decide whether a Node dependency should come from a Git ref, SHA pin, private Git path, tarball / `npm pack` artifact, workspace / `file:` link, or publish-first registry path. The current gap is structural, not topical. The skill still presents that boundary through a dense front door, while the repo's newer maintenance pattern is a smaller routing-first entry backed by support packets.

Across this run's required domains, the same workflow shows up with different wrappers:
- **CLI / developer workflow**: unpublished fixes, forks, and CI-safe dependency bridging.
- **Web / fullstack**: app teams pulling temporary package fixes before a release.
- **Product / ops**: internal automation repos deciding between private Git installs and durable package hosting.
- **Marketing / content automation**: shared Node tooling for campaign/reporting pipelines where branch installs create hidden CI drift.
- **Game development**: build tooling, editor helpers, or content-pipeline packages that may start as a Git bridge but should not silently become long-term release infrastructure.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Fullstack developer | Pull an unpublished or forked dependency into an app safely | Intermediate |
| Dev tooling / platform owner | Keep team and CI installs reproducible | Advanced |
| Product / ops automation maintainer | Share internal Node tooling without brittle auth surprises | Intermediate |
| Marketing automation maintainer | Consume internal package code in pipelines without branch drift | Intermediate |
| Game tools engineer | Bridge tool/package changes into build or content workflows | Intermediate |

## Current Workarounds
1. Install directly from a branch because it is the fastest visible path.
   - Limitation: branch refs drift and create CI/team reproducibility problems.
2. Use raw private Git dependencies and patch auth later.
   - Limitation: local vs CI credential stories diverge and fail late.
3. Keep using Git installs long after the dependency is shared infrastructure.
   - Limitation: what should become a registry or artifact workflow stays a brittle bridge.
4. Treat monorepo packages as if remote Git install and local co-development were the same thing.
   - Limitation: workspace / `file:` cases blur with external package distribution.

## Adjacent Problems
- Confusion between package delivery choice and local Git workflow ownership.
- Hidden install-time build / lifecycle behavior when raw Git sources are consumed.
- Missing exit strategy after a temporary Git bridge becomes durable.
- Discovery surfaces can over-advertise the old broad command-catalog feel if compact/docs text is not kept in sync.

## User Voices
- “The npm ci command is typically used in continuous integration (CI) environments, where the `package-lock.json` or `npm-shrinkwrap.json` file is checked into version control and should not be modified.” — DuckDuckGo HTML indexed snippet for Stack Overflow, *What is the difference between `npm install` and `npm ci`?* (high confidence indexed snippet)
- “The only possibility I know of is to link to a specific commit using its ID.” — DuckDuckGo HTML indexed snippet for Stack Overflow, *npm install from Git in a specific version* (high confidence indexed snippet)
- “To solve this problem locally you setup ssh key on your github account tied to the organization. But how can I solve this issue … in the workflow ci …” — DuckDuckGo HTML indexed snippet for Stack Overflow, *How to install private github repository via npm in github actions workflow ci* (high confidence indexed snippet)
- DuckDuckGo HTML returned **0 indexed results** for a narrow monorepo Git-install query (`monorepo package install github workspace yarn pnpm site:stackoverflow.com`), so monorepo workflow detail in this survey is treated primarily as direct-doc evidence plus existing repo knowledge, not fresh community proof.
