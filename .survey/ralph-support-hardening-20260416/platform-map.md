# Platform Map: ralph support hardening

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Activation surface | Skills system + hooks | prompt file / conversation contract + config | hooks + trusted-folder config | start from explicit repo-scoped setup |
| State persistence | hook-driven continuation + state file | manual/bash-assisted continuation + state file | AfterAgent hook + state file | durable loop state outside chat history |
| Install/setup examples | repo skill path + plugin option | repo skill path + setup script | repo skill path + hook script | examples must point at the live `ralph` skill directory |
| Definition of done | completion promise + verification | completion promise + verification | completion promise + verification | done means verified, not merely “agent stopped” |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Spec freeze | interview → seed before run | same conceptual contract | same conceptual contract | immutable seed / acceptance criteria |
| Runtime boundary | `ralph` should not absorb Claude runtime ownership from `omc` | `ralph` should not absorb Codex runtime ownership from `omx` | `ralph` should not absorb Gemini portable-harness ownership from `ohmg` | `ralph` owns method + loop, not platform runtime |
| Approval / permissions | pair with `ralphmode` when lowering friction | pair with `ralphmode` or repo policy | pair with trusted-folder / hook safeguards | settings/rules/hooks layer stays separate from `ralph` |
| Review gate | route visual plan approval to `plannotator` | same | same | approval remains a neighboring layer |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Before execution | repo instructions + optional hook-backed policy | repo instructions / prompt contract | trusted-folder + hook policy | carry the spec and boundary outside chat memory |
| After agent turn | hook-friendly continuation | manual or prompt-mediated continuation | AfterAgent continuation | persistent loop control |
| Verification handoff | explicit evaluate / repo checks | explicit evaluate / repo checks | explicit evaluate / repo checks | verify before declaring completion |

## Platform Gaps
- Claude and Gemini expose stronger hook-native continuation than Codex, so `ralph` examples should not imply equal automation mechanics everywhere.
- `ralph` is portable as a method, but setup instructions remain platform-specific enough that stale path examples are a real usability bug.
- Runtime ownership is already covered by `omc`, `omx`, and `ohmg`; `ralph` should stay the canonical spec-first method and persistent completion surface.

## Source links
- Local: `.agent-skills/ralph/SKILL.md`, `.agent-skills/ralph/references/platform-setup.md`, `.agent-skills/ralphmode/SKILL.md`
- Claude hooks/settings: https://docs.anthropic.com/en/docs/claude-code/hooks
- Codex AGENTS/config: https://developers.openai.com/codex/guides/agents-md
- Gemini hooks/config: https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/index.md
