## Solution List
1. Preserve strict 5-lane sweep while adding lane-specific recovery variants when a lane is degraded.
2. Keep signal-floor promotion gate and force explicit exception rationale for low-signal picks.
3. Surface lane-health metrics in markdown and PR body for reviewer triage.

## Categories
- Discovery robustness
- Evidence quality
- Reviewer ergonomics

## What People Actually Use
- agentic ai skill: AbdelhakRazi/flutter-bloc-clean-architecture-skill (14★) — https://github.com/AbdelhakRazi/flutter-bloc-clean-architecture-skill (direct page retrieval)
- web backend skill: andreasbm/web-skills (7521★) — https://github.com/andreasbm/web-skills (direct page retrieval)
- game development skill: SMDS-Studio/Building-a-New-creative-Pong- (14★) — https://github.com/SMDS-Studio/Building-a-New-creative-Pong- (direct page retrieval)

## Frequency Ranking
- game development skill: kept=3, raw=30, status=pass, degraded_causes=- (direct page retrieval)
- agentic ai skill: kept=3, raw=30, status=pass, degraded_causes=- (direct page retrieval)
- web backend skill: kept=1, raw=1, status=pass, degraded_causes=- (direct page retrieval)
- web frontend skill: kept=0, raw=4, status=degraded, degraded_causes=license,low-signal (direct page retrieval)
- cli open source skill: kept=0, raw=0, status=degraded, degraded_causes=no-results (direct page retrieval)

## Key Gaps
- CLI lane had `no-results` under base query and needs broader query variants.
- Frontend lane had low-signal / missing-license hits under current phrase.

## Contradictions
- Broad query recall can increase noise; signal-floor gate counterbalances this.

## Key Insight
Survey quality improves when degraded lanes trigger deterministic fallback variants and explicit degraded cause reporting (direct page retrieval).
