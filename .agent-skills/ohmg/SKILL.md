---
name: ohmg
description: >
  Adopt `oh-my-agent` from a Gemini CLI or Antigravity workflow. Use when the user
  wants a portable multi-agent harness with `.agents/` as the source of truth,
  Gemini-native generated agents, Antigravity compatibility, or cross-vendor-ready
  orchestration that can later route work to Claude or Codex. Also use when mapping
  Claude workflows such as `team`, `ultrawork`, or `ultraqa` into OMA workflows for
  Gemini or Antigravity. Triggers on: ohmg, oh-my-agent, oma, Gemini multi-agent,
  Antigravity agent team, .agents, portable harness, Gemini native agents,
  ultrawork, ultraqa, and Gemini/Antigravity orchestration. Route
  Claude-first runtime orchestration to `omc` and Codex-first runtime orchestration
  to `omx`.
allowed-tools: Read Write Bash Grep Glob
metadata:
  tags: ohmg, oh-my-agent, oma, multi-agent, orchestration, gemini-cli, antigravity, portable-harness, dot-agents, team, ultrawork, ultraqa
  platforms: Gemini, Antigravity
  keyword: ohmg
  version: 2.0.0
  source: first-fluke/oh-my-agent
---

# ohmg — Gemini / Antigravity entry for oh-my-agent

## When to use this skill

- You want to adopt **`oh-my-agent`** from a **Gemini CLI** workflow
- You want **Antigravity** to read the same project-local multi-agent setup
- You need a **portable `.agents/` source of truth** that can later project into Gemini, Claude, and Codex surfaces
- You need to explain **when Gemini can use native generated agents** versus **when `oma agent:spawn` fallback** is required
- You need OMA/Gemini/Antigravity equivalents for Claude `/team`, `/ultrawork`, or `/ultraqa`
- You want the **Gemini / Antigravity path** without copying the full Claude-first (`omc`) or Codex-first (`omx`) runtime catalogs

## Instructions

### Step 1: Identify the runtime and desired ownership model

Determine which of these the user actually wants:

1. **Gemini CLI first** — they want Gemini-native agent files and Gemini-centric usage
2. **Antigravity first** — they want Antigravity to consume a portable agent harness
3. **Portable harness first** — they want one project-local source of truth that can later project into Gemini, Claude, or Codex
4. **Vendor-first runtime instead** — they actually want Claude-first orchestration (`omc`) or Codex-first orchestration (`omx`)

If the request is really about **Claude Code-native orchestration**, route to `omc`.
If the request is really about **Codex CLI-native orchestration**, route to `omx`.
Use `ohmg` when the center of gravity is **Gemini CLI / Antigravity + portable harness adoption**.

### Step 2: Teach the current upstream mental model

Frame `ohmg` around the **modern upstream surface**:

- product/runtime name: **`oh-my-agent`**
- common CLI: **`oma`** / `oh-my-agent`
- source of truth: **`.agents/`** in the project
- native generated vendor views:
  - `.gemini/agents/*.md`
  - `.claude/agents/*.md`
  - `.codex/agents/*.toml`
- dispatch rule:
  - **same-vendor runtime** → prefer native generated vendor agent files
  - **cross-vendor task** → fall back to `oma agent:spawn` / `oma agent:parallel`

Do **not** lead with old `oh-my-ag` naming, `/coordinate`, or `.agent/skills/` paths.

### Step 3: Provide the right install/bootstrap path

#### Gemini CLI / general portable setup

```bash
# one-liner installer (macOS/Linux)
curl -fsSL https://raw.githubusercontent.com/first-fluke/oh-my-agent/main/cli/install.sh | bash

# or launch directly
bunx oh-my-agent@latest

# or install globally
bun install --global oh-my-agent
```

After install, use the interactive `oma` flow to choose a preset and generate the project-local harness.

Useful operator commands:

```bash
oma doctor
oma link
oma dashboard
oma dashboard:web
```

