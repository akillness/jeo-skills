# Solution Landscape: changelog-maintenance modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Keep a Changelog | Editorial changelog standard | Clear categories, user-facing orientation, strong anti-git-log guidance | Not a workflow by itself; no automation | Best baseline for durable `CHANGELOG.md` structure. Source: https://keepachangelog.com/en/1.1.0/ |
| Semantic Versioning | Versioning contract | Shared language for major/minor/patch decisions | Easy to cargo-cult without migration/user-impact context | Should be a decision aid, not the whole skill. Source: https://semver.org/ |
| Release Drafter | PR-label → draft release notes automation | Good for categorized draft generation in GitHub workflows | Still needs editorial cleanup and audience-specific framing | Useful for automation mode; source: https://github.com/release-drafter/release-drafter |
| Changesets | Multi-package versioning + changelog tooling | Strong monorepo / package-release workflow | Heavier than many repos need; package-centric | Best for package versioning lanes, not universal release communication. Source: https://github.com/changesets/changesets |
| release-please | Conventional-commit / manifest-driven release automation | Strong automation for release PRs and version bumps | Best when commit hygiene is already strong | Good neighboring automation reference. Source: https://github.com/googleapis/release-please |
| ProductPlan release-note guidance | Customer-readable product release-note heuristics | Plain-language, short, grouped, linked, branded guidance | Blog guidance; not repo automation | Strong evidence that customer notes differ from internal changelog upkeep. Source: https://www.productplan.com/learn/release-notes-best-practices/ |
| Steam patch notes / update docs | Game-update communication workflow | Explicit lightweight patch-note mode and separate major-update visibility mechanics | Steam-specific platform surface | Strong game-dev evidence that patch notes are their own communication mode. Sources: https://partner.steamgames.com/doc/marketing/event_tools/type_patchnotes?l=english and https://partner.steamgames.com/doc/store/updates?l=english |

## Categories
- **Editorial standards**: Keep a Changelog, Semantic Versioning
- **Automation/tooling**: Release Drafter, Changesets, release-please
- **Customer/product communication**: ProductPlan and adjacent release-note best-practice guides
- **Game/live-ops communication**: Steam patch-note + update-announcement docs

## What People Actually Use
The landscape suggests teams blend three layers rather than relying on one tool:
1. An editorial structure (`CHANGELOG.md`, version categories, migration section)
2. A drafting mechanism (PR labels, conventional commits, release PR tooling)
3. A channel-specific communication layer (customer release notes, docs links, game patch notes, launch announcements)

That matches the repo problem: the current skill over-indexes on examples and semver basics, but under-specifies audience/mode selection and route-outs to neighboring documentation skills.

## Frequency Ranking
1. Keep a Changelog / SemVer pairing
2. GitHub automation tools (`release-drafter`, `changesets`, `release-please`)
3. Product/customer release-note best-practice guides
4. Game patch-note / update-channel guidance

## Key Gaps
- Few solutions unify **internal changelog hygiene**, **customer release notes**, **migration callouts**, and **game patch-note mode** in one boundary-aware workflow.
- Automation tools draft text, but they do not decide the right audience, grouping policy, or neighboring-doc links.
- Release-note guidance often ignores route-outs to API docs, user guides, migration docs, or launch-marketing follow-through.

## Contradictions
- Automation products market “automatic release notes,” but the strongest editorial sources still require human/agent judgment about audience, clarity, and grouping.
- Many guides treat release notes as customer content, while repo changelog standards optimize for durable historical record. Both are valid; they are not the same artifact.
- Game patch notes are intentionally lightweight, while software changelogs often need stronger migration/deprecation detail.

## Key Insight
The best bounded repo improvement is not creating another release-note or launch wrapper. It is modernizing `changelog-maintenance` into a **mode-selecting release-history and release-communication anchor** with explicit modes for `changelog`, `release-notes`, `migration-update`, and `game-patch-notes`, plus clear route-outs to `technical-writing`, `user-guide-writing`, `api-documentation`, `deployment-automation`, and `marketing-automation`.
