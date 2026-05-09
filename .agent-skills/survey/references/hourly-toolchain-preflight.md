# Hourly Toolchain Preflight

Use this before generating hourly survey artifacts to fail fast on missing tooling/auth.

## Why
- Unattended hourly runs can spend minutes producing partial artifacts before failing on `gh auth` or missing binaries.
- A deterministic preflight artifact improves triage and keeps degraded runs auditable.

## Command

```bash
python3 .agent-skills/survey/scripts/check_hourly_toolchain.py .survey/<slug>/toolchain-preflight.json
```

## Required gates
- Required tools present: `gh`, `git`, `python3`, `bash`
- GitHub auth valid: `gh auth status` exit code 0

## Optional tooling health
- Presence-only checks for `rtk`, `graphify`, `obsidian`
- Missing optional tools should mark run degraded only if those outputs are mandated by policy

## Remediation examples
- `gh-not-found`: install GitHub CLI and retry
- `gh-auth-failed`: run `gh auth login` in scheduler environment
- `missing-required-tools`: install missing binaries or switch runtime image
