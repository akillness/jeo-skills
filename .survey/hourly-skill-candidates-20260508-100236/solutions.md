# Solution Landscape: Hourly survey PR loop

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| agentic-ai-skill | GitHub lane sweep + recovery | deterministic lane coverage | noisy hits require quality gate | kept=6, raw=30 |
| web-frontend-skill | GitHub lane sweep + recovery | deterministic lane coverage | noisy hits require quality gate | kept=1, raw=5 |
| web-backend-skill | GitHub lane sweep + recovery | deterministic lane coverage | noisy hits require quality gate | kept=1, raw=1 |
| cli-open-source-skill | GitHub lane sweep + recovery | deterministic lane coverage | noisy hits require quality gate | kept=1, raw=1 |
| game-development-skill | GitHub lane sweep + recovery | deterministic lane coverage | noisy hits require quality gate | kept=8, raw=30 |

## Categories
- Survey discovery and evidence packaging
- Recommendation-quality gating
- PR blocker communication under missing checks

## What People Actually Use
Maintainers use GitHub-native search and API metadata to keep hourly runs deterministic when web search is degraded. Provenance labels retained as indexed snippet and direct page retrieval.

## Frequency Ranking
1. GitHub search lane sweep with stage recovery
2. Evidence validator contract check
3. PR checks gate and blocker comment when checks are missing

## Key Gaps
- Recommendation-grade lists lacked a dedicated reusable post-filter audit script.
- Missing explicit freshness/token-overlap audit output reduced reviewer confidence.

## Contradictions
- Broad discovery wants high recall, but recommendation lists need strict precision and risk controls.

## Key Insight
Keep broad raw evidence for auditability, but enforce recommendation-quality policy via reusable script before PR packaging.
