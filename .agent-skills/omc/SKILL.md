---
name: omc
description: >
  Route Claude Code–first orchestration to the truthful OMC install topology and runtime
  before giving commands. Use when the user wants oh-my-claudecode / OMC in Claude Code,
  needs to choose between marketplace plugin, shell-side `omc` CLI, or local-checkout
  `--plugin-dir` usage, or needs accurate guidance on `/team`, `/autopilot`, `/ralph`,
  `/ultrawork`, `/ultraqa`, `omc setup`, `omc team`, `omc ask`, updates, HUD/hooks,
  duplicate installs, worktree/state drift, or mapping Claude workflows to Codex/OMX
  and Gemini/Antigravity/OMA. Triggers on: omc, oh-my-claudecode, Claude Code team
  mode, autopilot, /team, ralph, ultrawork, ultraqa, ccg, omc team, omc ask, omc setup,
  plugin-dir, OMC HUD, OMC hooks.
allowed-tools: Read Write Bash Grep Glob Edit Agent
metadata:
  tags: omc, oh-my-claudecode, claude-code, multi-agent, orchestration, team, autopilot, ralph, ultrawork, ultraqa, ccg, hooks, hud, omx, oma, antigravity
  platforms: Claude Code
  keyword: omc
  version: 4.14.7
  source: Yeachan-Heo/oh-my-claudecode
---

# omc — Claude-first topology-aware router for oh-my-claudecode

## When to use this skill

- The user wants **Claude Code–native orchestration** through OMC / oh-my-claudecode
- The user needs to choose between the **marketplace plugin**, the **`omc` shell CLI**, or a **local checkout / `--plugin-dir`** workflow
- The user asks about `/team`, `/autopilot`, `/ralph`, `/ultrawork`, `/ultraqa`, `omc team`, `omc ask`, `omc setup`, `omc update`, hooks, HUD, or OMC state behavior
- The user asks how Claude workflows such as `/team`, `/autopilot`, `/ultrawork`, or `/ultraqa` map to Codex/OMX or Gemini/Antigravity/OMA
- The user is hitting **duplicate installs**, **plugin-dir confusion**, **worktree/state collisions**, **setup drift**, or **HUD / rate-limit / resume trouble**
- The user really wants a **Claude-first runtime owner**, not `jeo`, `ralphmode`, `omx`, `ohmg`, or browser-review skills

## Instructions

### Step 1: Identify the install topology before the packet

Before suggesting commands, identify which OMC topology the operator is actually using:

1. **marketplace-plugin** — Claude Code plugin / slash-skill surface installed from the marketplace
2. **shell-cli** — npm-installed `omc` command for shell-side setup, tmux workers, or provider asks
3. **local-plugin-dir** — local checkout / `--plugin-dir` / `OMC_PLUGIN_ROOT` workflow
4. **mixed-or-unknown** — overlapping plugin + CLI + local checkout, duplicate commands, or unclear setup state

If the topology is `mixed-or-unknown`, prefer recovery and topology clarification before recommending more commands.

### Step 2: Pick one request packet

After topology is clear enough, classify the actual job into one packet:

1. **install-topology** — install, first-run setup, or local-checkout / plugin-dir decisions
2. **in-session-runtime** — choose the right slash skill inside Claude Code
3. **terminal-runtime** — choose the right `omc ...` shell command
4. **recovery-and-update** — fix duplicate installs, setup drift, worktree/state trouble, HUD/hooks, or resume issues
5. **cross-runtime-parity** — map Claude slash workflows to OMX or OMA without pretending the runtimes are identical
6. **boundary-and-route-out** — the request really belongs to `jeo`, `ralphmode`, `plannotator`, browser-review skills, or another runtime

Lead with the topology and packet mentally, then give only the commands that fit that combination.

### Step 3: Tell the operator which surface they are on

OMC has **two real runtime surfaces**. Do not flatten them.

#### A. Claude Code plugin / in-session surface

Use this when the user is already **inside Claude Code** and wants slash skills, hooks, HUD, or native team behavior.

Examples:

```text
/team 3:executor "fix all TypeScript errors"
/autopilot "build a REST API for tasks"
/ralph "keep going until verified done"
/ultrawork "parallelize this cleanup"
/deep-interview "help me clarify the feature"
```

This surface owns:
- slash skills
- hooks and HUD behavior
- native team orchestration inside Claude Code
- in-session keywords like `autopilot:` or `ralph:`

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
- `/team` and `omc team` are **different runtimes**
- `/autopilot`, `/ralph`, and `/ultrawork` are **in-session skills**, not normal `omc` CLI subcommands
- the npm package name is **`oh-my-claude-sisyphus`**, not `oh-my-claudecode`

### Step 4: Use the right topology + packet pair

