# Solutions

## Candidate metadata gate
- license: N/A (documentation package in this repository; no external code vendoring in this patch)
- updated/pushed_at: commit `ddbcb78c83e9397edd084a773805ae615c86a978` at `2026-05-06T14:08:31+09:00`
- archived: false (target repository active)
- fit rationale: high — direct quality/security standardization of newly added local skill.

## Applied remediation
1. Added `## Examples` section to satisfy recommended standard section.
2. Renamed duplicate trailing `## Instructions` to `## Operational checklist` to reduce reader/parser ambiguity.
3. Added best-practice line: verify provenance and pin versions/commits for third-party bootstrap commands.
4. Replaced dead eslint reference URL with authoritative upstream repository URL.

## Verification evidence
- `validate_skill.sh .agent-skills/obsidian` → `0 errors, 0 warnings`
- `curl -I -L https://github.com/obsidianmd/eslint-plugin-obsidianmd` → `404`
- `npm view eslint-plugin-obsidianmd repository.url --json` → `git+https://github.com/obsidianmd/eslint-plugin.git`
- `curl -I -L https://github.com/obsidianmd/eslint-plugin` → `200`
