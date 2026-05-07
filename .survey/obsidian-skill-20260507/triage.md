# Triage — obsidian skill (2026-05-07)

## Candidate
- Skill: `.agent-skills/obsidian/`
- Added in commit: `ddbcb78c83e9397edd084a773805ae615c86a978`
- Reason selected: Newly added within last 3 days and had validator warning (`missing ## Examples`) plus a dead external reference URL.

## Scope decision
- Choose bounded documentation-only remediation in one file.
- No behavioral/tooling changes.

## Initial findings
1. Duplicate header ambiguity: second `## Instructions` at end of file.
2. Missing recommended section: `## Examples`.
3. Dead external reference: `https://github.com/obsidianmd/eslint-plugin-obsidianmd` (HTTP 404).
4. Security clarity improvement opportunity: remind users to verify provenance/pin for third-party bootstrap command (`npx github:...`).
