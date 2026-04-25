# Triage
- Problem: Hourly survey discovery produces lane-quality drift and sparse/noisy hits; recommendation-grade filtering must stay deterministic.
- Audience: Maintainers of akillness/oh-my-skills running unattended hourly PR loops.
- Why now: This run (hourly-skill-candidates-20260425-075308) shows mixed lane quality and repeated degraded backend coverage, requiring a small rule hardening.

## Evidence Snapshot
- Run slug: `hourly-skill-candidates-20260425-075308`
- Evidence file: `.survey/hourly-skill-candidates-20260425-075308/evidence.json`
- Provenance: direct page retrieval (GitHub search API)
- Lane status: pass=2 / degraded=3
