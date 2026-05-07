# Solutions

## Solution List
1. Add `## Examples` section to `.agent-skills/obsidian/SKILL.md`.
2. Rename duplicate trailing `## Instructions` to `## Operational checklist`.
3. Replace dead reference URL with verified upstream URL.

## Categories
- documentation standardization
- reference integrity
- low-risk quality hardening

## What People Actually Use
- Validator script: `.agent-skills/skill-standardization/scripts/validate_skill.sh`.
- URL checks with `curl -I -L`.
- Package metadata resolution via `npm view eslint-plugin-obsidianmd repository.url --json`.

## Frequency Ranking
1. Missing recommended sections (common validator warning).
2. Dead outbound reference links.
3. Duplicate section headings.

## Key Gaps
- No examples block existed before this patch.
- Old ESLint plugin reference URL returned 404.

## Contradictions
- Skill claimed strong guidance quality, but lacked examples and contained ambiguous duplicate heading.

## Key Insight
- Small documentation-only edits can clear validator warnings and improve runtime trust without changing execution behavior.

## Candidate metadata gate
- license: MIT (repo root `LICENSE`)
- archived: not archived (active repository state)
- updated/pushed_at: candidate set discovered from recent git history window
- fit rationale: minimal reversible edits with direct validation gain

## Provenance labels
- direct git history inspection
- local validator output
- direct page retrieval
- package registry metadata lookup