#### Packet: install-topology

Use when the user needs installation, setup, or topology cleanup.

**marketplace-plugin**

Inside Claude Code:

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

**shell-cli**

If they also want `omc` shell commands:

```bash
npm i -g oh-my-claude-sisyphus@latest
```

**local-plugin-dir**

Do not pretend the marketplace flow is enough. Point them to the plugin-dir / local-checkout path and the dedicated reference before improvising cleanup:
- `omc --plugin-dir <path> ...`
- `OMC_PLUGIN_ROOT`
- `omc setup --plugin-dir-mode`
- [references/install-topology-and-recovery.md](references/install-topology-and-recovery.md)

**mixed-or-unknown**

Treat duplicate commands, duplicate slash skills, or unclear state as a recovery problem first. Do not stack more installs on top of an ambiguous topology.

Enable native teams in `~/.claude/settings.json` when Claude-native teams are expected:

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

#### Packet: in-session-runtime

Use when the user wants the best **Claude Code slash skill** for the job.

| Need | Use | Why |
|------|-----|-----|
| Shared in-session multi-agent work | `/team ...` | Canonical Claude-native team workflow |
| End-to-end build from a fuzzy request | `/autopilot ...` or `autopilot: ...` | Single lead agent, idea → implementation |
| Must keep going until verified done | `/ralph ...` or `ralph: ...` | Persistent execute → verify → fix loop |
| Burst parallel work | `/ultrawork ...` or `ulw ...` | High parallelism without full team overhead |
| Parallel QA / review burst | `/ultraqa ...` when installed | QA fan-out; route to OMX `$ultraqa` or OMA `/review` when the target runtime is not Claude |
| Requirements clarification first | `/deep-interview ...` | Clarify before planning or execution |
| Cross-model synthesis | `ccg: ...` when upstream/runtime supports it | Advisory synthesis path |

Pick one truthful recommendation plus at most 1 nearby alternative.

#### Packet: terminal-runtime

Use when the user wants the **shell CLI** rather than the in-session plugin surface.

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

#### Packet: cross-runtime-parity

Use when the user wants Claude OMC workflows to be usable from Codex or Antigravity too. Read [references/cross-runtime-workflow-map.md](references/cross-runtime-workflow-map.md), then map by intent:

| Claude / OMC | Codex / OMX | Gemini / Antigravity / OMA |
|--------------|-------------|-----------------------------|
| `/team N:role "task"` | `$team N:role "task"` or `omx team N:role "task"` | `/orchestrate "task"` or `oma agent:parallel -i role:"task"` |
| `/autopilot "task"` or `autopilot: task` | `$autopilot "task"`; use `$deep-interview` first for vague requests or `$plan` → `$ralph` for stricter verification | `/plan "task"` → `/work`; use `/orchestrate` or `oma agent:parallel` only when explicit parallel lanes are needed |
| `/ultrawork "task"` / `ulw "task"` | `$ulw "task"` or `$ultrawork "task"` | `/ultrawork "task"` or `oma agent:parallel` for independent lanes |
| `/ultraqa "target"` | `$ultraqa "target"` | `/review "target"` or `/ultrawork "QA target"`; use `oma agent:parallel` for explicit QA lanes |

Rules:
- State the runtime boundary first: OMC uses `.omc/`, OMX uses `.omx/`, OMA keeps `.agents/` canonical.
- Treat `/autopilot` as an intent contract, not a universal command name: Codex owns `$autopilot`; OMA usually composes `/plan` and `/work`.
- Do not claim Antigravity has Claude-style custom subagent spawning; use OMA CLI fallback when needed.
- When the target is Codex-native, route operator details to `omx`.
- When the target is Gemini/Antigravity portable harness work, route operator details to `ohmg`.

#### Packet: recovery-and-update

Use when the real job is repairing OMC.

Top recovery patterns:
- **Duplicate install / duplicate commands** → inspect whether marketplace plugin, npm CLI, and local-checkout/plugin-dir installs are overlapping
- **Setup drift after upgrade** → rerun the truthful setup/update path for the current topology (`setup omc`, `/oh-my-claudecode:omc-setup`, `omc update`, `omc setup`)
- **Local checkout not behaving like marketplace install** → verify `--plugin-dir`, `OMC_PLUGIN_ROOT`, and plugin-dir mode instead of reinstalling blindly
- **Team mode not working** → verify `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`
- **Worktree/state weirdness** → inspect `.omc/state/`, worktree namespace behavior, and team/session names
- **HUD / rate-limit / ephemeral-environment trouble** → treat it as environment/runtime recovery, not a mode-selection question

