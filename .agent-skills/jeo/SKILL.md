---
name: jeo
description: >
  Turn integrated agent delivery into one packet-first orchestration decision. Use
  when the user wants a single front door for plan approval, runtime handoff,
  browser/UI verification, resume or recovery, and durable `.jeo` task history
  across Claude Code, Codex CLI, Gemini CLI, or OpenCode. Route spec-first
  execution loops to `ralph`, visual plan review to `plannotator`, runtime-native
  execution to `omc` / `omx` / `ohmg`, browser verification to `agent-browser`,
  submit-gated UI feedback to `agentation`, and trust/approval posture tuning to
  `ralphmode`.
compatibility: >
  Requires git, node>=18, bash, and the repo's supporting JEO scripts. Runtime
  setup differs across Claude, Codex, Gemini, and OpenCode; keep those details in
  the platform references and sibling runtime skills.
allowed-tools: Read Write Bash Grep Glob Task
metadata:
  tags: jeo, orchestration, ralph, plannotator, agentation, annotate, agentui, UI-review, team, bmad, omc, omx, ohmg, agent-browser, multi-agent, workflow, worktree-cleanup, browser-verification, ui-feedback, resume, ledger
  platforms: Claude, Codex, Gemini, OpenCode
  keyword: jeo
  version: 1.6.3
  source: akillness/oh-my-skills
---

# JEO — Integrated Agent Orchestration

> Keyword: `jeo` · `annotate` · `ui-review` · `agentui (deprecated)` | Platforms: Claude Code · Codex CLI · Gemini CLI · OpenCode

Use JEO as a **packet-first orchestration router**.

The job is not to re-explain every runtime, hook, or browser integration inline. The job is to:
1. classify the request into the right orchestration packet,
2. keep the shared plan / execute / verify / cleanup contract honest,
3. preserve durable `.jeo/` history and resumable machine state,
4. hand runtime-specific work to the runtime skill that actually owns it,
5. require evidence before completion.

Read these when needed:
- [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md)
- [references/FLOW.md](references/FLOW.md)
- [references/DOT_JEO_LEDGER.md](references/DOT_JEO_LEDGER.md)
- [references/PLATFORM_SETUP.md](references/PLATFORM_SETUP.md)
- [references/STATE_AND_TROUBLESHOOTING.md](references/STATE_AND_TROUBLESHOOTING.md)

## When to use this skill
- Run an end-to-end repo delivery loop with explicit planning, execution, verification, and cleanup gates
- Keep a project-local `.jeo/` ledger with long-term rules, short-term plans, queued work, active work, progress notes, and append-only history
- Resume a previous integrated workflow instead of rebuilding state from scratch
- Add browser verification or submit-gated UI review to a broader delivery loop
- Decide which sibling skill owns the next part of the orchestration flow while preserving one shared workflow contract

## When not to use this skill
- The task is mainly spec-first clarification, immutable plan seeding, or persistent completion until verification passes → use `ralph`
- The task is mainly visual plan approval or diff review → use `plannotator`
- The task is mainly browser verification without the full delivery loop → use `agent-browser`
- The task is mainly rendered UI annotation feedback on an existing app → use `agentation`
- The task is mainly runtime-native orchestration or setup → use `omc` (Claude), `omx` (Codex), or `ohmg` (Gemini / portable harness)
- The task is mainly trust posture, approval mode, or lower-friction safe automation configuration → use `ralphmode`

## Shared invariants
1. Never enter EXECUTE without plan approval.
2. An unchanged approved plan does not reopen the plan gate.
3. Do not process annotation work before the explicit submit / onSubmit gate opens.
4. Completion requires QA evidence or an explicit skip reason.
5. Persist durable human context in `.jeo/` and resumable machine state in the configured runtime state file before leaving a phase.
6. JEO is the router and ledger contract, not the owner of runtime internals.

## Instructions

### Step 1: Classify the request into one orchestration packet
Choose the single best entry packet before doing anything else.

**Packets**
- `bootstrap-or-resume` — initialize or recover `.jeo` + machine state
- `planning-gate` — create / revise the plan and get approval
- `runtime-handoff` — send approved work to the correct execution runtime
- `verification-loop` — gather browser / QA evidence and decide whether `annotate` is required
- `annotate-submit-loop` — run submit-gated agentation review on browser-visible work
- `cleanup-and-closeout` — summarize, queue follow-up work, and clean worktrees safely

