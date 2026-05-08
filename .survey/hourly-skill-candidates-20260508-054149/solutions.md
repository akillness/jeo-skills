# Solution Landscape: hourly skill candidate discovery

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| sysdig/skills | lane-specific discovery + metadata gate | clear provenance and stars/age/license fields | can still be low-fit/noise by intent | direct candidate from GitHub search (agentic-ai-skill) |
| AbdelhakRazi/flutter-bloc-clean-architecture-skill | lane-specific discovery + metadata gate | clear provenance and stars/age/license fields | can still be low-fit/noise by intent | direct candidate from GitHub search (agentic-ai-skill) |
| iwe-org/skills | lane-specific discovery + metadata gate | clear provenance and stars/age/license fields | can still be low-fit/noise by intent | direct candidate from GitHub search (agentic-ai-skill) |
| VoDaiLocz/Enhance-Prompt | lane-specific discovery + metadata gate | clear provenance and stars/age/license fields | can still be low-fit/noise by intent | direct candidate from GitHub search (agentic-ai-skill) |
| rhysmcneill/agentic-ai-library | lane-specific discovery + metadata gate | clear provenance and stars/age/license fields | can still be low-fit/noise by intent | direct candidate from GitHub search (agentic-ai-skill) |
| laviDrori0702/tableau-dashboard-creator-skill | lane-specific discovery + metadata gate | clear provenance and stars/age/license fields | can still be low-fit/noise by intent | direct candidate from GitHub search (agentic-ai-skill) |
| amrrs/cinematic-webscroll-frontend-skill | lane-specific discovery + metadata gate | clear provenance and stars/age/license fields | can still be low-fit/noise by intent | direct candidate from GitHub search (web-frontend-skill) |
| nexu-io/open-design | lane-specific discovery + metadata gate | clear provenance and stars/age/license fields | can still be low-fit/noise by intent | direct candidate from GitHub search (cli-open-source-skill) |

## Categories
- Discovery quality controls
- Recommendation gating
- PR-loop resilience under missing checks

## What People Actually Use
Maintainers currently rely on `gh search repos` + artifact validator + PR blocker comments. Provenance is mostly indexed snippet/feed recovery in unattended runs.

## Frequency Ranking
1. GitHub search lane sweep with metadata gates
2. Artifact validation (`--platform-topic --require-provenance`)
3. Blocker comment and merge deferral when checks are absent

## Key Gaps
- Reusable script-level lane health summary was missing for compact reporting.
- Existing open PR had no check signal, preventing merge closure.

## Contradictions
- Need continuous development contributions vs. no-merge policy without CI checks.

## Key Insight
A reusable lane-health markdown generator converts evidence JSON into deterministic reviewer-facing summaries, improving development value even during checks-degraded periods.

Provenance: indexed snippet, feed recovery
