## Solution List
1. Add missing `## Examples` section to `.agent-skills/obsidian/SKILL.md`.
2. Rename duplicated trailing `## Instructions` to `## Operational checklist`.
3. Add explicit safety framing to remote code execution command (`npx github:...`).

## Categories
- Documentation standardization
- Security hardening (command safety note)
- Readability/maintainability

## What People Actually Use
- Existing validator script: `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Lightweight markdown edits with immediate re-validation

## Frequency Ranking
1. Missing recommended section warnings (`Examples`) in new skills
2. Duplicate heading ambiguity
3. Unsafe command framing without caution text

## Key Gaps
Validator catches missing sections but not all command-safety wording nuances.

## Contradictions
No contradiction found between skill docs and repository validator policy.

## Key Insight
Small wording/structure fixes on newly added skills can reduce long-tail maintenance and improve safe usage without broad refactors.

## Candidate metadata gate
- candidate: `.agent-skills/obsidian`
- source repo: https://github.com/akillness/oh-my-skills
- license: MIT (repo root)
- pushed_at (commit adding SKILL.md): 2026-05-06T14:08:31+09:00 (`ddbcb78c83e9397edd084a773805ae615c86a978`)
- archived: false (GitHub repository active)
- fit rationale: Newly added in 3-day window, validator warning reproducible, low-risk direct fix available.
