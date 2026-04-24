## Settings
- GitHub CLI search JSON fields: fullName, description, url, updatedAt, pushedAt, isArchived, license, stargazersCount.
- Validator flags: --platform-topic --require-provenance.

## Rules
- Always execute all five keyword families.
- Keep only non-archived, licensed, recently pushed candidates with explicit fit rationale.
- Label provenance in markdown artifacts.

## Hooks
- Hourly cron trigger performs survey -> artifacts -> implementation -> PR -> self-review -> merge.
- Quality gate hook blocks merge when validator fails.

## Platform Gaps
- Web search providers may fail in unattended environments; GitHub-native retrieval remains primary fallback.
- Obsidian desktop CLI may be unavailable in headless runners; direct vault markdown write fallback is required.

Provenance: direct page retrieval.