If the request mixes several concerns, name the **primary packet** and one secondary concern.

### Step 2: Bootstrap or resume durable state
Always ground the workflow before routing further.

```bash
mkdir -p .omc/state .omc/plans .omc/logs
python3 scripts/jeo-state-update.py init "<detected task>"
python3 scripts/jeo-project-sync.py init "<detected task>"
python3 scripts/jeo-project-sync.py start-next
```

Then read the current ledger if it exists:
- `.jeo/long-term.md`
- `.jeo/short-term.md`
- `.jeo/planned.md`
- `.jeo/progress.md`
- `.jeo/history.md`
- one active task file under `.jeo/tasks/active/`

If resuming, use:

```bash
python3 scripts/jeo-state-update.py resume
python3 scripts/jeo-project-sync.py status
python3 scripts/jeo-project-sync.py start-next
```

### Step 3: Keep the shared phase contract explicit
JEO owns the shared contract even when execution routes outward.

| Phase | What JEO owns | Typical route-out |
|------|----------------|-------------------|
| PLAN | plan gate, plan hash, checklist/progress update | `ralph` + `plannotator` |
| EXECUTE | approved-task handoff, active-task tracking, ledger updates | `omc`, `omx`, `ohmg`, or `bmad` |
| VERIFY | evidence collection requirement, browser-verification decision | `agent-browser` |
| VERIFY_UI | submit-gate enforcement, annotation queue ownership decision | `agentation` |
| CLEANUP | summary, follow-up queueing, worktree cleanup, final phase state | JEO scripts + git cleanup |

If a request cannot name the current phase, infer the earliest incomplete phase and say so.

### Step 4: Route to the real owner skill
Use the smallest honest route-out.

#### Planning gate
Use when the main job is writing or revising the approved plan.

```bash
python3 scripts/jeo-state-update.py checkpoint plan
python3 scripts/jeo-project-sync.py stage planning
python3 scripts/jeo-project-sync.py progress "Entered planning gate."
```

Then route to:
- `ralph` for spec-first plan shaping
- `plannotator` for plan review / approval

#### Runtime handoff
Use when the plan is approved and implementation should start.

```bash
python3 scripts/jeo-state-update.py checkpoint execute
python3 scripts/jeo-state-update.py set phase execute
python3 scripts/jeo-project-sync.py stage development
python3 scripts/jeo-project-sync.py progress "Development started from the approved plan."
```

Then route to:
- `omc` for Claude-native execution
- `omx` for Codex-native execution
- `ohmg` for Gemini / portable `.agents` execution
- `bmad` only when the runtime fallback is the truthful path

Do not keep runtime-specific hook, config, or slash-command detail in the main JEO answer; point to the runtime skill or platform reference instead.

#### Verification loop
Use when the main job is proving behavior before closeout.

```bash
python3 scripts/jeo-state-update.py checkpoint verify
python3 scripts/jeo-state-update.py set phase verify
python3 scripts/jeo-project-sync.py stage qa
python3 scripts/jeo-project-sync.py progress "Entered QA verification."
```

Then:
- use `agent-browser` for browser-visible verification
- record evidence in `.jeo/short-term.md` and the active task file
- decide whether `annotate` / `ui-review` requires the submit-gated UI loop

#### Annotate submit loop
Use only when explicit submit-gated UI review is requested.

- set `phase=verify_ui`
- require submit / onSubmit before processing annotations
- route the actual annotation watch / ack / resolve behavior to `agentation`
- record any follow-up work in the queue before cleanup

#### Cleanup and closeout
Use when the loop is ready to summarize and exit.

```bash
python3 scripts/jeo-state-update.py checkpoint cleanup
python3 scripts/jeo-state-update.py set phase cleanup
python3 scripts/jeo-project-sync.py stage done
python3 scripts/jeo-project-sync.py complete <slug> "<what shipped, what QA proved, what follow-up remains>"
```

If follow-up work remains:

```bash
python3 scripts/jeo-project-sync.py queue next-step "<follow-up work>"
```

Then clean worktrees:

```bash
bash scripts/worktree-cleanup.sh || git worktree prune
```

