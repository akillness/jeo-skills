# Platform Map: playwriter modernization

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Integration transport | MCP server / tool bridge | MCP server / tool bridge | MCP server / tool bridge | `transport` = `mcp_stdio` / `mcp_http` / other bridge |
| Browser runtime choice | Can consume tool output from Playwriter, fresh browser tools, or cloud browser tools | Same | Same | `runtime` = `existing_browser | fresh_browser | cloud_browser | mcp_tool` |
| Session persistence | Depends on underlying server/tool | Same | Same | `state_scope` = `user_profile | isolated_context | ephemeral_session` |
| Auth mode | Delegated to browser tool / server | Same | Same | `login_mode` = `reuse | seeded_state | scripted | manual_handoff` |
| Artifact capture | Depends on tool/server | Same | Same | `artifact_level` = `none | screenshot | trace | video | har` |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| When to prefer Playwriter | When the task needs a real logged-in Chrome session, existing extensions, or live-tab continuity | Same | Same | Existing-browser mode is privileged and explicit |
| When not to prefer Playwriter | When reproducibility, isolation, or CI-style repeatability is more important than session reuse | Same | Same | Route to fresh-session browser tools |
| Safety boundary | Treat running-browser attach as access to real user data; capture artifacts carefully | Same | Same | Existing-browser attach requires stronger warning / scoping |
| Determinism expectations | Lower than clean browser sessions because humans and extensions can mutate state | Same | Same | Skill must set expectations, not promise CI-grade reproducibility |
| Auth expectations | Human handoff and session reuse are normal, not failure | Same | Same | Make auth mode explicit rather than implying full autonomy |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Preflight | Connect MCP/tool, verify session/runtime | Same | Same | Resolve runtime, policy, and artifacts before actions |
| Session init | Attach to running browser or create fresh session via tool | Same | Same | `session_init(runtime, transport, state_scope)` |
| Before action | Snapshot page / tab / route | Same | Same | Observe → act → observe guardrail |
| After action | Capture snapshot/screenshot/logs | Same | Same | Emit structured evidence artifacts |
| Error hook | Distinguish transport failure, stale session, selector/UI issue, or policy denial | Same | Same | Standard error taxonomy matters more than vendor-specific wording |
| Teardown | Detach without killing the user’s browser by default | Same | Same | Existing-browser mode should detach cleanly; fresh sessions can close fully |

## Platform Gaps
- MCP is an integration layer, not a browser runtime standard; each browser server still defines its own tools and safety semantics.
- Existing-browser attach has the clearest value proposition for authenticated workflows, but the weakest portability and reproducibility story.
- Fresh-session browser tools are better for repeatable tests and isolated automation, but not for “continue inside my already-open browser” workflows.
- The repo needs `playwriter` to own the **running-browser** lane clearly so it does not blur into `agent-browser` or generic Playwright/browser-agent wrappers.

## Sources
- https://raw.githubusercontent.com/remorses/playwriter/main/README.md
- https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp
- https://playwright.dev/docs/auth
- https://modelcontextprotocol.io/introduction
- https://docs.anthropic.com/en/docs/agents-and-tools/mcp
- https://developers.openai.com/codex/mcp
- https://ai.google.dev/gemini-api/docs/model-context-protocol
