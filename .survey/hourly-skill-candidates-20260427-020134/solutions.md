# Solution Landscape: oh-my-skills hourly survey

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| AbdelhakRazi/flutter-bloc-clean-architecture-skill | recommendation candidate (agentic ai skill) | active + licensed + signal | workflow transferability should be monitored | indexed snippet |
| iwe-org/skills | recommendation candidate (agentic ai skill) | active + licensed + signal | generic naming can lower fit confidence | indexed snippet |
| guarinogabriel/Mac-CLI | recommendation candidate (cli open source skill) | active + licensed + signal | platform-specific transferability limits | indexed snippet |
| tjboudreaux/cc-plugin-unity-gamedev | recommendation candidate (game development skill) | active + licensed + signal | niche lane scope | indexed snippet |
| microsoft/vscode | recommendation candidate (agentic ai skill) | active + licensed + signal | broad repo needs explicit fit rationale | indexed snippet |

## Categories
- Empty-lane taxonomy guardrails: enforce explicit `no-results` when post-recovery `raw_count==0`.
- Coverage reporting guardrails: always report raw and deduplicated recommendation coverage metrics.
- Stability guardrails: keep provenance labels and recovery-query evidence for reviewer traceability.

## What People Actually Use
- Broad discovery evidence is preserved lane-by-lane from GitHub search listings (indexed snippet).
- Recommendation-grade keeps rely on license/freshness/signal/fit gates, with fallback metadata checks via direct page retrieval.

## Frequency Ranking
1. agentic ai skill (kept=3, raw=30)
2. cli open source skill (kept=1, raw=1)
3. game development skill (kept=1, raw=30)
4. web frontend skill (kept=0, raw=4)
5. web backend skill (kept=0, raw=0)

## Key Gaps
- `no-results` was not guaranteed in degraded-cause taxonomy for lanes that stay empty after documented recovery.
- Recommendation summaries did not mandate reporting both raw and deduplicated coverage metrics.
- Reviewer triage quality drops when empty-lane outcomes are described only narratively instead of structured taxonomy values.

## Contradictions
- Broad recall favors permissive lane discovery, but reviewer-ready recommendation summaries require strict, deterministic degraded-cause semantics.
- A run can have zero cross-lane duplicates today, yet still needs dedup metric reporting to prevent future inflation errors.

## Key Insight
This run had backend `raw_count=0` and `kept_count=0` after recovery, while cross-lane duplicate counts stayed at zero; the durable ratchet is explicit `no-results` taxonomy plus mandatory raw-vs-dedup coverage reporting for every run.
