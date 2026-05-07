# Solutions

## Candidate metadata gate

### Primary repo target
- repo: https://github.com/akillness/oh-my-skills
- license: MIT
- archived: false
- fit rationale: repository policy and validators live here; minimal reversible improvement applied to newly added skill package.

### Upstream evidence repos (referenced by skill)
1. https://github.com/obsidianmd/obsidian-api
   - license: MIT
   - archived: false
   - pushed_at: 2026-05-07T00:08:02Z
2. https://github.com/kepano/obsidian-skills
   - license: MIT
   - archived: false
   - pushed_at: 2026-04-02T17:21:56Z
3. `eslint-plugin-obsidianmd` package
   - repository (via npm metadata): https://github.com/obsidianmd/eslint-plugin
   - previous linked URL in SKILL.md returned 404 and was corrected.

## Implemented remediation
- Added missing `## Examples` section to `.agent-skills/obsidian/SKILL.md`.
- Renamed duplicate heading `## Instructions` (trailing section) to `## Operational checklist` to avoid duplicate-section ambiguity.
- Corrected dead reference URL to upstream repo derived from package metadata.

## Security/quality impact
- Reduced risk of stale or misleading external execution guidance via dead-link correction.
- Improved parser/readability robustness with unique section headings.
- Kept change scope narrow and fully revertible in one commit.