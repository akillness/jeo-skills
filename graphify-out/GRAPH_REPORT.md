# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 63
- Skills with evals/: 62
- Skills with scripts/: 23
- Graph nodes: 240
- Graph edges: 606

## Strongest structural findings
1. `monitoring-observability` is now a stronger infrastructure anchor because it selects between service reliability, telemetry foundation, data/pipeline observability, game live-ops visibility, and review/audit work instead of defaulting to a generic Prometheus/logging example dump.
2. The infrastructure/code-quality boundary is cleaner when observability setup routes log forensics to `log-analysis`, code-level fixing to `debugging`, bottleneck work to `performance-optimization`, and engine-only profiling to `game-performance-profiler`.
3. Discovery docs (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree nodes, so repositioning an existing anchor still requires top-level wording changes.
4. Support coverage improved again without adding a new overlapping infrastructure skill: the better move was upgrading the legacy observability anchor and adding reusable references/evals.
5. The repo still benefits more from modernizing weak anchors with support bundles than from growing another broad wrapper in an already-covered area.

## Highest-degree nodes
- README.md: degree 88
- README.ko.md: degree 88
- setup-all-skills-prompt.md: degree 88
- debugging: degree 20
- code-review: degree 19
- performance-optimization: degree 19
- api-documentation: degree 17
- task-planning: degree 17
- testing-strategies: degree 17
- monitoring-observability: degree 16

## Duplicate / consolidation notes
- `monitoring-observability` should stay the general telemetry design/review anchor rather than splitting into another dashboard-only, alerting-only, or APM-vendor wrapper.
- `log-analysis` remains the better home for root-cause log triage once evidence already exists.
- `performance-optimization` remains the better home for measurement-led tuning after observability identifies the bottleneck.
- `langsmith` remains the better home for LLM-specific tracing/evaluation rather than general system observability.
- `game-performance-profiler` remains the better home for Unity/Unreal frame-time capture interpretation.

## Recommended maintenance direction
- Keep upgrading high-visibility legacy anchors with support bundles before adding overlapping infrastructure or observability-adjacent wrappers.
- Re-check route-outs whenever `monitoring-observability`, `performance-optimization`, `log-analysis`, `langsmith`, or `game-performance-profiler` changes materially.
- Keep discovery surfaces synchronized when an existing skill is repositioned, not only when a new skill is added.
