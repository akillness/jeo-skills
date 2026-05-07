# Platform map

## Skill/tooling surfaces touched
- Git/GitHub: branch, commit, PR workflow
- Skill validator: `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Network evidence checks: `curl -I -L`, `npm view`

## Dependency status
- GitHub CLI (`gh`): working
- Validator script: working
- External docs/repo URLs: HTTP 200 on checked references
- Obsidian tooling execution: not required for this doc-only patch

## Fallbacks exercised
- GitHub repo lookup for `eslint-plugin-obsidianmd` failed for legacy URL.
- Fallback used: `npm view eslint-plugin-obsidianmd repository.url` to derive authoritative repo URL.
