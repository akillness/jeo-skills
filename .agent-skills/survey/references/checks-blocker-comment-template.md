# Checks Blocker Comment Template Helper

Use this helper when an hourly PR run hits the hard gate `no checks reported on branch`.

## Purpose
- Produce deterministic ASCII-only blocker comments.
- Avoid shell quoting mistakes in `gh pr comment` bodies.
- Keep remediation steps consistent across unattended cron runs.

## Command

```bash
python3 .agent-skills/survey/scripts/generate_checks_blocker_comment.py <pr_number> <branch> <latest_commit> > .survey/<slug>/checks-blocker-comment.md
gh pr comment <pr_number> --body-file .survey/<slug>/checks-blocker-comment.md
```

## Output contract
The generated body always includes:
- run timestamp (UTC)
- PR number, branch, latest commit
- explicit gate failure (`no checks reported on branch`)
- deterministic remediation steps (configure CI, trigger checks, re-verify)

## Provenance label
When referenced from survey artifacts, tag as `direct page retrieval` for PR metadata and `indexed snippet` for discovery evidence.
