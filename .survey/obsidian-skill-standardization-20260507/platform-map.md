# Platform Map

## Tooling used this run
- Git: repository sync, branching, commit
- gh CLI: PR creation, checks, merge gating
- skill validator: `.agent-skills/skill-standardization/scripts/validate_skill.sh`

## Fallback stance
- If `gh` unavailable: use git + GitHub REST API (`curl`) for PR/check steps.
- If checks absent (`gh pr checks` returns none): hard block merge and leave blocker comment.
