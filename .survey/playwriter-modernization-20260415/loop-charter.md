# Loop Charter

## Goal
Improve the `playwriter` skill so it triggers more precisely, reflects current upstream behavior, and cleanly routes users between running-browser reuse and fresh-session browser tooling.

## Current Baseline
Current `playwriter` has useful raw detail but still behaves like a command-heavy integration guide. It under-specifies decision boundaries with `agent-browser`, misses some upstream workflow details (notably `playwriter browser start`), and lacks `references/` and `evals/` support files.

## Mutable Artifact
Primary: `.agent-skills/playwriter/SKILL.md`

Supporting context files may be updated only if the primary change is kept:
- `.agent-skills/playwriter/references/*`
- `.agent-skills/playwriter/evals/evals.json`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills/skills.json`
- `.agent-skills-wiki/*`
- `graphify-out/*` (only if a structural refresh materially helps this run)

## Fixed Evaluation Harness
- Agent Skills structure/frontmatter expectations from `skill-standardization`
- Trigger quality: description must clearly say when to use `playwriter` and when not to use it
- Boundary quality: skill must clearly separate existing-browser reuse from fresh-session tools such as `agent-browser`
- Upstream accuracy spot-checks from surveyed sources (`playwriter` README, Playwright auth / BrowserType docs, MCP docs)
- Dry-run usefulness on representative prompts:
  1. "Use my logged-in Chrome to automate a Jira workflow"
  2. "Run a repeatable headless checkout test in CI"
  3. "Connect Claude/Codex/Gemini to the browser I already have open"

## Constraints
- Max one coherent improvement set in this run
- Prefer modernization + support-file ratchet over adding a new overlapping skill
- Keep the skill decision-first and reusable; avoid keyword stuffing or a giant command dump
- Update docs/setup surfaces if the skill’s positioning materially changes

## Tried Already
- Keep: survey-driven modernization of weak legacy anchors plus support files
- Keep: explicit canonical-vs-adjacent boundaries instead of broad duplicate skills
- Revert: adding overlapping wrappers when an existing skill can be modernized more cleanly
- Why: transferable improvements compound better than noisy catalog growth
