# Platform Map: survey artifact-validator hardening

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Shared survey instructions | Project/global Claude Code settings exist, but the survey contract still belongs in repo-local files (`https://docs.anthropic.com/en/docs/claude-code/settings`) | Codex documents checked-in client config and instruction/config references (`https://developers.openai.com/codex/config-reference`, `https://developers.openai.com/codex/config-basic`) | Gemini CLI exposes settings/customization and repo-local docs (`https://raw.githubusercontent.com/google-gemini/gemini-cli/main/README.md`) | Keep the canonical survey contract in checked-in markdown, not in runtime-only config |
| Model / provider tuning | Supported through Claude settings surfaces | Supported through Codex config surfaces | Supported through Gemini settings/model selection surfaces | Not part of the survey artifact contract; treat as runtime detail |
| MCP / tool enablement | Team-shared settings and MCP/hook references exist in Claude docs | Codex config/reference docs include MCP and approval-related config surfaces | Gemini README/docs expose MCP integration | Useful acceleration, but optional to the survey output schema |
| Artifact output location | Can be configured/project-scoped, but files should still land in `.survey/{slug}/` | Same | Same | The filesystem artifact contract is the portability floor |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Permissions / approvals | Claude documents permissions modes and managed policies (`https://docs.anthropic.com/en/docs/claude-code/permissions`) | Codex documents approval and sandbox policies in config (`https://developers.openai.com/codex/config-reference`) | Gemini can restrict tools/subagents and still run post-step commands | Treat approvals/sandbox as runtime policy; the survey schema must work even in approval-heavy environments |
| Repo-local instructions as source of truth | Strong fit; Claude supports project guidance plus subagents/hooks | Strongly needed; Codex portability is most reliable when behavior is checked into the repo | Strong fit; Gemini also supports repo-local specialist docs | Keep repo-local `SKILL.md`/references authoritative, then wrap them with platform policy |
| Artifact validation | Easy to wrap with hooks or post-step commands | Best done as a normal command after generation rather than assuming hook parity | Easy to wrap with hooks or post-step commands | Ship one portable validator command that every runtime can invoke |
| Parallel research lanes | Claude supports subagents and hooks (`https://docs.anthropic.com/en/docs/claude-code/sub-agents`) | Do not assume first-class hook/subagent parity; keep artifact contract independent | Gemini documents subagents and hooks (`https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/core/subagents.md`, `https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/hooks/reference.md`) | Parallelism can vary; filenames and headings cannot |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Pre-research normalization | Can use hooks/prompts before execution (`https://docs.anthropic.com/en/docs/claude-code/hooks`) | Prefer explicit checked-in instructions and normal commands | Can use hook JSON handlers before execution (`https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/hooks/reference.md`) | Normalize topic/mode in the prompt or repo-local instructions first |
| Post-generation validation | Natural fit for a hook-backed validator | Better as an ordinary script/command after files are written | Natural fit for hook-backed validator or plain script | The validator must run without hook support |
| Error / downgrade handling | Hooks can label or intercept failures | Codex should fall back to explicit evidence labels in the written artifact | Gemini hooks can also enforce structured error handling | Evidence labels and artifact schema belong in files, not only in hooks |
| Lane worker orchestration | Claude subagents fit the 4-lane model well | Keep worker assumptions conservative and optional | Gemini subagents also fit the 4-lane model well | Worker shape can differ; output package must stay identical |

## Platform Gaps
1. Hook parity is uneven. Claude and Gemini have stronger documented hook/subagent surfaces than Codex, so validator logic must not depend on hook support.
2. Config richness is uneven. Codex has strong checked-in config and approval/sandbox documentation, but the survey contract should still be enforced by repo-local files plus a normal post-step command.
3. Parallel worker ergonomics differ. Claude and Gemini can map the 4-lane survey more directly onto subagents; Codex portability should treat that as optional.
4. Because runtime features differ, the durable common layer is: checked-in survey instructions, fixed markdown artifact headings, honest provenance labels, and one portable validator command.
5. The best portability upgrade is therefore not more vendor trivia in `SKILL.md`; it is a smaller front door plus a script that validates `.survey/{slug}/` outputs the same way everywhere.