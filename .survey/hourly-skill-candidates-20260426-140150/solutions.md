## Solution List
- agentic ai skill: lane_status=pass, kept_count=6, raw_count=33
- web frontend skill: lane_status=degraded, kept_count=0, raw_count=4
- web backend skill: lane_status=degraded, kept_count=0, raw_count=0
- cli open source skill: lane_status=degraded, kept_count=1, raw_count=1
- game development skill: lane_status=pass, kept_count=1, raw_count=30

## Categories
- discovery-evidence (broad recall)
- recommendation-grade keeps (license + freshness + signal + fit)
- degraded-lane risk reporting

## What People Actually Use
- agentic ai skill: openakita/openakita (https://github.com/openakita/openakita) — stars=1671, license=apache-2.0, pushedAt=2026-04-25T17:18:39Z (direct page retrieval)
- web frontend skill: recommendation-grade keep 없음 (indexed snippet evidence retained)
- web backend skill: recommendation-grade keep 없음 (indexed snippet evidence retained)
- cli open source skill: guarinogabriel/Mac-CLI (https://github.com/guarinogabriel/Mac-CLI) — stars=9062, license=mit, pushedAt=2026-02-28T02:21:48Z (direct page retrieval)
- game development skill: tjboudreaux/cc-plugin-unity-gamedev (https://github.com/tjboudreaux/cc-plugin-unity-gamedev) — stars=3, license=mit, pushedAt=2026-02-06T04:09:12Z (direct page retrieval)

## Frequency Ranking
- guarinogabriel/Mac-CLI [cli open source skill] — stars=9062 — https://github.com/guarinogabriel/Mac-CLI
- openakita/openakita [agentic ai skill] — stars=1671 — https://github.com/openakita/openakita
- sangrokjung/claude-forge [agentic ai skill] — stars=662 — https://github.com/sangrokjung/claude-forge
- alirezarezvani/claude-code-aso-skill [agentic ai skill] — stars=315 — https://github.com/alirezarezvani/claude-code-aso-skill
- AbdelhakRazi/flutter-bloc-clean-architecture-skill [agentic ai skill] — stars=14 — https://github.com/AbdelhakRazi/flutter-bloc-clean-architecture-skill
- VoDaiLocz/Enhance-Prompt [agentic ai skill] — stars=10 — https://github.com/VoDaiLocz/Enhance-Prompt
- tjboudreaux/cc-plugin-unity-gamedev [game development skill] — stars=3 — https://github.com/tjboudreaux/cc-plugin-unity-gamedev

## Key Gaps
- web frontend skill: degraded_causes=license:3, low-signal:3, stale:1
- web backend skill: degraded_causes=no-results:1
- cli open source skill: degraded_causes=none

## Contradictions
- Broad recall can surface trendy but low-transfer repos; recommendation filter drops these as low-fit/low-signal.
- Some lanes may look active in raw hits but still fail recommendation thresholds after metadata gating.

## Key Insight
- recommended_lane_count=3, single_lane_concentration=false. Keep degraded evidence explicit instead of claiming broad coverage health.

Provenance: indexed snippet + direct page retrieval.