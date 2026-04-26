# 2026-04-26 hourly survey license-fallback ratchet

## Query
What low-risk hardening should be merged after this hourly five-lane survey run to improve recommendation-grade quality without weakening gates?

## Inputs
- `.survey/hourly-skill-candidates-20260426-150902/evidence.json`
- `.survey/hourly-skill-candidates-20260426-150902/rtk-summary.md`
- `.survey/hourly-skill-candidates-20260426-150902/graphify-refined.json`
- Prior hardening notes: `2026-04-25-hourly-survey-signal-floor-codification.md`, `2026-04-25-hourly-survey-stage2-backend-recovery.md`

## Distilled findings
- All five lanes degraded in this run, primarily due to `license` being null in first-pass metadata retrieval.
- The degradation is partly retrieval-induced rather than true candidate absence.
- Spot check confirms mismatch: GraphQL `licenseInfo` null while REST `license.spdx_id` returns concrete SPDX (`MIT`) for at least one high-traction repo.

## Decision
- Add deterministic license metadata fallback in survey guidance:
  - First pass: `gh repo view --json licenseInfo`
  - Fallback: `gh api repos/<owner>/<repo> --jq .license.spdx_id` when first pass is null/unknown
- Keep existing freshness/signal/fit gates unchanged.

## Why low-risk
- No destructive behavior; only metadata retrieval hardening.
- Retains strict recommendation thresholds while reducing false negative license degradations.

## Provenance
- indexed snippet
- direct page retrieval
