# 2026-04-26 hourly survey gh-field-compatibility ratchet

## Query
What low-risk hardening should be merged after this hourly five-lane survey run to reduce false degraded lanes caused by tooling/schema drift?

## Inputs
- `.survey/hourly-skill-candidates-20260426-162356/evidence.json`
- `.survey/hourly-skill-candidates-20260426-162356/rtk-summary.md`
- `.survey/hourly-skill-candidates-20260426-162356/graphify-refined.json`
- `.survey/hourly-skill-candidates-20260426-162245/evidence.json` (failed attempt showing unsupported GH field)
- Prior hardening notes: `2026-04-26-hourly-survey-license-fallback-ratchet.md`, `2026-04-25-hourly-survey-recovery-template.md`

## Distilled findings
- The first pass failed retrieval entirely because `gh search repos --json nameWithOwner` is invalid on current gh CLI.
- Switching to supported fields (`fullName` or `owner` + `name`) restored lane evidence and re-enabled the gate pipeline.
- This failure mode presents as lane degradation unless command-compatibility guidance is explicit.

## Decision
- Add deterministic GH JSON field compatibility guidance in survey references:
  - Prefer `fullName` for `gh search repos --json` output.
  - If absent, compose repo identity from `owner` + `name`.
  - Preserve original stderr and mark provenance/risk when retrieval schema mismatch occurs.

## Why low-risk
- Documentation/reference-only hardening; no destructive behavioral change.
- Improves retrieval reliability while keeping strict quality gates unchanged.

## Provenance
- indexed snippet
- direct page retrieval
- thin evidence
