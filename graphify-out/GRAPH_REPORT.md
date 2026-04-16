# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, compact-variant coverage, documentation indexing, and cross-skill mentions
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 89
- Skills with evals/: 89
- Skills with scripts/: 24
- Skills with compact variants (`SKILL.toon` or `SKILL.compact.md`): 89
- Skills missing compact variants: 0
- Graph nodes: 385
- Graph edges: 1098

## Strongest structural findings
1. The graph is still discovery-surface dominated: `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `skills.json`, and `skills.toon` remain the highest-degree maintenance nodes because they index almost the whole live catalog.
2. Baseline support coverage remains effectively complete across the live skill set (89/89 with `references/`, 89/89 with `evals/`, 89/89 with compact variants). The next wins continue to come from boundary clarity, oversized front doors, and stale routing.
3. `firebase-cli` was a high-value bounded target because it sits in a dense Firebase cluster with `genkit` and `firebase-ai-logic` but still had a command-catalog front door. The current pass moves it back toward a routing-first operator anchor with focused packets for install/auth, bootstrap, emulators/release, and admin/data operations.
4. The Firebase lane should stay three-part: `firebase-cli` for platform/project operation, `firebase-ai-logic` for direct app/client Gemini integration, and `genkit` for backend workflow orchestration. No new wrapper skill is justified there.

## Highest-degree nodes
- .agent-skills/skills.json: degree 89
- README.ko.md: degree 88
- README.md: degree 88
- setup-all-skills-prompt.md: degree 88
- .agent-skills/skills.toon: degree 81
- debugging: degree 38
- bmad: degree 22
- code-review: degree 22
- vibe-kanban: degree 22
- performance-optimization: degree 21
- task-planning: degree 21
- jeo: degree 20

## Oversized front-door watchlist
- ralph: 500 lines in SKILL.md
- deployment-automation: 409 lines in SKILL.md
- survey: 392 lines in SKILL.md
- file-organization: 358 lines in SKILL.md
- authentication-setup: 338 lines in SKILL.md
- api-documentation: 337 lines in SKILL.md
- autoresearch: 334 lines in SKILL.md
- clawteam: 330 lines in SKILL.md
- technical-writing: 321 lines in SKILL.md
- scrapling: 320 lines in SKILL.md

## Duplicate / consolidation notes
- `firebase-cli` should stay distinct from `genkit` and `firebase-ai-logic`: CLI/platform operation is not backend AI workflow orchestration or direct in-app Gemini SDK wiring.
- The bounded win in the Firebase lane is improving the existing canonical operator anchor, not adding another Firebase wrapper.
- Future duplicate pressure is more likely to come from high-visibility anchors drifting into adjacent route-outs than from missing support directories.

## Firebase cluster neighbors
- authentication-setup
- database-schema-design
- debugging
- deployment-automation
- firebase-ai-logic
- genkit
- harness

## Recommended maintenance direction
- Keep improving high-degree anchors when they become too dense before adding new adjacent skills.
- Re-run catalog/runtime sync validation whenever `skills.json`, `skills.toon`, or top-level docs change materially.
- Prefer reference-doc splits and truthful routing/discovery updates when a main `SKILL.md` starts to outgrow its trigger surface or carry stale route-outs.
