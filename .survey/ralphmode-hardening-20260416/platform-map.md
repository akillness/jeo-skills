# Platform Map: ralphmode hardening

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Primary user config | `~/.claude/settings.json` | `~/.codex/config.toml` | `~/.gemini/settings.json` | User defaults |
| Repo-local config | `.claude/settings.json` / `.claude/settings.local.json` | `.codex/config.toml` (trusted project) | `.gemini/settings.json` (trusted folder) | Project-local preset |
| Autonomy knobs | permission modes + allow/deny lists | `approval_policy` + `sandbox_mode` | `general.defaultApprovalMode` + CLI-only `--yolo` | Low-friction vs sandbox-YOLO preset |
| Trust boundary | settings precedence + managed policy | trusted project gates project config | trusted folders gate local config/features | repo boundary / trust scope |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Secret/path denylist | native allow/deny rules | instructions + sandbox + approval policy | policy engine + trusted-folder safe mode | deny secrets and off-repo mutation |
| Destructive commands | denylist + optional hook block | approval policy + prompt contract | policy rules + optional hook block | Tier 1 checkpoint boundary |
| Repo instructions | shared settings / CLAUDE.md | `AGENTS.md` chain | system/workspace policy files | repo-local operating contract |
| Safe everyday mode | `acceptEdits` / repo-safe profile | `workspace-write` + non-bypass approval policy | trusted folder + `auto_edit` / default mode | normal trusted-repo automation |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Pre-tool blocking | `PreToolUse` | weak / not equivalent in the stable surfaced docs | `BeforeTool`, `BeforeToolSelection` | `before_tool` when supported |
| Post-tool / post-turn | `PostToolUse`, `Stop` | `notify` and post-turn signaling | `AfterTool`, `AfterAgent`, notifications | audit / notify layer |
| Best ralphmode stance | hook-backed dynamic checkpointing | approval + sandbox + prompt-contract fallback | hook-backed dynamic checkpointing | degrade gracefully by platform |

## Platform Gaps
- Pre-tool blocking is strong in Claude and Gemini, but not equivalent in Codex; `ralphmode` should not imply parity where it does not exist.
- Trust gating is explicit in Gemini and Codex, but more precedence-driven in Claude.
- Full bypass semantics are inconsistent: Claude `bypassPermissions`, Codex dangerous bypass / `danger-full-access`, Gemini CLI-only `--yolo`.
- OpenCode is useful as a comparative settings/rules reference, but it does not currently justify expanding `ralphmode` compatibility beyond Claude Code, Codex CLI, and Gemini CLI.

## Source links
- Claude settings/hooks: https://docs.anthropic.com/en/docs/claude-code/settings , https://docs.anthropic.com/en/docs/claude-code/hooks
- Codex config + AGENTS docs: https://developers.openai.com/codex/config-reference , https://developers.openai.com/codex/guides/agents-md , https://github.com/openai/codex/blob/main/docs/sandbox.md
- Gemini settings/trust/hooks: https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md , https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/trusted-folders.md , https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/index.md
- OpenCode comparative docs: https://opencode.ai/docs/config/ , https://opencode.ai/docs/permissions/
