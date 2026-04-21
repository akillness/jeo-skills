# Solution Landscape: game-ci-cd-pipeline

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Unity Build Automation docs | Primary vendor guidance for investigating build failures and logs | Canonical Unity terminology; points teams to logs first | Focused on diagnosis, not reusable cross-platform pipeline design | Strong source for evidence collection and troubleshooting entry points |
| Unity Log Files manual | Primary log-location reference | Helps agents ask for the right files quickly | Not a workflow for preventing repeat CI failures | Useful supporting reference rather than full solution |
| Unreal logging docs | Primary logging reference | Establishes logging as the core evidence surface | Does not tell teams how to structure CI/CD guardrails | Best as an evidence-layer reference |
| Unreal packaging docs | Primary packaging workflow reference | Clarifies build/cook/stage/package steps and platform packaging | Still vendor-doc oriented, not operationalized into repeatable pipeline decisions | Useful for stage naming and artifact boundaries |
| Semaphore game CI/CD guide | Cross-engine operational article | Explicitly addresses large binaries, caching, and Unity/Unreal CI/CD concerns | General guidance; not an agent-ready workflow artifact | Best external framing for the missing skill |
| Forum threads / Reddit posts | Community troubleshooting corpus | Shows real failure shapes, workarounds, and pain language | Fragmented, noisy, often post-failure only | Good evidence for actual behavior, poor as a durable solution |

## Categories
- **Primary docs**: Unity Build Automation, Unity Log Files, Unreal Logging, Unreal Packaging
- **Operational guidance**: Semaphore's game CI/CD article
- **Community troubleshooting**: Epic forum cook/package threads, Reddit Unity/Unreal troubleshooting threads
- **Internal adjacent skills**: `game-build-log-triage`, `game-performance-profiler`, and generic `deployment-automation`

## What People Actually Use
People still debug failures by reading raw logs, searching forums, deleting caches, and retrying packaging. Community evidence points to repeated manual routines around `Editor.log`, UBT/UHT output, cook/package logs, missing asset references, refactor fallout, and editor-only code accidentally entering builds. Generic CI/CD skills exist, but they do not absorb engine-specific concerns like asset-heavy repos, engine license/auth concerns, platform SDKs, or stage-aware packaging checks.

## Frequency Ranking
1. Vendor docs for logs and packaging
2. Community forum/Reddit troubleshooting after failures happen
3. Generic CI/CD articles and templates
4. Existing repo skills adjacent to the problem, but not directly focused on game-engine pipeline design

## Key Gaps
- No single skill in `.agent-skills` currently turns Unity/Unreal pipeline requests into a structured audit covering cache strategy, build matrix, artifact naming, preflight checks, platform SDKs, smoke tests, and failure surfacing.
- Current game skills are excellent at triage or performance, but not at preventing repeated CI/CD breakage.
- Generic deployment skills are too web-app flavored and too broad for game-engine packaging realities.

## Contradictions
- Docs and tutorials imply a straightforward packaging workflow, but community results show teams frequently fall back to brittle manual cleanup and forum-driven debugging.
- Generic CI/CD advice markets automation as solved, while game-development pipelines still require engine-specific treatment for large binaries, package/cook stages, and platform toolchains.

## Key Insight
The best addition is not another failure-triage skill. It is a reusable `game-ci-cd-pipeline` skill that sits one level upstream: helping teams design or audit Unity/Unreal build pipelines so repeated failures become preflight checks, artifact conventions, cache policy, and smoke-test structure. That makes it complementary to `game-build-log-triage` rather than duplicative.
