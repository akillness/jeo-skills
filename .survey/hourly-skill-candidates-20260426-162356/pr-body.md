## Summary
This hourly run completed the required five-keyword survey sweep and produced a low-risk hardening change for the `survey` skill.

### What changed
- Updated `.agent-skills/survey/SKILL.md` to codify GH CLI JSON-field compatibility fallback in unattended loops:
  - prefer `gh search repos --json fullName,...`
  - fallback to `owner + name` composition
  - persist stderr and rerun before final lane status
- Updated `.agent-skills/survey/SKILL.toon` with the same compatibility guidance.
- Updated `.agent-skills/survey/references/keyword-sweep-and-relevance-rescue.md` recovery flow with explicit field-compatibility step.
- Added run artifacts:
  - successful run: `.survey/hourly-skill-candidates-20260426-162356/*`
  - failed first-pass run (schema mismatch evidence): `.survey/hourly-skill-candidates-20260426-162245/*`
- Added Graphify memory and fallback graph artifact for this run.
- Added/updated LLM-Wiki entries for iterative evolution.

## Evidence (survey-based, required keyword families)
Run slug: `hourly-skill-candidates-20260426-162356`

- `agentic ai skill` → degraded
- `web frontend skill` → degraded
- `web backend skill` → degraded
- `cli open source skill` → degraded
- `game development skill` → pass

Artifacts:
- `.survey/hourly-skill-candidates-20260426-162356/evidence.json`
- `.survey/hourly-skill-candidates-20260426-162356/rtk-summary.md`
- `.survey/hourly-skill-candidates-20260426-162356/graphify-refined.json`
- `.survey/hourly-skill-candidates-20260426-162356/graphify-query.err`

Failure/recovery proof:
- First attempt failed because `gh search repos --json nameWithOwner` is unsupported on current gh CLI:
  - `.survey/hourly-skill-candidates-20260426-162245/evidence.json`
- Recovery used `fullName` and restored lane evidence.

## Risk
- Scope is documentation/reference hardening only.
- No destructive code-path changes.
- Quality gates (license/freshness/signal/fit) remain unchanged.

## Validation
- `python3 .agent-skills/survey/scripts/validate_survey_artifacts.py .survey/hourly-skill-candidates-20260426-162245 --require-provenance` ✅
- `python3 .agent-skills/survey/scripts/validate_survey_artifacts.py .survey/hourly-skill-candidates-20260426-162356 --require-provenance` ✅
- `python3 -m json.tool .survey/hourly-skill-candidates-20260426-162356/graphify-refined.json` ✅

## Rollback plan
If this guidance proves incorrect/noisy:
1. Revert commit `4943989`.
2. Re-run hourly survey loop on `main` and compare lane status drift.
3. Restore previous survey docs while keeping run artifacts for audit trail.
