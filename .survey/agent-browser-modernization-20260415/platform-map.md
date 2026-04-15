# Platform Map: agent-browser modernization

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Browser runtime defaults | Claude Code settings can constrain tools, approvals, env, and sandbox posture | Codex profiles/settings govern approvals and runtime, but browser specifics are usually external | Gemini CLI settings/flags can set runtime defaults, though browser lifecycle is less opinionated | Keep `agent-browser` defaults about clean sessions, explicit verification, and artifact capture |
| Session persistence | Usually configured outside the core fresh-session lane | Usually external to native config | Usually external to native config | Treat persistent profiles/auth reuse as escalation, not default behavior |
| Output volume / artifacts | Settings can bound output and logging | Usually wrapper/tool controlled | Usually wrapper/tool controlled | Prefer explicit snapshots, traces, and screenshots only when needed |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| When to use `agent-browser` | `CLAUDE.md` can say: choose clean-session verification first | `AGENTS.md` can define fresh-session verification as the default browser lane | `GEMINI.md` can express the same routing | Repo rules should choose `agent-browser` only for clean reproducible verification |
| Route-outs | Route stateful browser reuse to `playwriter`, exact rendered feedback to `agentation` | Same | Same | Rules are the best place to keep boundary clarity |
| Evidence expectations | Require observe → act → observe and explicit verification notes | Same | Same | Verification artifacts should be part of the skill contract |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Pre-browser action | Claude Code hooks can enforce env vars, allowed domains, or artifact setup | Usually wrapper scripts / MCP / external enforcement | Usually wrapper scripts / MCP / external enforcement | Hooks are optional accelerators, not correctness requirements |
| Post-action verification | Claude hooks can capture traces/screenshots or assert policy | Usually wrapper/tool logic | Usually wrapper/tool logic | The skill should still work with rules + support files alone |
| Failure capture | Claude hooks can archive evidence automatically | Less standardized | Less standardized | Provide a script/checklist fallback instead of assuming hook parity |

## Platform Gaps
- Claude has the strongest native settings + rules + hooks separation.
- Codex and Gemini are good enough for settings/rules but weaker on first-class lifecycle hooks.
- No platform fully solves auth-heavy browser determinism; support files and route-outs still matter.
- The portable abstraction is: settings choose clean-session defaults, rules define when the skill applies, hooks optionally enforce artifacts or guardrails.
