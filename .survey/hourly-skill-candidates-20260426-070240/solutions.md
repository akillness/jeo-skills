## Solution List
- Strengthen survey skill guidance with a lane-health diagnostic table that standardizes interpretation for `pass`, `degraded-noisy`, and `degraded-no-results` states.
- Keep broad discovery evidence, but continue recommendation-grade filtering (license + freshness + non-archived + fit + signal floor).
- Add evaluator coverage that asserts markdown reports include lane-level degraded diagnosis and action guidance.

## Categories
- Process hardening
- Reviewer ergonomics
- Cron reliability

## What People Actually Use
- GitHub-native repository discovery (`gh search repos`) with recovery queries and direct page retrieval provenance.
- Existing strict validator (`--platform-topic --require-provenance`) plus markdown artifacts for PR review context.

## Frequency Ranking
1. Metadata/freshness/signal filtering in evidence generation
2. Degraded-cause interpretation during review
3. Lane-specific recovery tuning

## Key Gaps
- Survey guidance does not yet provide a concise canonical lane-health interpretation block that reviewers can reuse directly.

## Contradictions
- Discovery needs recall (broad evidence), while merge readiness demands precision (strict keeps). Both must be represented simultaneously without ambiguity.

## Key Insight
- A small docs+eval hardening that standardizes lane-health interpretation reduces reviewer ambiguity without changing discovery breadth or introducing destructive behavior.

## Provenance
- direct page retrieval (GitHub search API)
- indexed snippet (fallback label retained for validator contract)
- thin evidence (fallback label retained for validator contract)
