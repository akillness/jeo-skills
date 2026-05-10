# PR Body Section Validation (Hourly Runs)

## Purpose
Ensure unattended hourly PRs always include reviewer-critical sections:

- `## Summary`
- `## Evidence`
- `## Risk`
- `## Rollback`
- `## Validation`

This prevents incomplete PR descriptions when automation is degraded or interrupted.

## Script
`python3 .agent-skills/survey/scripts/validate_pr_body_sections.py <pr_body.md> <output.json>`

- Exit `0`: all required headings found.
- Exit `1`: one or more headings missing.
- Exit `2`: input file missing.

## Output
Writes audit JSON (example):

```json
{
  "ok": true,
  "required_headings": ["## Summary", "## Evidence", "## Risk", "## Rollback", "## Validation"],
  "missing_headings": [],
  "pr_body_path": ".survey/hourly-skill-candidates-YYYYMMDD-HHMMSS/pr-body.md"
}
```

## Integration Point
Run after generating `pr-body.md` and before `gh pr create`.
If validation fails, patch/regenerate `pr-body.md` before opening/updating PR.
