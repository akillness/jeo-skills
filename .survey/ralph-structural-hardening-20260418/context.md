# Context: ralph structural hardening

## Workflow Context
`ralph` shows up as the specification-first front end for agent work that must survive ambiguity, retries, and interruption: interview → immutable seed → execute → evaluate → evolve, plus `ooo ralph` for persistent completion. In practice the repo uses `ralph` as the planning/spec contract while runtime-native execution lands in `omc`, `omx`, `ohmg`, or `jeo`. Upstream Ouroboros evidence shows the same shape across Claude Code, Codex CLI, OpenCode, and chat-channel workflows.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Solo coding agent operator | Turn vague requests into executable specs before writing code | Intermediate |
| Repo maintainer running long loops | Keep retrying until tests, lint, and acceptance checks verify completion | Advanced |
| Claude / Codex / Gemini runtime user | Apply the same method while respecting runtime-specific hooks, approval, and trust settings | Intermediate to advanced |
| Channel / team orchestrator | Resume long-running work and recover after runtime interruptions | Advanced |

## Current Workarounds
1. Codex setup is still described locally as compensation mode: inject developer instructions, add prompt files, and rely on promise text plus manual state-file continuation.
2. Gemini setup uses an AfterAgent hook plus a direct state-file read because the repo documents a Gemini hook bug workaround.
3. Operators route runtime ownership outward: `ralph` for spec-first method, `omc` / `omx` / `ohmg` for runtime execution, `jeo` for integrated delivery, `ralphmode` for approval posture.
4. When runtime-native tools or MCP inheritance fail, users fall back to REST / curl or keep certain steps in the parent session.

## Adjacent Problems
- Step-to-step discoverability after `ooo run` / `ooo evaluate` is still a real user pain.
- The persistence story is split between repo-local JSON state guidance and newer upstream EventStore-backed language.
- Platform-native hooks, approvals, and trust rules keep moving, so stale runtime guidance accumulates faster than the core `ralph` method.
- Boundary confusion appears whenever `ralph`, `omc`, `omx`, `jeo`, and `ralphmode` all claim parts of the same execution story.

## User Voices
> "Ooo held my hand through the process until I did ooo run and then ooo evaluate ... But it didn't suggest the next ooo command." — upstream issue #58 (<https://github.com/Q00/ouroboros/issues/58>)

> "The Ouroboros MCP server has disconnected ... all the progress is lost ... there's never a seed and never measurable progress" — upstream issue #387 (<https://github.com/Q00/ouroboros/issues/387>)

> "ability to set different models per agent role would be valuable" — upstream issue #173 (<https://github.com/Q00/ouroboros/issues/173>)

## Sources
- `.agent-skills/ralph/SKILL.md`
- `.agent-skills/ralph/references/platform-setup.md`
- `.agent-skills/ralph/scripts/ooo-state.sh`
- `.agent-skills-wiki/concepts/core-orchestration-platform-cluster.md`
- `graphify-out/GRAPH_REPORT.md`
- <https://raw.githubusercontent.com/Q00/ouroboros/main/README.md>
- <https://raw.githubusercontent.com/Q00/ouroboros/main/docs/runtime-guides/claude-code.md>
- <https://raw.githubusercontent.com/Q00/ouroboros/main/docs/runtime-guides/codex.md>
- <https://raw.githubusercontent.com/Q00/ouroboros/main/docs/runtime-guides/opencode.md>
- <https://github.com/Q00/ouroboros/issues/58>
- <https://github.com/Q00/ouroboros/issues/173>
- <https://github.com/Q00/ouroboros/issues/181>
- <https://github.com/Q00/ouroboros/issues/387>
- <https://developers.googleblog.com/tailor-gemini-cli-to-your-workflow-with-hooks/>
