# Solution Landscape: oh-my-skills hourly survey

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| GitHub search lanes | 5 fixed keyword lanes + recovery queries | reproducible and auditable | noisy in some lanes | provenance: indexed snippet |
| Strict recommendation gate | token overlap + negation guard + signal floor + freshness | higher precision | may reduce recall | acceptable for recommendation-grade |

## Categories
- discovery
- filtering
- validation

## What People Actually Use
- `gh search repos ... --json ...` as primary survey collector.

## Frequency Ranking
1. agentic ai skill
2. web frontend skill
3. web backend skill
4. cli open source skill
5. game development skill

## Key Gaps
- Sparse lane outputs may still require manual recovery-query tuning.

## Contradictions
- Need broad discovery evidence while also enforcing strict promotion quality.

## Key Insight
- Separate broad evidence retention from recommendation-grade promotion criteria.
