---
name: omc
description: >
  Route Claude Code–first orchestration to the right OMC surface before giving commands.
  Use when the user wants oh-my-claudecode / OMC in Claude Code, needs to choose
  between plugin slash skills and the `omc` shell CLI, or needs truthful guidance on
  `/team`, `/autopilot`, `/ralph`, `/ultrawork`, `omc setup`, `omc team`, `omc ask`,
  updates, plugin-dir behavior, worktree/state issues, HUD/hooks, or adjacent route-outs.
  Triggers on: omc, oh-my-claudecode, Claude Code team mode, autopilot, /team, ralph,
  ultrawork, CCG, omc team, omc ask, omc setup, OMC HUD, OMC hooks.
allowed-tools: Read Write Bash Grep Glob Edit Agent
metadata:
  tags: omc, oh-my-claudecode, claude-code, multi-agent, orchestration, team, autopilot, ralph, ultrawork, ccg, hooks, hud
  platforms: Claude Code
  keyword: omc
  version: 4.13.0
  source: Yeachan-Heo/oh-my-claudecode
---

# omc — Claude-first orchestration router for oh-my-claudecode

## When to use this skill

- The user wants **Claude Code–native orchestration** through OMC / oh-my-claudecode
- The user needs to choose between **plugin slash skills** and the **`omc` terminal CLI**
- The user asks about `/team`, `/autopilot`, `/ralph`, `/ultrawork`, `/deep-interview`, `omc team`, `omc ask`, `omc setup`, `omc update`, or OMC HUD/hooks behavior
- The user is hitting **setup drift**, **duplicate install paths**, **plugin-dir confusion**, **worktree/state collisions**, or **rate-limit / HUD / resume issues** in OMC
- The user really wants Claude-first orchestration, not a Codex-first (`omx`) or Gemini/portable-harness (`ohmg`) runtime

## Instructions

### Step 1: Classify the request into one packet first

Pick the smallest truthful packet before explaining commands:

1. **plugin-setup** — install or repair the Claude Code plugin surface
2. **in-session-runtime** — choose the right slash skill inside Claude Code
3. **terminal-runtime** — choose the right `omc ...` shell command
4. **recovery-and-update** — fix setup drift, state issues, plugin-dir duplication, or resume/HUD trouble
5. **boundary-and-route-out** — the user actually needs `jeo`, `ralphmode`, `plannotator`, browser-review skills, or another platform runtime

Lead with the packet name mentally, then give only the commands and caveats that fit that packet.

### Step 2: Tell the operator which surface they are on

OMC has **two different surfaces**. Do not collapse them into one mental model.

#### A. Plugin / in-session surface

Use this when the user is already **inside Claude Code** and wants slash skills, hooks, HUD, or native-team behavior.

Examples:

```text
/team 3:executor "fix all TypeScript errors"
/autopilot "build a REST API for managing tasks"
/ralph "keep going until the tests pass"
/ultrawork "parallelize this cleanup"
/deep-interview "help me clarify the feature"
```

This surface owns:
- slash skills
- hooks and HUD behavior
- native team orchestration inside Claude Code
- in-session execution keywords like `autopilot:` or `ralph:`

#### B. Terminal CLI surface

Use this when the user wants **shell-side setup, updates, provider consultation, tmux workers, or runtime management**.

Examples:

```bash
omc setup
omc update
omc ask codex "review this patch"
omc team 2:codex "review auth flow"
omc team status review-auth-flow
```

This surface owns:
- `omc setup` / `omc update`
- `omc ask`
- `omc team` tmux workers
- shell-side runtime management

Important truth:
- `/team` and `omc team` are both real, but they are **different runtimes**
- `/autopilot`, `/ralph`, and `/ultrawork` are **in-session skills**, not normal `omc` CLI subcommands
- the npm package name is **`oh-my-claude-sisyphus`**, not `oh-my-claudecode`

### Step 3: Use the right packet

#### Packet: plugin-setup

Use when the user needs installation, first-time setup, or a repair of the Claude Code plugin path.

Recommended plugin-first path:

```bash
/plugin marketplace add https://github.com/Yeachan-Heo/oh-my-claudecode
/plugin install oh-my-claudecode
```

Then run one setup entrypoint inside Claude Code:

```text
setup omc
```

or:

```text
/oh-my-claudecode:omc-setup
```

If the user also wants shell-side commands like `omc setup`, `omc update`, `omc ask`, or `omc team`, add the optional CLI install:

```bash
npm i -g oh-my-claude-sisyphus@latest
```

