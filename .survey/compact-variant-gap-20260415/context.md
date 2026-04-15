# Context: compact-variant gap

## Workflow Context
The repo now treats compact discovery artifacts as part of the runtime surface, not optional decoration. `skill-standardization` explicitly says to refresh `SKILL.toon` / `SKILL.compact.md` after material trigger-surface changes, and the structural graph reports the same discovery docs (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `.agent-skills/skills.json`, `.agent-skills/skills.toon`) as high-degree nodes. The current bounded gap is that only 8 skills still lack compact variants, which means discovery quality is uneven precisely where the repo claims a tiered loading model.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repo maintainer | Keep shipped skill surfaces internally consistent | advanced |
| Agent/runtime integrator | Match compact discovery to full skill intent | advanced |
| End-user invoking skills | Get the right skill activated before a full load | mixed |

## Current Workarounds
1. Rely on full `SKILL.md` files for the missing skills, which defeats the intended compact discovery layer.
2. Rely on `.agent-skills/skills.json` alone, which preserves top-level catalog presence but loses per-skill compact routing symmetry.
3. Leave the gap undocumented and hope future modernization passes fill it incidentally.

## Adjacent Problems
- README/setup claims about `SKILL.toon` become less trustworthy when even a small residue of skills lacks the file.
- Missing compact variants create uneven activation quality across otherwise modernized skill clusters.
- Future maintainers have to rediscover the same missing-variant list unless it is filed in the wiki and graph memory.

## User Voices
- `README.md:459` says `.agent-skills/` contains `89 skill folders (each with SKILL.md + SKILL.toon)`.
- `.agent-skills/skill-standardization/SKILL.md:233-237` says compact variants should be refreshed when the trigger surface changes materially.
- `graphify-out/GRAPH_REPORT.md:15-18` says discovery surfaces are first-class routing nodes and compact-variant drift is a real retrieval problem.
