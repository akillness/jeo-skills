# Hourly Slug Integrity Verification

Use this guard right before `git add` to ensure the current run only modified
artifacts under the active slug directory.

## Why

Hourly cron runs can accidentally touch previous `.survey/hourly-skill-candidates-*`
folders when helper scripts auto-discover paths. This creates mixed-run PRs and
breaks auditability.

## Command

```bash
git status --short > .survey/<slug>/git-status-short.txt
python3 .agent-skills/survey/scripts/verify_hourly_slug_integrity.py <slug> .survey/<slug>/git-status-short.txt
```

## Pass criteria

- exits `0`
- prints `slug-integrity-ok`

## Fail criteria

- exits `1`
- prints `slug-integrity-failed` with offending paths under `.survey/` that are
  outside `.survey/<slug>/`

## Remediation

1. Restore unintended files (example: `git checkout -- <path>`).
2. Re-run artifact generation using explicit `SLUG` env handoff.
3. Re-run this guard before commit.
