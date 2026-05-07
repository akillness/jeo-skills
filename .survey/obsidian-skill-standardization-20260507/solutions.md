# Solutions

## Candidate metadata gate
- candidate: `.agent-skills/obsidian`
- license: MIT (repo-level license)
- archived: false (source repo active)
- updated/pushed_at: verified via local git sync at run time (`git fetch --prune` + `git pull --ff-only`)
- fit rationale: only candidate in 3-day set with validator warning; smallest high-value change.

## Findings
1. **Quality gap**: missing recommended section `## Examples` in `.agent-skills/obsidian/SKILL.md`.
2. **Structure ambiguity**: duplicate `## Instructions` heading appeared again near file end (could confuse section-based parsers).
3. **Security hardening opportunity**: plugin-install guidance lacked explicit warning about running untrusted package install/build commands.

## Implemented remediations (minimal scope)
- Added `## Examples` section with 3 concrete usage examples.
- Renamed trailing duplicate `## Instructions` to `## Operational checklist`.
- Added best-practice guardrail: review package metadata before running install/build commands from untrusted repositories.

## Provenance
- local file: `.agent-skills/obsidian/SKILL.md`
- validator script: `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- policy skill used: `oh-my-skills-added-skill-standardization`
