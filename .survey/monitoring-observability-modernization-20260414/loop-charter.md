# Loop Charter

## Goal
Improve `monitoring-observability` into a reusable, high-precision observability setup/review skill that works across service reliability, telemetry instrumentation, data/marketing pipelines, and game/live-ops telemetry without absorbing neighboring skills.

## Current Baseline
The current skill is a long generic stack tutorial with one Prometheus/Node.js example, weak boundaries, no references, and no evals. It is likely to over-trigger on any logging/performance/debugging request while under-serving dashboard review, alert design, and data-observability workflows.

## Mutable Artifact
Primary file: `.agent-skills/monitoring-observability/SKILL.md`

Supporting files allowed if the primary skill rewrite justifies them:
- `.agent-skills/monitoring-observability/references/*.md`
- `.agent-skills/monitoring-observability/evals/evals.json`
- discovery surfaces: `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `.agent-skills/skills.json`
- durable memory files: wiki + graph outputs if the run is accepted

## Fixed Evaluation Harness
- Agent Skills spec via `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Catalog sync check via `.agent-skills/skill-standardization/scripts/validate_catalog_sync.py`
- Dry-run prompts:
  1. "Set up observability for a new API before launch — what should we instrument and alert on?"
  2. "Our product dashboard is stale every Monday morning. We need freshness/schema/lineage checks."
  3. "Our Unity live event needs crash alerts and session visibility without turning this into a profiler-only task."
  4. "We already have logs; decide whether this is observability setup, log triage, or performance diagnosis."
- Pass criteria:
  - clearer trigger and route-out boundaries than baseline
  - at least 2 useful support references
  - evals present and JSON-valid
  - no catalog drift

## Constraints
- Keep the run bounded to one primary skill modernization.
- Prefer reusable decision flows over long vendor snippets.
- Do not create a new overlapping observability skill unless the rewrite clearly fails.
- Keep docs/setup updates proportional and truthful.

## Tried Already
- Keep: modernize legacy anchors rather than adding duplicates.
- Revert: broad wrapper additions that blur neighboring skills.
- Why: repo quality improves faster through sharper anchors + support bundles than through catalog growth.