#### When install constraints exist

If interactive setup is not appropriate, explain the manual path:

1. bring `.agents/` into the project
2. run `oma link` to regenerate runtime-specific views
3. verify the generated Gemini / Claude / Codex files exist where expected

### Step 4: Explain Gemini-native vs Antigravity behavior correctly

#### Gemini CLI path

Gemini can use **generated native agent files** from `.gemini/agents/*.md` when the runtime vendor matches the target vendor.

Use this framing:
- keep `.agents/` canonical
- generate/update `.gemini/agents/*.md`
- let Gemini use native generated agent definitions when possible

#### Antigravity path

Antigravity can consume `.agents/agents/` directly, but **does not support custom subagent spawning** the same way Gemini / Claude / Codex runtimes can.

Use this framing:
- Antigravity is a **portable-consumer surface** for the harness
- do not oversell it as identical to Gemini-native multi-agent spawning
- when the task needs explicit cross-vendor or custom spawning behavior, explain the fallback CLI/runtime path instead of pretending Antigravity owns it natively

### Step 5: Show the real workflow surfaces

Use upstream workflow language that matches current `oh-my-agent` docs:

- `/plan` — PM task breakdown and API-contract-oriented planning
- `/work` — step-by-step gated multi-agent execution
- `/orchestrate` — CLI-based parallel agent execution
- `/ultrawork` — higher-intensity quality workflow
- `/review` — security / performance / accessibility review
- `/debug` — structured debugging
- `/scm` — SCM and Git workflow support

Useful CLI examples:

```bash
oma agent:spawn backend "Build auth API" session-01
oma agent:parallel -i backend:"Auth API" frontend:"Login form"
oma dashboard
oma dashboard:web
```

Use these as **examples of the portable harness**, not as a promise that every runtime exposes the same native UI.

### Step 5.5: Map Claude team / ultrawork / ultraqa to OMA

Read [references/parallel-quality-workflows.md](references/parallel-quality-workflows.md) when the user asks to bring Claude OMC workflows to Gemini or Antigravity.

| Claude / OMC intent | OMA / Gemini shape | Antigravity boundary |
|---------------------|--------------------|----------------------|
| `/team N:role "task"` | `/orchestrate "task"` or `oma agent:parallel -i role:"task"` | Antigravity can consume `.agents/agents/`, but explicit spawning may need OMA CLI fallback |
| `/ultrawork "task"` | `/ultrawork "task"` or `oma agent:parallel` independent lanes | Keep `.agents/` canonical and regenerate views with `oma link` |
| `/ultraqa "target"` | `/review "target"` or `/ultrawork "QA target"` with QA/security/performance lanes | Do not promise a native `/ultraqa` command unless the local projection exposes it |

### Step 6: Handle cross-vendor questions with explicit boundaries

Use this routing logic:

- **Use `ohmg`** when the request is about:
  - Gemini CLI setup for `oh-my-agent`
  - Antigravity compatibility
  - `.agents/` source-of-truth structure
  - native Gemini generated agents
  - portable harness adoption before choosing per-vendor runtime layers

- **Use `omc`** when the request is about:
  - Claude Code plugin / in-session orchestration
  - `/team`, `/autopilot`, `/ralph`, `/ccg`, or Claude-first runtime operations

- **Use `omx`** when the request is about:
  - Codex CLI workflow skills like `$deep-interview`, `$ralplan`, `$team`, `$ralph`
  - `.omx/` runtime state and Codex-first orchestration behavior

If a user wants **one portable harness that can later serve Gemini + Claude + Codex**, keep `ohmg` as the anchor and mention `omc` / `omx` as downstream vendor-first layers, not replacements for the `.agents/` source of truth.

### Step 7: Troubleshoot the most common drift points

Check these first:

