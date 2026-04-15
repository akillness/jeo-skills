# Context: agentation modernization

## Workflow Context
`agentation` sits in a high-visibility planning/review lane: JEO already frames the overall workflow as Plan (`plannotator`) → Verify (`agent-browser`) → UI Feedback (`agentation`) → Cleanup. The repo's next useful move is not another browser wrapper, but a clearer `agentation` anchor for exact UI feedback packets, sync/watch loops, and platform hook setup.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Agent-heavy frontend/fullstack builder | Turn visual QA comments into exact code fixes | Intermediate to advanced |
| Human reviewer / designer | Mark the right UI element without writing selectors | Beginner to intermediate |
| Orchestration operator | Connect plan/review/browser tools into one repeatable loop | Advanced |
| CLI/platform maintainer | Wire hooks/MCP config into Claude, Codex, Gemini, or OpenCode | Advanced |
| QA / product reviewer | Capture precise feedback and keep evidence in a repeatable workflow | Intermediate |

## Current Workarounds
1. Use README/setup docs as the de facto operator guide instead of durable skill-local references.
2. Manually choose among `plannotator`, `agent-browser`, `playwriter`, and `agentation` without clear route-outs.
3. Use copy-paste feedback or ad hoc screenshots even when watch-loop or platform-hook patterns are the real need.
4. Depend on the current giant `agentation` skill body for install/config snippets, which makes discovery noisy and maintenance brittle.

## Adjacent Problems
- Browser-lane boundary blur: `agentation` can sprawl into fresh-session verification (`agent-browser`) or running-browser reuse (`playwriter`) unless the routing rules stay explicit.
- Planning-review overlap: `plannotator` owns review of plans/diffs, while `agentation` should own review of rendered UI behavior and element-level feedback.
- Discovery-surface drift: `README.md`, `README.ko.md`, and `setup-all-skills-prompt.md` still contain stale 85-skill counts despite the repo now having 89 installable skills.
- Support-coverage debt: `agentation` had scripts but no `references/` or `evals/`, making a flagship skill harder to ratchet safely.

## User Voices
- Repo voice (`README.md`): JEO's lifecycle explicitly includes `agentation` as the `VERIFY_UI` stage, so this is a core path rather than a niche addon.
- Repo voice (`README.md` / `setup-all-skills-prompt.md`): `agentation` is already advertised as the UI-annotation step in the planning/review stack, which raises the cost of a weak trigger description.
- Upstream voice (`raw.githubusercontent.com/benjitaylor/agentation/main/README.md`): Agentation is an "agent-agnostic visual feedback tool" for clicking elements, adding notes, and copying structured output that helps coding agents find the exact code being referenced.
- Upstream package signal (`registry.npmjs.org/agentation/latest`): current `agentation` package version is `3.0.2`; `agentation-mcp` is `1.2.0`, so stale in-body version assumptions should be avoided.
