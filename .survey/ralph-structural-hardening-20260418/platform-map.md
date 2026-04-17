# Platform Map: ralph structural hardening

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Runtime config | Claude settings / hook config / agent-team env | `~/.codex/config.toml`, profiles, `.codex/hooks.json` | `settings.json`, trusted folders, `hooksConfig.enabled` | `ralph` should not own platform config syntax |
| Model / reasoning tuning | Claude runtime + OMC | Codex profile/provider tuning + OMX | Gemini runtime + OHMG projection | `ralph` owns spec/verification thresholds, not provider knobs |
| Persistence storage | Runtime / repo state and OMC-led files | Runtime / repo state plus OMX conventions | Runtime / repo state plus hook/trust settings | `ralph` owns the completion contract, not storage implementation details |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Start condition | Plan/spec can feed OMC execution | `$plan` often gates `$ralph` | Harness projection then runtime execution | `ralph` owns interview → seed → evaluate discipline |
| Safety / approvals | Claude permissions + OMC runtime policy | Codex approvals, sandbox, `.rules` | Trusted-folder policy + Gemini approvals | `ralphmode` owns permission posture; `ralph` should only route to it |
| Boundary owner | OMC owns Claude-native execution | OMX owns Codex-native execution and hook-aware runtime behavior | OHMG owns harness projection; Gemini owns hook runtime | `ralph` stays the portable method anchor |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Start / prompt | Native hook surfaces available | Native experimental hooks now available | Native hooks available | `ralph` should describe the need for continuation, not implement every runtime hook inline |
| Post-turn continuation | Claude hooks + OMC runtime | Codex hooks or fallback/manual prompt loop | AfterAgent hook path | Runtime-specific surfaces own concrete hook JSON and scripts |
| Stop / completion | Runtime hooks + verification gates | Hook or promise-based fallback | Hook + promise / state checks | `ralph` owns verified completion semantics |

## Platform Gaps
- Codex docs have advanced faster than repo-local `ralph` guidance; local docs still overstate compensation-only mode.
- Claude has the richest hook surface, but that detail belongs in runtime-specific docs rather than the core `ralph` front door.
- Gemini remains the cleanest fit for classic after-agent continuation, but trust-folder rules still belong outside `ralph`.
- The clean abstraction is: `ralph` = method contract; `omc` / `omx` / `ohmg` = runtime adapters; `ralphmode` = permission profile; `jeo` = integrated delivery router.

## Sources
- `.agent-skills/ralph/SKILL.md`
- `.agent-skills/omc/SKILL.md`
- `.agent-skills/omx/SKILL.md`
- `.agent-skills/ohmg/SKILL.md`
- `.agent-skills/ralphmode/SKILL.md`
- `.agent-skills/survey/SKILL.md`
- <https://code.claude.com/docs/en/settings>
- <https://code.claude.com/docs/en/hooks>
- <https://developers.openai.com/codex/config-basic>
- <https://developers.openai.com/codex/config-advanced>
- <https://developers.openai.com/codex/hooks>
- <https://developers.openai.com/codex/rules>
- <https://developers.openai.com/codex/agent-approvals-security>
- <https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/cli/settings.md>
- <https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/hooks/reference.md>
- <https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/cli/trusted-folders.md>
