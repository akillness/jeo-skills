# Open PR checks artifact collector

Use this helper in unattended hourly runs to avoid lingering `gh pr checks` transcript files at repo root.

## Why

Some hourly runs capture `gh pr checks` stdout/stderr for blocker analysis. If those files stay outside `.survey/<slug>/`, they become untracked clutter and can fail packaging hygiene checks.

## Script

`python3 .agent-skills/survey/scripts/collect_open_pr_checks_artifacts.py <checks_out> <checks_err> <slug_dir>`

### Inputs
- `checks_out`: path to captured stdout from `gh pr checks`
- `checks_err`: path to captured stderr from `gh pr checks`
- `slug_dir`: `.survey/<slug>` directory

### Outputs
- `.survey/<slug>/open-pr-checks.out`
- `.survey/<slug>/open-pr-checks.err`
- `.survey/<slug>/open-pr-checks-summary.json`

`open-pr-checks-summary.json` includes deterministic gate metadata:
- `status`: `ok|blocked`
- `merge_blocked_reason`: currently `no-checks-reported` when detected

## Example

```bash
python3 .agent-skills/survey/scripts/collect_open_pr_checks_artifacts.py \
  /tmp/run/pr-checks.out \
  /tmp/run/pr-checks.err \
  .survey/hourly-skill-candidates-20260509-123000
```

## Notes

- The script is copy-based and does not delete source files; remove temporary source files in a follow-up step when needed.
- Keep this in the open-PR gate path before `git status --short` to preserve clean-tree guarantees.
