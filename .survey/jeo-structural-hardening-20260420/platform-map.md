# Platform Map: jeo structural hardening

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Persistent runtime config | `.claude/settings*.json` | `~/.codex/config.toml` profiles and overrides | `.gemini/settings.json` | Runtime-specific settings belong in runtime skills; `jeo` should only name the required capability |
| Repo instruction surface | Claude settings + repo docs | `AGENTS.md`, config instruction fields | `GEMINI.md` hierarchy | `jeo` should rely on repo-local intent and route runtime-specific instruction plumbing out |
| Approval defaults | Claude permission modes | `approval_policy`, `sandbox_mode` | `general.defaultApprovalMode`, Plan Mode approvals | Keep trust posture out of `jeo` except for abstract gate requirements |
| MCP / tool registration | `mcpServers` in Claude settings | `mcp_servers` in Codex config | `mcpServers` in Gemini settings | `jeo` should not duplicate MCP setup docs already owned by runtime skills |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Plan-before-execute | Can use native hooks and plan mode patterns | Often better expressed through runtime handoff and config/approval posture | Plan Mode + hookable lifecycle | Keep the invariant in `jeo`; let runtime skills implement it truthfully |
| Resume semantics | Claude-native continue/resume plus repo state | `codex resume` and config-driven runtime behavior | checkpointing and restore flows | `jeo` should own shared resume contract, not pretend identical machine-state semantics |
| Approval / safety | Permission hooks and runtime rules | sandbox + approval policy | approval mode + policy layers | Abstract rule belongs in `jeo`; policy implementation belongs in runtime skills or `ralphmode` |
| QA evidence before completion | Record evidence, optionally via browser / annotation route-outs | Same requirement, different runtime mechanics | Same requirement, different runtime mechanics | Shared invariant belongs in `jeo` |
| Browser / UI review requirement | Route to `agent-browser` / `agentation` | Route to `agent-browser` / `agentation` | Route to `agent-browser` / `agentation` | Shared route-out rule belongs in `jeo` |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Plan gate | Rich lifecycle hooks and submission events | Public docs emphasize config/runtime controls more than rich hook choreography | Hook groups plus Plan Mode | `jeo` should declare the gate, not implement every runtime’s hook plumbing |
| Submit gate for UI review | Native submit-style event surfaces possible | May require blocking/manual/runtime-specific fallback | Hookable lifecycle + fallback path | Keep abstract gate in `jeo`, concrete implementation in runtime/browser skills |
| Resume checkpoint | Hookable stop/subagent lifecycle | Runtime/profile-driven continuation | checkpointing + hooks | `jeo` should require checkpoint updates, not own vendor event names |
| Notifications / post-run handling | Hook/event-rich | lighter documented operator hook surface | hook groups and after-agent behavior | Normalize as “post-run hook exists when supported; otherwise fallback manually” |

## Platform Gaps
- Claude, Codex, and Gemini are not symmetric. `jeo` should normalize parity at the rule layer, not force parity at the hook layer.
- Codex is the sharpest parity risk: it clearly exposes config, approval, sandbox, and resume surfaces, but public operator docs are less centered on hook-rich lifecycle orchestration than Claude/Gemini.
- Browser verification and annotation loops are distinct domains; `jeo` should decide when they are needed, then route to `agent-browser` and `agentation`.
- Durable human ledger state is cross-platform, but runtime machine state is not. `jeo` should keep the ledger contract central while routing runtime-state implementation details to runtime-specific skills.
- The current structural gap is that `jeo` still combines “router” and “runtime.” The cleaner map is: thin `jeo` front door + runtime skills (`omc`, `omx`, `ohmg`) + adjacent workflow skills (`ralph`, `plannotator`, `agent-browser`, `agentation`).

Sources:
- https://github.com/akillness/oh-my-skills/blob/main/.agent-skills/jeo/SKILL.md
- https://github.com/akillness/oh-my-skills/blob/main/.agent-skills/jeo/references/PLATFORM_SETUP.md
- https://github.com/akillness/oh-my-skills/blob/main/.agent-skills/jeo/references/FLOW.md
- https://github.com/akillness/oh-my-skills/blob/main/.agent-skills/omc/SKILL.md
- https://github.com/akillness/oh-my-skills/blob/main/.agent-skills/omx/SKILL.md
- https://github.com/akillness/oh-my-skills/blob/main/.agent-skills/ohmg/SKILL.md
- https://docs.anthropic.com/en/docs/claude-code/settings
- https://docs.anthropic.com/en/docs/claude-code/hooks
- https://github.com/openai/codex/blob/main/docs/config.md
- https://github.com/openai/codex/blob/main/codex-rs/core/config.schema.json
- https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md
- https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/index.md
- https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md
- https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/gemini-md.md
