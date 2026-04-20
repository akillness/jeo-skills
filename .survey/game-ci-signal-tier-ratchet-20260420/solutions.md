# Solution Landscape: game-ci-signal-tier-ratchet

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| GameCI + GitHub Actions | Separate test/build/deploy jobs with optional orchestrator for heavier cloud execution | Clear lightweight-vs-heavy workflow split, familiar GitHub surface, strong community examples | License/activation friction, cache issues, and self-hosted runner state still leak into workflow design | Best direct fit for `game-ci-cd-pipeline` evidence |
| Unity Build Automation | Managed build targets with auto-build, auto-cancel, scheduled builds, and grouped configurations | Officially models commit-triggered vs scheduled work, good for nightly/package-candidate separation | Managed/plan-limited surface, less explicit about certification/release promotion rules | Strong evidence for branch-gate vs nightly distinction |
| Unreal BuildGraph + Horde | Custom graph-based automation with build-farm execution | Powerful for package/release lanes and large projects, explicit graph separation possible | Higher complexity; lane semantics are user-authored, not prescribed | Good evidence that release/candidate lanes deserve explicit modeling |
| GitHub Actions environments + artifacts | Generic CI/CD substrate with reusable workflows, protected environments, and artifact passing | Strong for approvals, branch restrictions, promotion gates, and retention rules | Not game-specific; teams must assemble engine/toolchain specifics themselves | Useful support layer for release/certification lane wording |
| TeamCity build chains | Snapshot-dependent test → integration → release chain | Explicit promotion chain with same-revision guarantee | Generic CI platform, requires game-specific adaptation | Strong lane-separation evidence |
| Jenkins Pipeline | Custom staged pipelines and branch handling | Flexible, familiar to many studios | Highly DIY, weak default guidance on promotion-lane truth | Common in practice but not the best contract model |

## Categories
- **Game-specific CI wrappers:** GameCI, Unity Build Automation
- **Engine-native graph/build-farm systems:** Unreal BuildGraph, Horde
- **Generic promotion and approval backbones:** GitHub Actions environments/artifacts, TeamCity, Jenkins

## What People Actually Use
Teams commonly use fast commit/PR CI for compile/tests, then push packaging and signed candidate work into scheduled/manual lanes. Self-hosted runners, persistent caches, and manual artifact promotion remain common because platform modules, licenses, and packaging runtimes make one-size-fits-all workflows brittle. In practice, teams already behave as if branch-gate, nightly candidate, and release candidate are different lanes even when their docs do not name those tiers clearly.

## Frequency Ranking
1. Fast validation lane before heavy package/release lane
2. Scheduled/nightly candidate builds distinct from merge-time CI
3. Protected or approval-gated release lane with stricter artifact rules
4. Escape hatches for heavy packaging on self-hosted or specialized infrastructure

## Key Gaps
- Many solutions separate jobs and triggers but do not teach teams to classify the *signal tier* up front.
- Tool docs explain build mechanics, but not when a request should be treated as merge-gate CI vs nightly QA candidate vs release/certification candidate.
- Manual naming and promotion still hide the real lane boundaries.

## Contradictions
- Vendor docs imply structured lanes are available, but practitioners still rely on self-hosted runners, manual promotion, cache deletion, and nightly hacks because packaging/signing/certification work is too heavy for ordinary branch CI.
- Teams say they have "CI/CD" when what they really have is branch validation plus a partially manual packaging/release lane.

## Key Insight
The strongest bounded improvement is not another game DevOps skill. It is making `game-ci-cd-pipeline` classify one signal tier first — `branch-gate`, `nightly-package-candidate`, or `release-certification` — before packet routing. That preserves the current packet-first model while making artifact policy, approvals, platform preflight, and CI trust more truthful.
