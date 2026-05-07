# Platform map

## Settings
- Branching: unique timestamped branch per run.
- Validation gates: skill validator + survey artifact validator + `git diff --check`.

## Rules
- Prefer minimal, reversible edits.
- Do not merge if PR checks are missing or failing.
- Keep provenance labels explicit in survey artifacts.

## Hooks
- Validator: `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Survey validator: `.agent-skills/survey/scripts/validate_survey_artifacts.py`

## Platform Gaps
- Historical external URL drift (dead reference) can bypass local validation unless link checks are performed.

## External evidence links
- https://github.com/obsidianmd/eslint-plugin (resolved authoritative upstream)
- https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin
- https://obsidian.md/help/cli
