## Settings
- Use validator script per skill directory.
- Enforce required/recommended section policy for merge readiness.

## Rules
- No merge when PR checks are absent/failing.
- Minimal, reversible edits only.

## Hooks
- `validate_skill.sh` pre-PR quality gate.
- `gh pr checks` as merge gate.

## Platform Gaps
- Validator does not natively enforce command safety language quality.
- Additional static checks for dangerous patterns may be needed in future.
