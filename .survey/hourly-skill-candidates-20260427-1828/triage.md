# Triage
- Problem: Hourly repo-maintenance survey runs can silently return empty payloads from `gh search repos` (exit 0, stdout `[]`) even when GitHub Search API has results, causing false degraded lanes and weak recommendations. provenance: direct page retrieval
- Audience: Maintainers reviewing automated skill-improvement PRs in `akillness/oh-my-skills`. provenance: direct page retrieval
- Why now: This run reproduced empty `gh search repos` output while fallback `gh api search/repositories` recovered lane evidence; codifying a deterministic fallback is low-risk and merge-critical. provenance: direct page retrieval
