# Platform Map
## Settings
- Repository: akillness/oh-my-skills
- Run mode: hourly cron, unattended

## Rules
- Five mandatory lanes always executed.
- Merge only with checks green.
- If open PR exists, avoid duplicate PR creation.

## Hooks
- `gh pr checks` for hard merge gate
- survey validator with `--platform-topic --require-provenance`

## Platform Gaps
- Branches may show `no checks reported`; requires explicit CI bootstrap guidance.

Provenance label: direct page retrieval.
