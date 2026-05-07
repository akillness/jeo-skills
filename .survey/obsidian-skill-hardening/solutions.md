# Solutions

## Candidate metadata gate
- Candidate: `.agent-skills/obsidian`
- Type: existing newly added skill improvement (bounded)
- License (target repo): MIT (`akillness/oh-my-skills`)
- Archived: false (target repo active)
- Fit rationale: fixes concrete validator warning + clarifies safe execution around remote bootstrap command.

## Evidence provenance
- Source labels: `git history`, `local validator`, `direct page retrieval`, `npm metadata`
- Evidence links:
  - Target repo: https://github.com/akillness/oh-my-skills
  - Obsidian CLI docs: https://obsidian.md/help/cli
  - Obsidian plugin docs: https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin
  - kepano/obsidian-skills: https://github.com/kepano/obsidian-skills
  - eslint-plugin package metadata: https://www.npmjs.com/package/eslint-plugin-obsidianmd
  - Resolved repository (from npm metadata): https://github.com/obsidianmd/eslint-plugin

## Applied changes
1. Added missing `## Examples` section with runnable examples.
2. Renamed duplicate trailing `## Instructions` heading to `## Operational checklist`.
3. Added explicit best-practice note to review source/generated files before following `npx github:...` bootstrap with install/build steps.

## Risk assessment
- Scope: single markdown file update.
- Runtime risk: none (documentation-only).
- Rollback: one-commit revert.
