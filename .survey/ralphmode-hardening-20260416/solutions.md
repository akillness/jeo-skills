# Solution Landscape: ralphmode hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Claude Code permission modes + hooks | Project/user settings with explicit permission modes, allow/deny rules, and `PreToolUse` / `PostToolUse` hooks | Strong native split between shared settings, local overrides, and dynamic pre-tool blocking | Full bypass is coarse; hook/bypass interactions can still surprise operators | Best native fit for dynamic safety checkpoints |
| Codex CLI approval policy + sandbox mode + trusted project config | `approval_policy`, `sandbox_mode`, trusted repo config, AGENTS.md instructions | Clean sandbox ladder; repo-local config is strong once the project is trusted | Pre-tool blocking is weaker; prompt contracts often do safety work that hooks handle elsewhere | Best fit for repo-safe vs sandbox-YOLO presets |
| Gemini CLI trusted folders + approval modes + hooks | Trusted folder gate, project settings, configurable approval mode, `BeforeTool` / `AfterTool` hooks | Strong trust gate; project settings are suppressed in untrusted folders; good hook surface | YOLO is CLI-only; shared-path access outside workspace can still be awkward | Strongest trust-gated repo-local model |
| OpenCode permissions/rules (comparative layer only) | Config merge + allow/ask/deny permissions + rules | Useful confirmatory comparison for settings/rules abstraction | Not the current target runtime for this skill; not a true sandbox analog | Helpful for boundary language, not for current compatibility scope |

## Categories
### Settings
- Project-local config
- Approval/autonomy mode presets
- Sandbox modes
- Trusted-folder or trusted-project loading

### Rules
- Secret/path denylist
- Destructive-command tiers
- Repo-only mutation scope
- Checkpoint contract for irreversible actions

### Hooks
- Claude `PreToolUse` / `PostToolUse`
- Gemini `BeforeTool` / `AfterTool`
- Codex post-turn notification or prompt-contract fallback

## What People Actually Use
Operators rarely want blanket global bypass. The practical stack is repo-local config + trust scope + sandbox-first preset + narrow allow-list + prompt contract, with pre-tool hooks added when the runtime supports them. Full bypass flags are used mostly as temporary escape hatches inside disposable containers, sandboxes, or worktrees.

## Frequency Ranking
1. Project-local config / settings layers
2. Approval/autonomy mode presets
3. Instruction/rules files and repo-local guardrails
4. Trust-gated project loading
5. Sandbox tiers for repo-safe vs disposable-sandbox runs
6. Pre-tool blocking hooks
7. Post-turn notifications / audit hooks

## Key Gaps
- `ralphmode` already has good platform notes, but it still lacks evals that freeze trigger quality and route boundaries.
- The portable `settings / rules / hooks` abstraction is present implicitly, not stated as the main mental model.
- Codex’s weaker pre-tool interception deserves clearer route-out language so users do not overread it as equivalent to Claude/Gemini hooks.

## Contradictions
- Marketed shorthand like “YOLO mode” sounds portable, but the underlying trust scope, hook surface, and sandbox semantics differ sharply by platform.
- Users often ask for a trusted-repo fast path, while official platforms still expose broad bypass switches that are riskier than the desired day-to-day mode.

## Key Insight
The best bounded improvement is not another permission-wrapper skill. It is hardening `ralphmode` in place around one portable model: **settings choose the preset, rules define the boundary, hooks enforce the dangerous edges where the platform supports it**. That framing transfers cleanly across Claude Code, Codex CLI, and Gemini CLI while still preserving platform-specific caveats.
