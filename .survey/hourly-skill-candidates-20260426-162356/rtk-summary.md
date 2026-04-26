# RTK Summary — hourly-skill-candidates-20260426-162356

- provenance: indexed snippet, direct page retrieval
- recommended_lane_count: 2
- single_lane_concentration: false

## Lane metrics
| lane | status | kept/raw | median_stars_raw | zero_star_raw | degraded_causes |
|---|---:|---:|---:|---:|---|
| agentic ai skill | degraded | 0/20 | 0.0 | 13 | license:14, low-fit:4, low-signal:18 |
| web frontend skill | degraded | 0/4 | 0.0 | 3 | license:3, low-signal:3, stale:1 |
| web backend skill | degraded | 0/0 | 0 | 0 | none |
| cli open source skill | degraded | 2/5 | 830 | 0 | license:1, low-fit:1, stale:2 |
| game development skill | pass | 2/20 | 0.0 | 15 | license:16, low-signal:17 |

## Notable retrieval issue
- Earlier same-run attempt (`hourly-skill-candidates-20260426-162245`) failed because `gh search repos --json nameWithOwner` is invalid on this gh version.
- Recovery used supported field `fullName`, restoring non-empty evidence in multiple lanes.

## Low-risk hardening candidate
- Add a gh-field compatibility fallback note to survey guidance: use `fullName` (or `owner`+`name`) instead of `nameWithOwner` for `gh search repos --json`.