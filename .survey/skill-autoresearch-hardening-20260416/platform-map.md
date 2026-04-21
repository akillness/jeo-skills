# Platform Map: skill-autoresearch hardening

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Persistent project config | `.claude/settings.json`, `.claude/settings.local.json`, `~/.claude/settings.json` | `.codex/config.toml`, `~/.codex/config.toml`, profiles | `~/.gemini/settings.json` plus `GEMINI.md` hierarchy | Keep the eval protocol and artifact paths inside repo files so the workflow survives platform differences |
| Reusable workflow surface | Skills + subagents | Skills + `AGENTS.md` + subagents | `GEMINI.md`, commands, extensions | `SKILL.md`, references, evals, and repo survey artifacts remain the portable source of truth |
| Persistence of run context | Strong repo/user layering | Strong config + history persistence | Strong context hierarchy, weaker surfaced policy layering | Store baselines, changelog, results, and dashboards as repo artifacts |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Tool/file guardrails | Mature permission and sandbox rules in settings | `AGENTS.md` + `.rules` execution policy | Mostly `GEMINI.md` + sandbox/trust controls | Write explicit mutation boundaries into the skill itself: target files, forbidden edits, destructive-action bans |
| Eval-run discipline | Can be reinforced with project rules and hooks | Can be reinforced with `.rules` and instructions | More manual / instruction-driven | Freeze evaluator, test set, and budget in a repo-local charter rather than trusting platform defaults |
| Publish/destructive controls | Strong pre-tool denial path | Good policy layer, but hook surface is newer | Runtime prompts / sandbox expansion | The skill should forbid deploy/publish/secret changes during optimization loops by default |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Pre-tool enforcement | First-class hooks (`PreToolUse`, etc.) | Experimental hooks via `hooks.json` | No equally strong public hook surface recovered in this survey | Treat hooks as optional accelerators, not core correctness |
| Post-edit validation | Easy to auto-run validation hooks | Possible, but newer/experimental | More manual wrapper behavior | Keep validation commands explicit in the skill and eval artifacts |
| Stop/report hook | Strong support for stop/session/task hooks | `Stop` hook exists experimentally | Less clearly documented | Always write append-only run logs and final summaries to repo artifacts |

## Platform Gaps
- No platform offers a native cross-runtime “run N evals, mutate one thing, keep only improvements” primitive.
- Claude has the strongest hook model; Codex has the strongest declarative command-policy layer; Gemini has strong persistent context but weaker surfaced rule/hook separation.
- Because platform guardrails differ, `skill-autoresearch` should remain repo-artifact-centric: explicit charter, frozen evaluation harness, append-only log, and deterministic keep/revert rules.
- Portable skill optimization should assume the core loop lives in markdown + repo files first, with platform hooks only providing optional guardrails or automation.

## Sources
- Claude settings: https://docs.anthropic.com/en/docs/claude-code/settings
- Claude hooks: https://docs.anthropic.com/en/docs/claude-code/hooks
- Claude subagents: https://docs.anthropic.com/en/docs/claude-code/sub-agents
- Codex customization: https://developers.openai.com/codex/concepts/customization
- Codex config/basic: https://developers.openai.com/codex/config-basic
- Codex config/advanced: https://developers.openai.com/codex/config-advanced
- Codex rules: https://developers.openai.com/codex/rules
- Codex hooks: https://developers.openai.com/codex/hooks
- Gemini CLI repo/docs: https://github.com/google-gemini/gemini-cli
- GEMINI.md docs: https://geminicli.com/docs/cli/gemini-md/
- Gemini sandbox docs: https://geminicli.com/docs/cli/sandbox/
