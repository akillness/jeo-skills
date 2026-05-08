# Hourly lane query generator

Use `scripts/generate_hourly_lane_queries.py` to produce deterministic stage-0/stage-1/stage-2 queries for all mandatory hourly lanes.

## Why this exists
- Prevents drift in lane naming and recovery-query coverage.
- Guarantees every lane has explicit stage-1 and stage-2 recovery queries for auditability.
- Works with the hourly evidence contract validator lane keys.

## Usage

```bash
python3 .agent-skills/survey/scripts/generate_hourly_lane_queries.py > .survey/<slug>/lane-queries.json
```

## Expected output shape

```json
{
  "lanes": {
    "agentic-ai-skill": {
      "stage-0": "agentic ai skill",
      "stage-1": "agentic ai skill stars:>5000",
      "stage-2": "agentic ai skill pushed:>2024-01-01 stars:>100"
    }
  }
}
```

## Integration point
Run before `gh search repos` and copy exact query strings into evidence lane `recovery_queries` entries.
