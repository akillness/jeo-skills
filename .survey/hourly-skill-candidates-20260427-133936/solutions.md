# Solution Landscape: oh-my-skills hourly survey quality hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| agentic-ai-skill | Keep recommendation-grade matches with metadata + freshness + signal floor | Deterministic lane health metrics already present | Negated intent phrases can still bypass overlap checks | github/awesome-copilot (https://github.com/github/awesome-copilot) stars=31346; provenance: indexed snippet |
| web-frontend-skill | Keep recommendation-grade matches with metadata + freshness + signal floor | Deterministic lane health metrics already present | Negated intent phrases can still bypass overlap checks | zarazhangrui/frontend-slides (https://github.com/zarazhangrui/frontend-slides) stars=15812; provenance: indexed snippet |
| web-backend-skill | Keep recommendation-grade matches with metadata + freshness + signal floor | Deterministic lane health metrics already present | Negated intent phrases can still bypass overlap checks | CodeByRachit/skillswap-platform (https://github.com/CodeByRachit/skillswap-platform) stars=9; provenance: indexed snippet |
| cli-open-source-skill | Keep recommendation-grade matches with metadata + freshness + signal floor | Deterministic lane health metrics already present | Negated intent phrases can still bypass overlap checks | jeremylongshore/claude-code-plugins-plus-skills (https://github.com/jeremylongshore/claude-code-plugins-plus-skills) stars=2041; provenance: indexed snippet |
| game-development-skill | Keep recommendation-grade matches with metadata + freshness + signal floor | Deterministic lane health metrics already present | Negated intent phrases can still bypass overlap checks | Heigvd/Wegas (https://github.com/Heigvd/Wegas) stars=30; provenance: indexed snippet |
| survey-skill-hardening (proposed) | Add explicit negation guard for lane-intent overlap (e.g., "no cli", "without cli", "not a cli") | Low-risk rule-level improvement; directly addresses observed false-positive mode | Needs careful wording to avoid over-filtering edge cases | Apply to recommendation-grade promotion only; keep raw discovery evidence (provenance: indexed snippet) |

## Categories
- Structural gate hardening (rule updates)
- Evidence contract fidelity (unchanged)
- Reviewer ergonomics (clearer promotion rationale)

## What People Actually Use
Maintainers currently rely on lane metrics and manual repo-description reading to catch semantic mismatches in promoted candidates. (provenance: indexed snippet)

## Frequency Ranking
1. Metadata/freshness/signal checks
2. Lane-intent token overlap
3. Manual semantic sanity pass for contradictory wording (e.g., "No CLI")

## Key Gaps
- Token-overlap gate lacks a negation-aware clause.
- Recommendation text can include repos that mention the lane token only to deny that capability.

## Contradictions
- `dp-archive/archive` includes token `cli` but description says "No CLI", contradicting lane intent despite lexical overlap. (source: https://github.com/dp-archive/archive, provenance: indexed snippet)

## Key Insight
The fastest safe improvement is to keep broad discovery evidence intact while adding a negation-aware promotion guard to the survey skill contract.
