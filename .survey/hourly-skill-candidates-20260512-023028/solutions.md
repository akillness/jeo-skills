# Solutions
## Solution List
- Add reusable validator `validate_hourly_evidence_contract.py` to enforce lane keys and recovery stage coverage.
- Generate complete hourly artifact bundle for this slug with deterministic headings and provenance labels.
- Keep recommendations deduplicated and report lane concentration.
## Categories
- Validation hardening
- Evidence quality
- Open-PR blocker operations
## What People Actually Use
- gh search repos indexed snippet discovery
- strict markdown heading contracts for validator compatibility
## Frequency Ranking
1. Evidence generation every run
2. Validator execution every run
3. Blocker comment update when checks missing
## Key Gaps
- No in-repo contract validator for hourly evidence key schema existed.
## Contradictions
- Need fast cadence but cannot merge without checks; carry-forward resolves cadence without duplicate PRs.
## Key Insight
- Deterministic contracts + carry-forward branch policy preserve momentum under CI absence.
