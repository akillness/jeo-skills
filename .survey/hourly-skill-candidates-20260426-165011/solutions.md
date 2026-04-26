# Hourly Survey hourly-skill-candidates-20260426-165011

## Solution List
- Improve survey recovery templates to use rolling 24-month pushed cutoff instead of fixed `2024-01-01`.

## Categories
- skill-hardening
- survey-reliability

## What People Actually Use
- agentic ai skill: AbdelhakRazi/flutter-bloc-clean-architecture-skill
- web frontend skill: (none)
- web backend skill: (none)
- cli open source skill: guarinogabriel/Mac-CLI
- game development skill: rohithnafeel/My-CS-Projects

## Frequency Ranking
1. Rolling freshness/date qualifier hardening (observed across all five keyword lanes)

## Key Gaps
- Recovery template uses fixed date qualifiers that age each quarter.

## Contradictions
- Freshness policy says 24 months rolling, but query templates pin to static date.

## Key Insight
- Encode freshness once as rolling cutoff and reuse across all fallback queries to keep behavior stable over time.

## Lane Metrics
- agentic ai skill: raw=20, kept=3, status=pass
- web frontend skill: raw=0, kept=0, status=degraded
- web backend skill: raw=0, kept=0, status=degraded
- cli open source skill: raw=1, kept=1, status=pass
- game development skill: raw=20, kept=4, status=pass

## Evidence Links
- https://cli.github.com/manual/gh_search_repos — GitHub CLI | Take GitHub to the command line (gh search repos qualifiers and --json field behavior)
- https://docs.github.com/en/search-github/searching-on-github/searching-for-repositories —  (repository search qualifiers including pushed and stars)
- https://docs.github.com/en/search-github/getting-started-with-searching-on-github/understanding-the-search-syntax —  (date qualifier syntax and operators)

## Provenance
- direct page retrieval
- indexed snippet