### Step 5: Produce one orchestration packet
Return one concise orchestration packet, not a giant platform encyclopedia.

Minimum packet contents:
- primary packet and any secondary concern
- current phase or inferred next phase
- ledger/state status
- sibling skill route-outs
- required evidence or approval gates
- next command block or action block

### Step 6: Verify boundaries before finalizing
Check:
- did you keep runtime-native config, hook, and setup detail in the references or sibling runtime skills?
- did you keep browser verification in `agent-browser` and submit-gated UI review in `agentation`?
- did you keep trust/approval posture tuning in `ralphmode`?
- did you preserve `.jeo/` history and active-task truth instead of inventing ephemeral state?
- does the packet make the next honest handoff obvious?

## Output format

```markdown
## JEO Packet: [Task or Phase]

### Packet choice
- Primary packet: bootstrap-or-resume | planning-gate | runtime-handoff | verification-loop | annotate-submit-loop | cleanup-and-closeout
- Secondary concern: optional
- Current phase: plan | execute | verify | verify_ui | cleanup | done | unknown
- Confidence: high | medium | low

### State snapshot
- Durable ledger: initialized | missing | needs resume | active
- Machine state: initialized | resumed | missing | blocked
- Active task: ...
- Plan gate: pending | approved | feedback_required | infrastructure_blocked
- Submit gate: not-needed | waiting_for_submit | submitted | complete

### Route-outs
- Planning owner: `ralph` / `plannotator` / not-needed
- Runtime owner: `omc` / `omx` / `ohmg` / `bmad` / not-needed
- Browser verification owner: `agent-browser` / not-needed
- UI feedback owner: `agentation` / not-needed
- Trust posture owner: `ralphmode` / not-needed

### Actions
1. ...
2. ...
3. ...

### Commands
```bash
# minimal next commands only
```

### Exit criteria
- ...
```

## Examples

### Example 1: new cross-platform delivery loop
**Input:** “jeo로 이 기능을 진행하는데 Claude에서도 이어서 하고 나중에 Codex에서도 resume할 수 있게 .jeo 문서까지 같이 관리해줘.”

**Good response shape:**
- chooses `bootstrap-or-resume` or `planning-gate`
- initializes `.jeo/` and machine state
- keeps planning with `ralph` + `plannotator`
- routes runtime-specific execution to the correct runtime skill instead of expanding all runtime setup inline

### Example 2: browser-visible feature with annotate review
**Input:** “annotate 포함 jeo 플로우로 UI 기능을 만들고 브라우저 검증이랑 submit-gated 리뷰까지 같이 관리해줘.”

**Good response shape:**
- chooses `verification-loop` with secondary `annotate-submit-loop`
- records the QA evidence requirement
- routes browser verification to `agent-browser`
- waits for explicit submit before `agentation` processing

### Example 3: resume and queue follow-up work
**Input:** “이전에 끝낸 작업을 history로 참고하면서 새 follow-up 작업을 .jeo에 추가해 이어서 진행해줘.”

**Good response shape:**
- resumes state instead of rebuilding it
- uses `.jeo/history.md` as durable context
- queues the follow-up item before execution or cleanup
- preserves append-only history and one active task file

## Best practices
1. Keep JEO as the front door, not the whole runtime stack.
2. Use one primary packet per response; name secondary concerns explicitly instead of blending everything together.
3. Keep `.jeo` honest: durable long-term rules, current short-term plan, explicit queued/active work, append-only history.
4. Prefer references and sibling skills over re-expanding platform setup or hook internals in `SKILL.md`.
5. Require QA evidence before cleanup claims success.
6. Queue follow-up work before leaving the loop when verification finds more work.
7. Keep one active task file at a time.
8. Treat runtime parity honestly; shared rules belong in JEO, runtime-specific mechanics do not.

## References
- [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) — Claude Code multi-agent runtime
- [plannotator](https://plannotator.ai) — visual plan/diff review
- [BMAD Method](https://github.com/bmad-dev/BMAD-METHOD) — structured AI development workflow
- [Agent Skills Spec](https://agentskills.io/specification) — skill format specification
- [agentation](https://github.com/benjitaylor/agentation) — UI annotation → agent code fix
- [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md) — packet selection and sibling-skill boundaries