1. **Wrong product naming** — use `oh-my-agent` / `oma`, not old `oh-my-ag`
2. **Wrong source-of-truth path** — prefer `.agents/`, not legacy `.agent/`
3. **Generated files stale or missing** — rerun `oma link`
4. **Environment mismatch** — Gemini-native behavior differs from Antigravity capability
5. **Monitoring confusion** — dashboard observes agent/memory activity; it is not the whole orchestration model
6. **Mixed-vendor expectations** — if native dispatch cannot own the task, explain `oma agent:spawn` / `oma agent:parallel`
7. **Claude workflow parity confusion** — map `team`, `ultrawork`, and `ultraqa` as workflow intents, not identical command implementations

## Examples

### Example 1: Gemini CLI adoption

**User:** “Set up oh-my-agent for Gemini CLI.”

**Response:** Use `ohmg`. Install `oh-my-agent`, keep `.agents/` as the source of truth, then regenerate Gemini-native agent files so Gemini can use `.gemini/agents/*.md` when the runtime vendor matches. A good start is `curl -fsSL https://raw.githubusercontent.com/first-fluke/oh-my-agent/main/cli/install.sh | bash` or `bunx oh-my-agent@latest`, then `oma doctor` and `oma link`.

### Example 2: Antigravity compatibility

**User:** “I want Antigravity to use the same multi-agent setup as Gemini.”

**Response:** Use `ohmg`, but explain the capability boundary clearly: Antigravity can consume `.agents/agents/` from the same portable harness, yet it does not support custom subagent spawning the same way Gemini-native or CLI fallback paths do. Keep `.agents/` canonical and use Antigravity as a compatible consumer surface.

### Example 3: Portable harness with later Claude/Codex routing

**User:** “I need Gemini-native agents now, but later I may route work to Claude or Codex.”

**Response:** `ohmg` is the right anchor. Start with `oh-my-agent` and `.agents/` as the project-local source of truth. Let Gemini use generated native agent files now, then project the same harness into `.claude/agents/` or `.codex/agents/` later. If the user later wants Claude-first runtime orchestration, route those runtime details to `omc`; if they want Codex-first workflow skills, route to `omx`.

### Example 4: Choosing between ohmg, omc, and omx

**User:** “Should I use ohmg, omc, or omx?”

**Response:** Use `ohmg` if your main goal is a Gemini / Antigravity-friendly portable harness centered on `.agents/`. Use `omc` for Claude-first orchestration and `omx` for Codex-first orchestration. `ohmg` is the portable harness adoption lane; `omc` and `omx` are vendor-first runtime overlays.

## Best practices

1. **Use current upstream naming** — `oh-my-agent` / `oma`, not `oh-my-ag`
2. **Keep `.agents/` canonical** — generated Gemini/Claude/Codex surfaces should derive from it
3. **Prefer same-vendor native dispatch first** — only escalate to CLI spawning when vendor/runtime mismatch requires it
4. **State Antigravity limits plainly** — it is compatible, but not identical to Gemini-native custom subagent behavior
5. **Route vendor-first runtime questions cleanly** — keep Claude-first runtime depth in `omc` and Codex-first runtime depth in `omx`
6. **Use `oma link` after structure changes** — stale generated files are a common source of confusion
7. **Treat dashboards as observability helpers** — they support the workflow; they are not the workflow itself
8. **Map QA carefully** — OMA `/review` or `/ultrawork` can satisfy the `ultraqa` intent, but only call it `/ultraqa` when that workflow exists locally

## References

- [Installation, layout, and generated surfaces](references/installation-and-layout.md)
- [Runtime boundaries: Gemini vs Antigravity vs OMC/OMX](references/runtime-boundaries.md)
- [Workflow and command packets](references/workflow-and-command-packets.md)
- [Parallel and quality workflows](references/parallel-quality-workflows.md)
- [Upstream README](https://github.com/first-fluke/oh-my-agent/blob/main/README.md)
- [Supported agents matrix](https://github.com/first-fluke/oh-my-agent/blob/main/docs/SUPPORTED_AGENTS.md)
