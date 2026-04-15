# Platform Map: agentation modernization

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| MCP server registration | `claude mcp add ...` or `npx add-mcp` | Codex MCP config or `npx add-mcp` | Gemini MCP config or `npx add-mcp` | MCP server registration |
| Project vs global config | `.claude/` or home config | `~/.codex/` / project config | `~/.gemini/` / project config | choose project-local vs global install |
| Review mode selection | copy-paste, watch loop, or self-driving | same | same | annotation mode selection |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Use `agentation` only when exact rendered-UI feedback matters | yes | yes | yes | UI annotation routing |
| Route plan/diff review to `plannotator` | yes | yes | yes | review-boundary rule |
| Route fresh-browser verification to `agent-browser` | yes | yes | yes | browser-boundary rule |
| Route running-browser / logged-in reuse to `playwriter` | yes | yes | yes | browser-runtime rule |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Auto-inject pending annotations | `UserPromptSubmit` hook | config / prompt injection workflow | hook or post-agent callback | annotation-to-context handoff |
| Watch-loop execution | MCP polling / loop tooling | same | same | watch-loop automation |
| Self-driving critique | pair with browser tool + agent loop | same | same | browser-review-to-fix loop |

## Platform Gaps
- `agentation` advertises broader platform reach than the repo's core four-platform framing, so detailed setup belongs in support references rather than the main SKILL body.
- The cross-platform abstraction aligns cleanly: **settings** choose how the server/config is registered, **rules** decide when `agentation` is the right tool, and **hooks** decide how pending annotations enter the agent loop.
