# Lane concentration gate

This guard ensures hourly recommendations are not concentrated in a single lane.

## Purpose
- Prevent false coverage claims when only one mandatory lane has recommendation-grade candidates.
- Emit deterministic JSON for reviewer audit.

## Usage
- Command: `python3 .agent-skills/survey/scripts/check_recommended_lane_concentration.py <evidence.json> <output.json>`
- Status rule: `pass` when `recommended_lane_count >= 2`; otherwise `degraded`.

## Output contract
- `status`: pass or degraded
- `recommended_lane_count`
- `single_lane_concentration`
- `lane_kept_counts`
- `merge_blocked_reason`
