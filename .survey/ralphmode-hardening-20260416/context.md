# Context: ralphmode hardening

## Workflow Context
Approval-friction problems show up when operators trust a repo enough to let an agent iterate on local code, but still need boundaries around secrets, destructive shell, and production-facing actions. Claude Code exposes explicit permission modes and a bypass path; Codex CLI separates approval policy, sandbox mode, and trust gating for project config; Gemini CLI combines trusted folders, configurable approval modes, and CLI-only YOLO. Across all three, the recurring operational need is the same: make normal repo work low-friction without turning the whole machine into an always-allow sandbox.

Sources:
- Claude Code security/settings docs: https://code.claude.com/docs/en/security , https://docs.anthropic.com/en/docs/claude-code/settings
- Codex repo docs: https://github.com/openai/codex/blob/main/docs/config.md , https://github.com/openai/codex/blob/main/docs/sandbox.md
- Gemini CLI docs: https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/trusted-folders.md , https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Solo AI coding-agent operator | Keep day-to-day repo work moving without constant edit/command approvals | Intermediate |
| Team maintainer / tech lead | Define a reusable permission posture teammates can apply repo-locally | Advanced |
| Headless automation / cron user | Avoid trust dialogs or approval interruptions that break unattended runs | Advanced |
| Sandbox / container user | Distinguish disposable-environment YOLO from normal trusted-repo work | Intermediate |

## Current Workarounds
1. Trust the repo or parent folder explicitly, especially in Gemini CLI and Codex trusted-project flows.
2. Keep autonomy project-local instead of global: `.claude/settings.json`, `.codex/config.toml`, `.gemini/settings.json`.
3. Use sandbox-first profiles (`workspace-write`, trusted-folder + auto-edit, `acceptEdits`) for normal work and reserve full bypass / YOLO for disposable environments.
4. Add narrow allow-lists for repetitive safe actions like `git status`, `git diff`, local tests, and local builds.
5. Layer prompt contracts or repo instruction files (`CLAUDE.md`, `AGENTS.md`, system/developer instructions) so the agent pauses before Tier 1 actions.
6. Use pre-tool hooks where available to reintroduce dynamic blocking for destructive or secret-touching commands.

## Adjacent Problems
- Trust scopes differ by platform, so the same operator intent maps to different settings, approval modes, and repo-local load rules.
- Bypass modes are coarse; users often want “trusted repo” rather than “disable everything.”
- Hook systems are not universal, so Codex-style flows rely more on policy + prompt contracts than true pre-tool blocking.
- Shared config or memory outside the workspace can clash with strict repo boundaries even when the broader folder is trusted.
- Permission-rule bugs or drift create real operator confusion because allow-list behavior is easy to misread.

## User Voices
- "Please add a supported option to disable the edit review/apply confirmation UI for trusted repos/projects..." — Codex user asking for trusted-repo fast paths instead of repetitive edit confirmation. https://github.com/openai/codex/issues/17028
- "That defeats the purpose of using the `--dangerously-bypass-approvals-and-sandbox` option... I create a new temporary directory... registering every possible directories... is not feasible." — Codex user on ephemeral container workflows. https://github.com/openai/codex/issues/14345
- "Yolo mode should trust by default..." — Gemini CLI user describing headless/non-interactive friction in untrusted folders. https://github.com/google-gemini/gemini-cli/issues/18776
- "The bypass is silent — the user has no opportunity to approve or deny it..." — Claude Code user reporting unsafe/unclear bypass behavior. https://github.com/anthropics/claude-code/issues/34315
