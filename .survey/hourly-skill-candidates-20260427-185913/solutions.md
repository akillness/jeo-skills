# Solutions

## Solution List
- agentic ai skill: [AbdelhakRazi/flutter-bloc-clean-architecture-skill](https://github.com/AbdelhakRazi/flutter-bloc-clean-architecture-skill) | stars=14 | license=Apache-2.0 | pushed_at=2026-01-29T09:33:47Z | open_issues=0 | forks=2 | provenance: direct page retrieval
- agentic ai skill: [iwe-org/skills](https://github.com/iwe-org/skills) | stars=7 | license=MIT | pushed_at=2026-04-06T01:48:47Z | open_issues=0 | forks=1 | provenance: direct page retrieval
- web backend skill: [Borodutch/backend-starter](https://github.com/Borodutch/backend-starter) | stars=127 | license=MIT | pushed_at=2026-02-12T18:58:30Z | open_issues=9 | forks=104 | provenance: direct page retrieval
- cli open source skill: [Siilwyn/awesome-cli-tools](https://github.com/Siilwyn/awesome-cli-tools) | stars=4 | license=CC0-1.0 | pushed_at=2026-04-05T16:13:57Z | open_issues=11 | forks=2 | provenance: direct page retrieval
- game development skill: [tjboudreaux/cc-plugin-unity-gamedev](https://github.com/tjboudreaux/cc-plugin-unity-gamedev) | stars=3 | license=MIT | pushed_at=2026-02-06T04:09:12Z | open_issues=0 | forks=1 | provenance: direct page retrieval

## Categories
- Candidate-quality hardening (repo-maintenance survey)
- Evidence contract hardening (metadata completeness)

## What People Actually Use
- direct page retrieval via `gh api repos/<owner>/<repo>` to capture canonical metadata fields.
- indexed snippet via `gh search repos` for discovery, followed by metadata hydration.

## Frequency Ranking
- agentic ai skill: kept=3, raw=20, lane_status=pass, degraded_causes={'low-signal': 17, 'license': 12}
- web frontend skill: kept=0, raw=7, lane_status=degraded, degraded_causes={'license': 5, 'stale': 4, 'low-signal': 5}
- web backend skill: kept=1, raw=1, lane_status=pass, degraded_causes={}
- cli open source skill: kept=1, raw=4, lane_status=pass, degraded_causes={'stale': 3}
- game development skill: kept=1, raw=20, lane_status=pass, degraded_causes={'stale': 10, 'license': 14, 'low-signal': 12, 'archived': 1}

## Key Gaps
- survey skill guidance does not explicitly require recording `open_issues` and `forks` in keep/reject rationale, even though API retrieval already provides them.

## Contradictions
- high-star but stale repos appear attractive in discovery yet fail freshness gate; this is expected and should remain explicit.

## Key Insight
- Adding a compact maintenance-signal requirement (`open_issues`, `forks`) to the relevance-gate metadata minimum improves reviewer traceability without changing destructive behavior.