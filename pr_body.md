## Summary
- Reviewed all newly added skill packages in the last 3 days.
- Applied minimal standardization/security/completeness fixes to `.agent-skills/obsidian/SKILL.md`.
- Added survey artifacts under `.survey/obsidian-20260507/`.

## Why this candidate
`obsidian` is newly added (within 3 days) and had a validator warning (`## Examples` missing) plus duplicated heading ambiguity (`## Instructions` repeated).

## Changes
- `.agent-skills/obsidian/SKILL.md`
  - Added missing `## Examples` section.
  - Renamed duplicate trailing `## Instructions` to `## Operational checklist`.
  - Added safety framing on remote package execution command (`npx github:...`).
  - Replaced dead reference URL for eslint plugin with authoritative repo URL.
- `.survey/obsidian-20260507/{triage.md,context.md,solutions.md,platform-map.md}`

## Evidence / sources
- Added-in-window commit for candidate:
  - `.agent-skills/obsidian/SKILL.md` added in `ddbcb78c83e9397edd084a773805ae615c86a978`
- Dead-link verification + fix evidence:
  - `curl -I -L https://github.com/obsidianmd/eslint-plugin-obsidianmd` -> `HTTP/2 404`
  - `npm view eslint-plugin-obsidianmd repository.url --json` -> `git+https://github.com/obsidianmd/eslint-plugin.git`
  - Updated link to `https://github.com/obsidianmd/eslint-plugin`

## Validation
```bash
bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/obsidian
# Issues: 0 errors, 0 warnings

# 3-day newly added skills batch validation
python3 ...  # looped validate_skill.sh across all 20 candidates
# all exited 0, each reports 0 errors / 0 warnings

git diff --check
# clean
```

## Risk
Low. Markdown-only, narrowly scoped, reversible in one commit.

## Rollback
`git revert <commit_sha>` on this PR merge commit.
