# Solution Landscape: game-ci-cd-pipeline structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Unity Build Automation docs | Official troubleshooting + build-service guidance | Clear failure categories; acknowledges clean-build/cache issues and platform-specific failures | Does not provide repo-level routing guidance or downstream handoff structure | Strong primary-source evidence for failure classes |
| Unity Scriptable Build Pipeline cache docs | Official cache/incremental artifact model | Explicit about shared cache reuse across machines | Cache details alone do not tell teams what to cache or when to invalidate in CI | Useful for cache-policy framing |
| Unreal packaging docs | Official packaging-stage framing | Reinforces packaging as a distinct stage with its own prerequisites | Does not solve pipeline topology or artifact lifecycle by itself | Useful for stage-boundary guidance |
| Unreal logging docs | Official evidence/logging surface | Supports log/artifact visibility expectations | Logging guidance alone can drift into log-triage instead of pipeline design | Good route-out anchor to `game-build-log-triage` |
| Semaphore game CI/CD guide | Game-specific CI/CD operations article | Names large binaries, long builds, environment sensitivity, caching, and artifacts as core problems | Broad article; still needs a bounded agent-facing router | Good cross-engine summary layer |
| Simon Hesjevik Unity pipeline article | Practical GitHub Actions example | Concrete Unity/GitHub Actions patterns, cache + artifact examples | Narrower than the repo skill; not a reusable routing front door alone | Useful for packet/examples language |
| Community threads (Reddit / Unity Discussions / Unreal forums) | Practitioner workflow evidence | Shows teams still struggle with stack choice, cache bloat, and pipeline acceleration | Indexed snippets are partial evidence, not full verification | Best used as actual-behavior corroboration |

## Categories
- **Official engine/platform guidance**: Unity Build Automation docs, Unity cache docs, Unreal packaging/logging docs
- **CI/CD design guides**: Semaphore article, Unity pipeline blog/tutorial content
- **Actual-behavior / pain evidence**: Reddit, Unity Discussions, Unreal forum snippets

## What People Actually Use
People mix engine-specific docs, GitHub Actions/GameCI-style examples, and ad hoc forum advice. In practice they often keep one oversized workflow, fight cache drift manually, and ask for help only after packaging or release friction becomes visible. The workflow is still multi-tool and partially manual even when vendors market CI/CD as a solved automation layer.

## Frequency Ranking
1. Official Unity/Unreal docs for failure classes and packaging/logging primitives
2. Practical GitHub Actions / tutorial examples for Unity implementation details
3. Community threads about cache bloat, stack choice, and pipeline speed
4. Broad CI/CD articles explaining large-binary and environment-sensitivity pain

## Key Gaps
- The market has plenty of docs, but little routing-first guidance that separates **one red build log** from **pipeline architecture work**.
- Cache documentation exists, but teams still need a reusable way to choose between cache-policy design, stage splitting, artifact hygiene, and preflight checks.
- Official docs do not convert mixed game-production context into one compact next artifact for an agent workflow.

## Contradictions
- Vendor and tutorial material implies pipeline automation should reduce toil, but community snippets still show teams choosing stacks manually, deleting caches, and asking how to speed pipelines structurally.
- Logging and packaging docs are explicit, yet many real workflows still collapse compile/cook/package/release into one hard-to-debug job blob.

## Key Insight
The durable gap is not missing information about Unity or Unreal CI/CD primitives; it is missing **routing discipline**. `game-ci-cd-pipeline` is most valuable when it acts as a front door that classifies the dominant structural blocker, chooses one packet shape, and routes one-off log failures out to `game-build-log-triage` instead of trying to be both a failure debugger and a full release-engineering encyclopedia.
