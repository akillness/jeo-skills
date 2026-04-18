# Context: survey artifact-validator hardening

## Workflow Context
`survey` is the repo's canonical pre-implementation research gate: maintainers use it before planning, before implementation, and before deciding whether work belongs in `task-planning`, `jeo`, `ralph`, or a narrower domain skill. The current hardening pass already made it routing-first, but `graphify-out/GRAPH_REPORT.md` still lists it at 309 lines on the oversized front-door watchlist. The artifact contract is clear — `triage.md`, `context.md`, `solutions.md`, and optional `platform-map.md` with fixed headings — yet the contract is mostly described in `survey/SKILL.md` and `references/platform-adapter-and-artifact-contract.md` rather than enforced by a survey-local validator. This matters because `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `.agent-skills/skills.json`, and `.agent-skills/skills.toon` are high-degree discovery nodes, so ambiguity in `survey` propagates across the repo.

Sources: `graphify-out/GRAPH_REPORT.md`; `.agent-skills/survey/SKILL.md`; `.agent-skills/survey/references/platform-adapter-and-artifact-contract.md`; `README.md`; `setup-all-skills-prompt.md`.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repo-maintenance agents | Run bounded research before touching a skill, SOP, or workflow | Advanced |
| Cross-platform orchestrators | Preserve the same `.survey/{slug}/` outputs across Claude, Codex, Gemini, and fallback runtimes | Advanced |
| Maintainers of discovery surfaces | Keep README / setup / manifest wording aligned with the live skill role | Intermediate |
| Human reviewers | Scan survey artifacts later to understand why a bounded rewrite happened | Intermediate |
| Downstream planning/execution agents | Consume survey artifacts as reusable context instead of rediscovering the landscape | Advanced |

## Current Workarounds
1. Follow the output-shape prose in `.agent-skills/survey/SKILL.md` and the platform-contract reference manually.
2. Use `SKILL.toon`, `README.md`, `skills.json`, and setup prompts as mnemonic discovery surfaces, even though they do not validate produced survey artifacts.
3. Rely on `survey/evals/evals.json` for trigger quality and fallback behavior, even though the evals do not mechanically confirm artifact filenames/headings on disk.
4. In hook-capable runtimes, treat hooks as optional wrappers around an implied validator, even though the validator itself is still prose-only.
5. Reuse old survey folders manually when the question still matches, based on operator judgment rather than a formal freshness check.

## Adjacent Problems
- Discovery-surface sync remains expensive because README / setup / manifest files are the repo's highest-degree maintenance nodes.
- Support coverage is already complete across the live skill set, so adding another wrapper would be noisier than improving the current anchor.
- The repo already prefers smaller front doors plus support packets; leaving `survey` heavy and prose-driven creates an outlier.
- Portability pressure is asymmetric: Claude and Gemini have richer hooks/subagents, while Codex portability leans more on checked-in config and post-generation commands.
- The real maintenance loop already uses `loop-charter.md`, `loop-results.md`, wiki updates, and graph refreshes; if the core survey artifact contract drifts, the whole loop gets noisier.

## User Voices
- "Keep `survey` as the canonical research entry point, but shrink it into a routing-first, artifact-contract-first front door." — `.agent-skills-wiki/queries/survey-structural-hardening-2026-04-18.md`
- "Support coverage remains complete across the live skill set, so dense-anchor cleanup still matters more than adding another wrapper skill." — `graphify-out/GRAPH_REPORT.md`
- "Do not invent alternate filenames or free-form artifact shapes unless the user explicitly asks." — `.agent-skills/survey/SKILL.md`
- "The durable layer is the survey artifact contract, not the platform runtime." — `.agent-skills/survey/references/platform-adapter-and-artifact-contract.md`
- "If a platform supports hooks, wrap the validator there. If it does not, run the validator as a normal command after writing files." — `.agent-skills/survey/references/platform-adapter-and-artifact-contract.md`
- Official platform evidence reinforces the portability split: Claude documents hooks, settings, permissions, and subagents (`https://docs.anthropic.com/en/docs/claude-code/hooks`, `https://docs.anthropic.com/en/docs/claude-code/settings`, `https://docs.anthropic.com/en/docs/claude-code/permissions`, `https://docs.anthropic.com/en/docs/claude-code/sub-agents`); Codex documents checked-in configuration and approval/sandbox settings (`https://developers.openai.com/codex/config-reference`, `https://developers.openai.com/codex/config-basic`); Gemini exposes hook and subagent docs in-repo (`https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/hooks/reference.md`, `https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/core/subagents.md`).