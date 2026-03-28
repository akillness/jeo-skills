# Strix Scan Modes And CI

> Source: https://docs.strix.ai/usage/scan-modes and CI integration docs
> Last reviewed: 2026-03-28

## Scan modes

| Mode | Typical duration | Best for |
|------|------------------|----------|
| `quick` | Minutes | Pull requests, smoke tests, fast CI gates |
| `standard` | ~30 to 60 minutes | Routine security reviews, pre-release validation |
| `deep` | ~1 to 4 hours | Comprehensive audits, release reviews, longer assessments |

`deep` is the upstream default. In automation, do not inherit that default blindly; choose the mode deliberately.

## Recommended policy

- PR or per-commit checks: `quick`
- Nightly or milestone scans: `standard`
- Release candidate or high-risk review: `deep`

## Headless mode

Use headless mode in automation:

```bash
strix -n --target ./ --scan-mode quick
```

## CI requirements

- Docker access is required
- `STRIX_LLM` must be set
- Provider auth must be available through environment variables or cloud auth

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | Completed without findings |
| `1` | Execution or environment error |
| `2` | Findings detected in headless mode |

## GitHub Actions example

```yaml
name: Strix Security Scan

on:
  pull_request:

jobs:
  strix-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Strix
        run: curl -sSL https://strix.ai/install | bash

      - name: Run Strix
        env:
          STRIX_LLM: ${{ secrets.STRIX_LLM }}
          LLM_API_KEY: ${{ secrets.LLM_API_KEY }}
        run: strix -n -t ./ --scan-mode quick
```

## Generic CI checklist

1. Install Strix non-interactively
2. Ensure Docker is usable on the runner
3. Export `STRIX_LLM`
4. Inject provider auth securely
5. Run `strix -n` with an explicit scan mode
6. Archive `strix_runs/` if you need run evidence

## Common mistakes

- Running `deep` on every PR and turning feedback into a bottleneck
- Forgetting Docker on the runner
- Treating exit code `2` like a crash instead of a findings signal
- Passing long credentials inline when an instruction file or CI secret is safer
