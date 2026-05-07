# Triage

- Run date: 2026-05-07 (UTC)
- Scope: skills newly added within last 3 days in `akillness/oh-my-skills`
- Candidate selected for remediation: `.agent-skills/obsidian`

## Why this candidate
1. Validator warning: missing `## Examples` section.
2. Duplicate `## Instructions` heading reduced readability/parse stability.
3. Dead external reference discovered in `References` (`obsidianmd/eslint-plugin-obsidianmd` returned 404).

## Evidence method
- Local repo inspection and validator script execution.
- Direct source retrieval via `gh api`, `curl -I`, and `npm view`.
- `web_search` degraded (401 invalid key), fallback used.