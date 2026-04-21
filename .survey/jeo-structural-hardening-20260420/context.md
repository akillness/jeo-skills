# Context: jeo structural hardening

## Workflow Context
`jeo` already spans the full repo loop — planning, runtime handoff, browser QA, submit-gated UI review, cleanup, and durable state through `.jeo/` plus `.omc/state/jeo-state.json`. The hardening opportunity is not missing capability; it is sharper routing.

Real-world agent workflows cluster around the same four jobs:
1. integrated orchestration / delegation (`OpenHands` sub-agents, Claude subagents)
2. approval gates (Claude permission prompts, Codex approval modes)
3. resumable state (`claude --continue`, `codex resume`, OpenHands resume/persistence)
4. browser / UI verification loops (OpenHands BrowserToolSet and browser recordings, screenshot-guided verification in Codex)

That pattern argues for keeping `jeo` as a workflow router plus durable ledger contract while pushing runtime-native execution, hook wiring, and browser mechanics into sibling skills.

Sources:
- https://raw.githubusercontent.com/OpenHands/docs/main/sdk/guides/agent-delegation.mdx
- https://code.claude.com/docs/en/quickstart
- https://code.claude.com/docs/en/common-workflows
- https://developers.openai.com/codex/cli
- https://raw.githubusercontent.com/OpenHands/docs/main/openhands/usage/cli/resume.mdx
- https://raw.githubusercontent.com/OpenHands/docs/main/sdk/guides/agent-browser-use.mdx
- https://raw.githubusercontent.com/OpenHands/docs/main/sdk/guides/browser-session-recording.mdx
- /Users/jang_jennie/projects/oh-my-skills/.agent-skills/jeo/SKILL.md

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Solo agent operator | Resume work across sessions, preserve state, keep approval posture sane | Intermediate |
| Runtime-specific power user | Use Claude/Codex/Gemini/OpenCode native orchestration safely | Advanced |
| Frontend / browser verifier | Validate rendered behavior and collect UI evidence | Intermediate |
| Repo maintainer | Keep orchestration boundaries honest across `jeo`, `omc`, `omx`, `ohmg`, `plannotator`, `agent-browser`, and `agentation` | Advanced |

## Current Workarounds
1. Use runtime-native resume surfaces instead of one universal loop abstraction (`claude --continue`, `codex resume`, `openhands --resume`). Limitation: semantics differ by runtime, so a cross-platform front door can become misleading if it pretends parity.
2. Treat approval posture as a separate trust layer (`approval_policy`, confirmation/security analyzers) rather than something hidden inside planning text. Limitation: if `jeo` mixes policy and routing, it overlaps with runtime-native configuration and `ralphmode`.
3. Add browser tooling as a verification add-on rather than the orchestrator itself. Limitation: if `jeo` explains too much browser or annotation detail, it competes with `agent-browser` and `agentation`.
4. Use worktrees / parallel sessions for isolation. Limitation: this is runtime- and operator-specific, so it belongs in runtime references, not the cross-platform front door.

## Adjacent Problems
- Approval posture and orchestration get conflated easily; Codex and OpenHands both separate trust controls from task decomposition.
- Resumable state is product-specific; `jeo` should own the durable ledger contract but avoid pretending all machine-state paths are the same across runtimes.
- Browser verification and human-review evidence are separate jobs; the front door should decide when they are needed, then route them out.
- Subagent orchestration is adjacent but not identical to end-to-end delivery; bounded delegation patterns are cleaner than a giant all-in-one skill.

## User Voices
- Claude Code: “Claude Code always asks for permission before modifying files.”
  - https://code.claude.com/docs/en/quickstart
- Claude Code: “claude --continue continues the most recent conversation in the current directory.”
  - https://code.claude.com/docs/en/common-workflows
- Codex CLI: “Choose the approval mode that matches your comfort level before Codex edits or runs commands.”
  - https://developers.openai.com/codex/cli
- Codex CLI: “Attach screenshots or design specs so Codex reads them alongside your prompt.”
  - https://developers.openai.com/codex/cli
- OpenHands: “OpenHands CLI automatically saves your conversation history...”
  - https://raw.githubusercontent.com/OpenHands/docs/main/openhands/usage/cli/resume.mdx
- OpenHands: “Enable parallel task execution by delegating work to multiple sub-agents...”
  - https://raw.githubusercontent.com/OpenHands/docs/main/sdk/guides/agent-delegation.mdx
