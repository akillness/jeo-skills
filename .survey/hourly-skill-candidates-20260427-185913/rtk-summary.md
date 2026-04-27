# RTK Summary

- provenance: direct page retrieval (gh api repos) + indexed snippet (gh search repos)
- run_slug: hourly-skill-candidates-20260427-185913
- transport_status: ok (gh search repos + gh api repos)
- recommended_lane_count: 4
- single_lane_concentration: false

## Lane Health (compact)
- agentic ai skill: status=pass, kept/raw=3/20, median_stars_raw=0.0, zero_star_ratio=0.60, degraded_causes={'low-signal': 17, 'license': 12}
- web frontend skill: status=degraded, kept/raw=0/7, median_stars_raw=0, zero_star_ratio=0.57, degraded_causes={'license': 5, 'stale': 4, 'low-signal': 5}
- web backend skill: status=pass, kept/raw=1/1, median_stars_raw=127, zero_star_ratio=0.00, degraded_causes={}
- cli open source skill: status=pass, kept/raw=1/4, median_stars_raw=30.5, zero_star_ratio=0.00, degraded_causes={'stale': 3}
- game development skill: status=pass, kept/raw=1/20, median_stars_raw=2.0, zero_star_ratio=0.45, degraded_causes={'stale': 10, 'license': 14, 'low-signal': 12, 'archived': 1}

## Key Finding
- metadata minimum currently centers on license/freshness/archived and omits explicit maintenance signal fields in reviewer-facing contract.
- low-risk hardening candidate: require `open_issues` and `forks` capture alongside existing metadata minimum.