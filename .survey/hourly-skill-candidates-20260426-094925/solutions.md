# Solution Landscape: hourly-skill-candidate-sweep

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| guarinogabriel/Mac-CLI | cli open source skill | stars=9063, license=MIT | fit gate passed + freshness/signal checks | indexed snippet; direct page retrieval |
| AbdelhakRazi/flutter-bloc-clean-architecture-skill | agentic ai skill | stars=14, license=APACHE-2.0 | fit gate passed + freshness/signal checks | indexed snippet; direct page retrieval |
| VoDaiLocz/Enhance-Prompt | agentic ai skill | stars=10, license=MIT | fit gate passed + freshness/signal checks | indexed snippet; direct page retrieval |
| tjboudreaux/cc-plugin-unity-gamedev | game development skill | stars=3, license=MIT | fit gate passed + freshness/signal checks | indexed snippet; direct page retrieval |

## Categories
- Agentic skill ecosystems
- Frontend/backend workflow repositories
- CLI developer tooling
- Game development toolchain repositories

## What People Actually Use
Maintainers continue using GitHub-native discovery (`gh search repos`) as indexed snippet evidence and then gate by metadata/signals for recommendation-grade keeps. This combines broad recall with deterministic promotion controls.

## Frequency Ranking
1. agentic ai skill — 2 kept
2. cli open source skill — 1 kept
3. game development skill — 1 kept
4. web backend skill — 0 kept
5. web frontend skill — 0 kept

## Key Gaps
- web frontend skill: lane_status=degraded, causes=license:3, low-signal:3, stale:1
- web backend skill: lane_status=degraded, causes=no-results:1
- cli open source skill: lane_status=degraded, causes=unspecified

## Contradictions
- Broad discovery can include low-signal repos, while recommendation-grade policy excludes many of them; this is intentional and should remain explicit.

## Key Insight
Lane-level quality should be reported with both metrics and degraded cause taxonomy. For true empty-lane outcomes, explicit `no-results` cause avoids ambiguous degraded reports.
