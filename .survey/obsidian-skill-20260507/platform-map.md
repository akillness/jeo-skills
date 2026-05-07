# Platform Map

## Tooling used in this run
- git / gh CLI: repository sync, branch/PR workflow, metadata retrieval.
- validate_skill.sh: standards gate for SKILL.md.
- npm view: package metadata fallback for upstream repository mapping.
- curl: direct URL health check for reference link validity.

## Degraded dependency and fallback
- `web_search` returned `401 INVALID_API_KEY`.
- Fallback path used: direct retrieval via `gh api`, `curl`, and local command-line metadata (`npm view`).

## Provenance links
- Validator script: `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Fixed skill file: `.agent-skills/obsidian/SKILL.md`
- Upstream repos:
  - https://github.com/obsidianmd/obsidian-api
  - https://github.com/kepano/obsidian-skills
  - https://github.com/obsidianmd/eslint-plugin