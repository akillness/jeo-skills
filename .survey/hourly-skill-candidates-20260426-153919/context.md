## Workflow Context
This maintenance run followed survey-first discovery across five required keyword families with provenance tagging (direct page retrieval). Evidence was collected via GitHub repository search and normalized into lane metrics.

## Affected Users
- Skill maintainers depending on hourly candidate refresh quality.
- Contributors who need PR-ready evidence bundles.

## Current Workarounds
- Seed recovery query when raw result count is zero.
- Signal-floor gating (stars >= 3) to reduce noisy promotions.
- Explicit degraded_cause taxonomy in evidence artifacts.

## Adjacent Problems
- Keyword literal matching can under-represent mature CLI ecosystems.
- Lane health can look superficially healthy unless degraded causes are explicit.

## User Voices
- direct page retrieval: observed `cli open source skill` returned 0 raw hits with base query.
- direct page retrieval: observed `web frontend skill` had 4 raw hits but none passed license/signal floor.
