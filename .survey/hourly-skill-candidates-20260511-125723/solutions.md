## Solution List
1. Enforce hourly evidence key contract with strict lane keys and mandatory stage-1/stage-2 recovery query entries.
2. Keep recommendation dedupe counts and lane concentration metrics in evidence artifacts.
3. Continue carry-forward updates on existing open PR when checks are not reported.

## Categories
- Validator hardening
- Survey evidence quality
- Open-PR operational resilience

## What People Actually Use
GitHub search API data via gh CLI with provenance labels.

## Frequency Ranking
1) Evidence contract drift
2) Missing checks on open PR
3) Noisy low-fit repos in broad search

## Key Gaps
No in-repo validator for hourly lane-key contract.

## Contradictions
Need broad recall discovery while preserving recommendation precision.

## Key Insight
A small reusable validator script creates functional value every hour by preventing invalid evidence schema from merging.

Provenance: direct page retrieval, indexed snippet.
