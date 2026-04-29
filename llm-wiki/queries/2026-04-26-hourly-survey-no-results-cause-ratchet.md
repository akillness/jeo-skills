# 2026-04-26 hourly survey no-results degraded-cause ratchet

## Query
What low-risk hardening should be merged from this hourly five-lane survey run to make degraded lane reporting deterministic?

## Inputs
- `.survey/hourly-skill-candidates-20260426-094925/evidence.json`
- `.survey/hourly-skill-candidates-20260426-094925/rtk-summary.md`
- `.survey/hourly-skill-candidates-20260426-094925/graphify-refined.json`
- Existing guidance: `.agent-skills/survey/SKILL.md`, `.agent-skills/survey/references/keyword-sweep-and-relevance-rescue.md`

## Distilled findings
- agentic ai skill: status=pass, raw=20, kept=2, causes=license:12, low-fit:5, low-signal:17
- web frontend skill: status=degraded, raw=4, kept=0, causes=license:3, low-signal:3, stale:1
- web backend skill: status=degraded, raw=0, kept=0, causes=no-results:1
- cli open source skill: status=degraded, raw=1, kept=1, causes=none
- game development skill: status=pass, raw=20, kept=1, causes=archived:1, license:12, low-signal:13, stale:9
- `web backend skill` lane ended with `raw_count=0`, so degraded reporting needs an explicit `no-results` cause to avoid ambiguous failures.

## Decision
- Extend degraded-cause taxonomy with `no-results` in hourly survey guidance and reporting checklist.
- Require explicit `no-results` when a lane remains `raw_count == 0` after documented recovery.

## Why low-risk
- Documentation-only hardening (no destructive runtime behavior change).
- Aligns written policy with observed lane outcome and existing validator workflow.

## Provenance
- indexed snippet
- direct page retrieval
- thin evidence
