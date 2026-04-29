## Solution List
- Improve survey taxonomy/reporting to explicitly encode no-result degraded state (`raw_count==0`) so remediation is deterministic in unattended runs.
- Keep current recovery logic unchanged; add reporting precision only (low-risk documentation/contract hardening). (indexed snippet)

## Categories
- Existing skill improvements: `survey` (documentation/contract hardening)
- Candidate sources: GitHub keyword sweep repositories (hourly five-lane policy). (indexed snippet)

## What People Actually Use
- guarinogabriel/Mac-CLI (cli open source skill) — stars=9062, license=mit, pushed_at=2026-02-28T02:21:48Z (direct page retrieval)
- AbdelhakRazi/flutter-bloc-clean-architecture-skill (agentic ai skill) — stars=14, license=apache-2.0, pushed_at=2026-01-29T09:33:47Z (direct page retrieval)
- VoDaiLocz/Enhance-Prompt (agentic ai skill) — stars=10, license=mit, pushed_at=2026-03-05T13:50:53Z (direct page retrieval)
- iwe-org/skills (agentic ai skill) — stars=7, license=mit, pushed_at=2026-04-06T01:48:47Z (direct page retrieval)
- tjboudreaux/cc-plugin-unity-gamedev (game development skill) — stars=3, license=mit, pushed_at=2026-02-06T04:09:12Z (direct page retrieval)

## Frequency Ranking
- agentic ai skill: kept=5, raw=28 (indexed snippet)
- web frontend skill: kept=0, raw=4 (indexed snippet)
- web backend skill: kept=0, raw=0 (indexed snippet)
- cli open source skill: kept=1, raw=1 (indexed snippet)
- game development skill: kept=1, raw=25 (indexed snippet)

## Key Gaps
- web frontend skill: degraded_causes={'license': 3, 'low-signal': 3, 'stale': 1} (indexed snippet)
- web backend skill: degraded_causes={} (indexed snippet)
- Specific gap: `degraded lane taxonomy misses explicit no-results state when raw_count==0 after recovery, reducing reviewer actionability.` (indexed snippet)

## Contradictions
- Lane metrics can show degradation while degraded-causes remain empty, creating an interpretation mismatch for reviewers. (indexed snippet)

## Key Insight
Adding a `no-results` degraded cause keeps reports machine-actionable without changing candidate filtering behavior. (indexed snippet)
