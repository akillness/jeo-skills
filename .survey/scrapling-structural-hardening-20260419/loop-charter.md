# Loop Charter

## Goal
Improve the existing `scrapling` skill so it activates and routes more reliably for real scraping tasks without creating another overlapping web-scraping wrapper.

## Current Baseline
- Primary file: `.agent-skills/scrapling/SKILL.md`
- Baseline shape: 319-line feature tour with strong support coverage (`references/`, `scripts/`, `evals/`, `SKILL.toon`) but a broad front door.
- Current best hypothesis: convert the front door into a routing-first packet selector that starts with target class, rendering need, protection level, and crawl scope.

## Mutable Artifact
- Primary mutable artifact: `.agent-skills/scrapling/SKILL.md`

## Fixed Evaluation Harness
- Agent Skills structure and description quality from `skill-standardization`
- Existing compact/discovery surfaces remain truthful: `SKILL.toon`, `.agent-skills/skills.json`, `.agent-skills/skills.toon`, `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`
- Representative prompts:
  1. Static HTML/article extraction
  2. JS-rendered dashboard extraction
  3. Protected target needing honest stealth escalation
  4. Agent-facing MCP use
  5. Site-scale crawl that should route to spiders
- Pass criteria:
  - Front door is materially shorter and more decisive than baseline
  - Route-outs are explicit and honest
  - Existing eval coverage still matches the skill contract and can be expanded if needed

## Constraints
- Max one bounded skill improvement set this run
- Keep support-file changes minimal and only when they increase clarity
- No new overlapping skill folders
- Update discovery/docs surfaces if the trigger surface changes materially
- Prefer keep-or-revert on one structural hypothesis, not a broad rewrite of multiple lanes

## Tried Already
- Keep: choose an existing oversized, support-complete front-door skill rather than inventing a new wrapper
- Keep: use survey evidence plus wiki/graph memory before editing
- Revert: none yet in this run