Enable native teams in `~/.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

If the user runs OMC via a local checkout or `--plugin-dir`, mention plugin-dir decisions and route them to [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md) and [references/cli-reference.md](references/cli-reference.md) instead of guessing a duplicate-install fix from memory.

#### Packet: in-session-runtime

Use when the user wants the best **Claude Code slash-skill** for the job.

Start with the smallest truthful recommendation:

| Need | Use | Why |
|------|-----|-----|
| Shared in-session multi-agent work | `/team ...` | Canonical Claude-native team workflow |
| End-to-end build from a fuzzy request | `/autopilot ...` or `autopilot: ...` | Single lead agent, idea → implementation |
| Must keep going until verified done | `/ralph ...` or `ralph: ...` | Persistent execute → verify → fix loop |
| Burst parallel work | `/ultrawork ...` or `ulw ...` | High parallelism without the full team workflow |
| Requirements clarification first | `/deep-interview ...` | Clarify before planning or execution |
| Cross-model synthesis | `ccg: ...` when upstream/runtime supports it | Claude + Codex + Gemini mixed workload path |

Do not dump all modes by default. Pick the one that matches the user's real task and mention only 1–2 nearby alternatives when they materially differ.

#### Packet: terminal-runtime

Use when the user wants the **shell CLI** rather than the in-session plugin surface.

Common mappings:

| Need | Use |
|------|-----|
| Initial shell-side install/repair | `omc setup` |
| Refresh after updates | `omc update` |
| Provider consultation | `omc ask <provider> "..."` |
| tmux-based worker teams | `omc team <N>:<provider> "<task>"` |
| Team runtime status | `omc team status <session>` |
| Team runtime shutdown | `omc team shutdown <session>` |

If the user says “team mode” but is already inside Claude Code, prefer `/team`.
If the user says “team mode” and clearly wants shell/tmux workers, prefer `omc team`.

#### Packet: recovery-and-update

Use when the job is not choosing a mode, but **repairing OMC**.

Common truth-first fixes:

- **Duplicate or conflicting install paths** → check whether plugin and CLI/local-checkout/plugin-dir installs are overlapping
- **Setup drift after upgrade** → rerun setup with the truthful current surface (`setup omc`, `/oh-my-claudecode:omc-setup`, or `omc update` / `omc setup` depending on the runtime)
- **Team mode not working** → verify `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`
- **Worktree/state weirdness** → inspect `.omc/state/`, team names, plugin-dir choices, and worktree-specific namespace behavior
- **HUD / rate-limit / ephemeral environment trouble** → treat it as environment/runtime recovery, not as a mode-selection question
- **Generated file confusion (`CLAUDE.md`, agents, hooks)** → prefer doctor/update/setup and source-backed plugin-dir guidance instead of ad hoc cleanup instructions

When the fix gets detailed, route to the relevant reference:
- [references/cli-reference.md](references/cli-reference.md)
- [references/hooks-reference.md](references/hooks-reference.md)
- [references/modes-reference.md](references/modes-reference.md)
- [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md)

#### Packet: boundary-and-route-out

Do not force OMC when another skill owns the job better.

Route out when:

- **long-lived plan / execution ledger, resumable delivery loop, multi-skill coordination** → `jeo`
- **spec-first persistence and keep-going-until-verified method beyond OMC runtime detail** → `ralph`
- **approval posture, permissions, trusted-folder / bypass policy** → `ralphmode`
- **plan review / approval gate** → `plannotator`
- **fresh-session browser verification** → `agent-browser`
- **running authenticated browser reuse** → `playwriter`
- **exact rendered-UI critique / annotation handoff** → `agentation`
- **Codex-first runtime orchestration** → `omx`
- **Gemini / Antigravity portable harness adoption** → `ohmg`

### Step 4: Keep the answer truthful about volatility

OMC is a fast-moving upstream project. Prefer:
- current surface distinctions
- current install/setup commands
- current route-outs
- reference docs for deeper operator detail

Avoid:
- pretending all commands live on one surface
- treating `/team` and `omc team` as interchangeable
- claiming there is a general `omc autopilot` CLI when the real runtime is in-session
- copying giant keyword tables when one mode recommendation is enough
- absorbing browser review, approval, or cross-platform orchestration into OMC

## Examples

### Example 1: Claude Code team orchestration
**User:** "Claude Code에서 여러 에이전트가 같이 작업하게 하고 싶어"

**Response:** Use the **in-session-runtime** packet. Recommend `/team 3:executor "..."` if they are already inside Claude Code. Mention `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` if native teams are not enabled yet.

### Example 2: Shell-side worker team
**User:** "tmux로 codex 두 명 붙여서 리뷰 돌리고 싶어"

**Response:** Use the **terminal-runtime** packet. Recommend `omc team 2:codex "review auth flow"`, then mention `omc team status <session>` for monitoring.

### Example 3: First install
**User:** "OMC 설치하고 setup까지 하고 싶어"

**Response:** Use the **plugin-setup** packet. Give plugin install first, then `setup omc` or `/oh-my-claudecode:omc-setup`, then optionally `npm i -g oh-my-claude-sisyphus@latest` if they also want shell-side `omc` commands.

### Example 4: Persistent delivery loop, not runtime setup
**User:** "기획부터 실행, 검증, 재개까지 하나의 장기 루프로 굴리고 싶어"

**Response:** Use the **boundary-and-route-out** packet. Route to `jeo` as the long-loop coordination layer, and mention OMC only as the Claude-first runtime that `jeo` may compose with.

### Example 5: OMC keeps behaving strangely after upgrade
**User:** "업데이트 후에 팀 명령이 꼬였고 worktree에서도 상태가 이상해"

**Response:** Use the **recovery-and-update** packet. Tell them to inspect the runtime surface, rerun the correct update/setup path, verify team env/settings, and review plugin-dir/state/worktree behavior rather than switching modes blindly.

## Best practices

1. Start by naming the **packet** and **surface** before giving commands.
2. Prefer one recommended mode plus one nearby alternative, not a giant catalog dump.
3. Treat `/team` and `omc team` as related but different runtimes.
4. Keep the npm/package-name mismatch explicit: `oh-my-claude-sisyphus` provides the `omc` CLI.
5. Mention native-team setup only when team-mode success depends on it.
6. Route long-lived orchestration, approvals, browser review, and other platform runtimes outward instead of stretching OMC.
7. Use references for volatile operator detail; keep the front door focused on correct routing.

## References

- [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md)
- [references/modes-reference.md](references/modes-reference.md)
- [references/hooks-reference.md](references/hooks-reference.md)
- [references/cli-reference.md](references/cli-reference.md)
- [references/agents-catalog.md](references/agents-catalog.md)