When the fix gets detailed, route to:
- [references/install-topology-and-recovery.md](references/install-topology-and-recovery.md)
- [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md)
- [references/cli-reference.md](references/cli-reference.md)
- [references/hooks-reference.md](references/hooks-reference.md)

#### Packet: boundary-and-route-out

Do not force OMC when another skill owns the job better.

Route out when:
- **long-lived plan / execution ledger / resumable multi-skill loop** → `jeo`
- **spec-first persistence method beyond OMC runtime detail** → `ralph`
- **approval posture, trusted-folder / bypass policy, permission surface** → `ralphmode`
- **plan review / approval gate** → `plannotator`
- **fresh-session browser verification** → `browser-harness`
- **running authenticated browser reuse** → `playwriter`
- **exact rendered-UI critique / annotation handoff** → `agentation`
- **Codex-first runtime orchestration** → `omx`
- **Gemini / Antigravity portable harness adoption** → `ohmg`
- **Claude workflow parity across Codex or Antigravity** → use the cross-runtime-parity packet, then route to `omx` or `ohmg` for runtime-specific commands

### Step 5: Keep the answer truthful about volatility

OMC is a fast-moving upstream project. Prefer:
- topology truth first
- current surface distinctions
- current install/setup commands
- current route-outs
- reference docs for deeper operator detail

Avoid:
- pretending all commands live on one surface
- treating `/team` and `omc team` as interchangeable
- promising that `/ultraqa`, `$ultraqa`, and OMA `/review` are the same implementation rather than mapped workflow intents
- claiming there is a general `omc autopilot` CLI
- stacking installs when duplicate-path symptoms suggest recovery first
- absorbing browser review, approvals, or non-Claude runtime ownership into OMC

## Examples

### Example 1: Marketplace plugin install
**User:** "OMC 설치하고 Claude Code 안에서 바로 팀 모드까지 쓰고 싶어"

**Response:** Use the **install-topology** packet with **marketplace-plugin** topology. Give the plugin install path, then `setup omc` or `/oh-my-claudecode:omc-setup`, and mention `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` when native teams are expected.

### Example 2: Local checkout / plugin-dir
**User:** "로컬 checkout으로 OMC 수정 중인데 Claude plugin cache 때문에 계속 예전 동작이 남아. plugin-dir 쪽으로 어떻게 잡아야 해?"

**Response:** Use the **install-topology** packet with **local-plugin-dir** topology. Point to `--plugin-dir`, `OMC_PLUGIN_ROOT`, and `omc setup --plugin-dir-mode`, then send the operator to the install-topology reference instead of treating this like a normal marketplace install.

### Example 3: Shell-side worker team
**User:** "shell에서 codex 두 명 붙여서 auth 플로우 리뷰 돌리고 싶어"

**Response:** Use the **terminal-runtime** packet. Recommend `omc team 2:codex "review auth flow"`, keep the answer on the CLI runtime, and mention status/shutdown commands only if helpful.

### Example 4: Long-loop orchestration boundary
**User:** "기획부터 실행, 검증, 재개까지 하나의 장기 루프로 굴리고 싶어"

**Response:** Use the **boundary-and-route-out** packet. Route to `jeo` as the long-loop coordination layer, and mention OMC only as the Claude-first runtime that `jeo` may compose with.

### Example 5: Mixed duplicate install symptoms
**User:** "업데이트 후 slash command가 중복으로 보이고 worktree마다 상태도 이상해"

**Response:** Use the **recovery-and-update** packet with **mixed-or-unknown** topology. Tell them to inspect overlapping plugin/CLI/plugin-dir installs, then rerun the truthful setup/update path and inspect worktree/state behavior before choosing another mode.

## Best practices

1. Name the **topology** before the packet when install or recovery is involved.
2. Prefer one recommended mode plus one nearby alternative, not a giant command dump.
3. Treat `/team` and `omc team` as related but different runtimes.
4. Keep the npm/package-name mismatch explicit: `oh-my-claude-sisyphus` provides the `omc` CLI.
5. Do not improvise over `--plugin-dir` or duplicate-install symptoms; route to the topology reference.
6. Route long-loop orchestration, approval posture, browser review, and other runtime ownership outward.
7. For Codex or Antigravity parity work, map the workflow intent and then hand off to `omx` or `ohmg`; do not write their runtime state into `.omc/`.
8. Use references for volatile operator detail; keep the front door focused on truthful routing.

## References

- [references/install-topology-and-recovery.md](references/install-topology-and-recovery.md)
- [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md)
- [references/modes-reference.md](references/modes-reference.md)
- [references/cross-runtime-workflow-map.md](references/cross-runtime-workflow-map.md)
- [references/hooks-reference.md](references/hooks-reference.md)
- [references/cli-reference.md](references/cli-reference.md)
- [references/agents-catalog.md](references/agents-catalog.md)
