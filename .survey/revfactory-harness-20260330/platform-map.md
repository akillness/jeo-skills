# Platform Map

## Source → Target Map

| Source concept | Claude Code | Codex CLI | Gemini / Antigravity | OpenCode / Pi / Claw |
|---|---|---|---|---|
| Agent definitions | `.claude/agents/` | `.codex/agents/` or prompt roles | platform-specific agent roles | equivalent prompt/role files |
| Skill definitions | `.claude/skills/` | `.codex/skills/` | skill / guide layer | equivalent skill docs |
| Orchestrator | plugin skill / team skill | skill + orchestration docs | Antigravity team/workflow guide | equivalent orchestration prompt |
| Validation | trigger tests + dry run | trigger tests + repo checks | trigger tests + workflow checks | trigger tests + smoke examples |

## Platform Gaps

- Upstream Harness is Claude Code oriented.
- `oh-my-skills` needs a cross-platform adapter description instead of a Claude-only wrapper.
- The new skill should explain how to translate Harness concepts, not pretend every platform has identical filesystem conventions.
