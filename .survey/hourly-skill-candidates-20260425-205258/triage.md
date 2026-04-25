# Triage
- Problem: Hourly survey runs still produce degraded lanes, and backend can end with raw_count=0 after stage-2 recovery which is easy to under-report without a dedicated no-results cause.
- Audience: Maintainers of akillness/oh-my-skills operating unattended PR-based hourly maintenance loops.
- Why now: Current run (hourly-skill-candidates-20260425-205258) shows backend lane with raw_count=0 and confirms need for deterministic no-results reporting in lane degraded causes.

## Evidence Contract
- Provenance labels used: direct page retrieval, indexed snippet, thin evidence.
- Primary retrieval mode in this run: direct page retrieval (GitHub search API).
