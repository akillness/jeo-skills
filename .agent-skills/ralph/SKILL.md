---
name: ralph
description: >
  Run the Ouroboros specification-first development loop: reduce ambiguity with a
  Socratic interview, freeze an immutable seed/spec, execute against that contract,
  verify before claiming success, and keep looping until completion is actually
  verified. Use when the user wants spec-first clarification, immutable requirements,
  drift-aware implementation, or a persistent completion loop that should keep going
  until tests / checks / acceptance criteria pass. Triggers on: ralph, ooo,
  specification first, socratic interview, seed spec, immutable requirements,
  keep going until verified, do not stop until done, persistent completion,
  ambiguity reduction, ouroboros.
allowed-tools: Read Write Bash Grep Glob WebFetch Agent
metadata:
  tags: ralph, ouroboros, specification-first, socratic, interview, seed, evaluate, evolve, loop, completion, nine-minds, double-diamond, convergence, drift, ooo, multi-platform
  platforms: Claude Code, Codex CLI, Gemini CLI, OpenCode
  keyword: ralph
  version: 4.1.0
  source: Q00/ouroboros
  license: MIT
---

# ralph — Specification-First Development + Persistent Completion

> Stop prompting. Start specifying.

`ralph` is the **portable method contract** for the Ouroboros loop:

```text
Interview → Seed → Execute → Evaluate → Evolve
                     ↓
                 ooo ralph
             (persist until verified)
```

Keep `ralph` focused on that contract.
Runtime-specific execution belongs to sibling skills:
- `omc` — Claude-native orchestration
- `omx` — Codex-native orchestration
- `ohmg` — Gemini / Antigravity harness projection
- `jeo` — integrated delivery ledger and review loop
- `ralphmode` — approvals / sandbox / trust posture

## When to use this skill

- The user has a **vague request** and needs a Socratic interview before code is written.
- Requirements should become an **immutable seed/spec** before implementation starts.
- The task needs a **verify-before-done loop** instead of a one-shot answer.
- The user wants to **keep going until completion is actually verified**.
- You need to measure **drift** against the original contract.
- Repeated failures mean you need a structured **unstuck** step instead of more blind retries.

## Do not use this skill when

- The task is mainly about Claude / Codex / Gemini runtime setup or platform commands → route to `omc`, `omx`, or `ohmg`.
- The main problem is permission posture, approvals, trust folders, or YOLO mode → route to `ralphmode`.
- The user needs integrated project ledgers, plan review, browser verification, and cleanup workflow → route to `jeo`.
- The task is only pre-implementation landscape research → route to `survey`.

## Instructions

Follow the phases in order unless the user explicitly asks for a narrower command such as `ooo interview`, `ooo evaluate`, or `ooo unstuck`. Keep `ralph` as the method anchor, then route platform-native runtime details outward when the request turns into Claude / Codex / Gemini-specific setup or execution policy.

## Core contract

### 1. Interview
Ask questions until ambiguity is low enough to act.

Use when the user is unclear, underspecified, or mixing goals, constraints, and success criteria.

```text
ooo interview "build a task management CLI"
```

**Ambiguity gate**
- Greenfield: Goal 40% + Constraints 30% + Success 30%
- Brownfield: Goal 35% + Constraints 25% + Success 25% + Context 15%
- Do not move to seed until **Ambiguity ≤ 0.2**.

### 2. Seed
Freeze the clarified request into an immutable spec.

```text
ooo seed
```

The seed should lock:
- goal
- constraints
- acceptance criteria
- ontology / core object model

Once generated, the seed becomes the baseline for drift checks.

### 3. Execute
Run the work against the seed instead of improvising from chat drift.

```text
ooo run [seed.yaml]
```

Default execution shape:
1. Discover
2. Define
3. Design
4. Deliver

### 4. Evaluate
Verify before claiming success.

```text
ooo evaluate <session_id>
```

Use the three-stage gate:
- **Mechanical** — lint, tests, build, typecheck, coverage
- **Semantic** — acceptance criteria and goal alignment
- **Consensus** — optional multi-model or reviewer agreement when needed

**Drift thresholds**
- `0.00–0.15` excellent
- `0.15–0.30` acceptable but watch closely
- `0.30+` correct course before continuing

### 5. Evolve
Use when the ontology or solution shape is still changing.

```text
ooo evolve "topic"
ooo evolve "topic" --no-execute
```

Stop when repeated generations converge strongly enough to count as stable.

### 6. Persistent completion (`ooo ralph`)
Use when the user wants a loop that should continue until completion is verified.

```text
ooo ralph "fix all failing tests"
ooo ralph "implement the payment module"
```

The loop contract is:
1. execute
2. verify
3. record failure evidence
4. adjust
5. continue until verified or capped

Keep the stopping rule explicit.
A completion promise such as `<promise>DONE</promise>` is a useful runtime-level signal, but the real rule is **verified completion**, not merely emitting the token.

## Unstuck mode

When repeated attempts are failing, route to a deliberate mindset instead of retrying blindly.

```text
ooo unstuck
ooo unstuck simplifier
ooo unstuck hacker
ooo unstuck contrarian
ooo unstuck researcher
ooo unstuck architect
```

Quick routing guide:
- repeated similar failures → `contrarian`
- too many options / paralysis → `simplifier`
- missing evidence → `researcher`
- need momentum → `hacker`
- wrong foundation → `architect`

## Operating rules

1. **Clarify before coding** when ambiguity is still high.
2. **Freeze the seed** before implementation; do not rewrite the contract mid-run.
3. **Measure drift** against the original seed, not against the latest rationale.
4. **Verify before done** — tests, checks, and acceptance criteria matter more than confidence.
5. **Treat failure as data** — every failed loop should feed the next attempt.
6. **Keep runtime ownership separate** — platform hooks, approvals, trust settings, and shell-specific commands belong in runtime docs and sibling skills.
7. **Prefer the live local skill path** in setup examples: `.agent-skills/ralph/...`.

## Platform boundary

`ralph` is runtime-agnostic on purpose.
It should describe **what the loop needs**, not every platform's syntax.

- Claude Code can supply rich native hooks and orchestration through `omc`.
- Codex now has native **experimental** hooks plus `.rules`, sandbox, and approval controls, but concrete Codex runtime guidance still belongs in `omx` and the platform references.
- Gemini supports hook-based continuation and trust-folder controls; concrete setup belongs in `ohmg` and the platform references.
- `ralphmode` owns safety posture, not `ralph`.

See [references/runtime-boundaries.md](./references/runtime-boundaries.md) and [references/platform-setup.md](./references/platform-setup.md).

## Examples

### Example 1: clarify first
```text
ooo interview "build a task management CLI"
```

### Example 2: persistent verified loop
```text
ooo ralph "fix all failing tests" --max-iterations=10
```

### Example 3: local helper setup
```bash
bash .agent-skills/ralph/scripts/setup-codex-hook.sh
bash .agent-skills/ralph/scripts/setup-gemini-hook.sh
```

## Available scripts

| Script | Purpose |
|--------|---------|
| `scripts/setup-codex-hook.sh` | Install the current local Codex fallback helpers (`developer_instructions` + prompt scaffolding) |
| `scripts/setup-gemini-hook.sh` | Install the local Gemini AfterAgent helper path |
| `scripts/ooo-state.sh` | Inspect / reset local `.omc/state/ralph-ooo-state.json` helper state |

## Best practices

1. Keep `ralph` as the **method anchor**, not a catch-all platform runtime wrapper.
2. Pair long-running runs with explicit repo-local verification commands.
3. Route runtime shells and orchestration depth outward instead of duplicating them here.
4. Update compact/catalog/doc surfaces whenever the trigger surface changes materially.
5. If a runtime doc drifts from current official docs, correct the runtime reference instead of bloating this front door.

## References

- `references/ouroboros-commands.md` — command syntax, parameters, and state concepts
- `references/nine-minds.md` — the nine persona roles and unstuck routing
- `references/platform-setup.md` — platform-specific local setup and current fallback guidance
- `references/runtime-boundaries.md` — settings / rules / hooks split and sibling-skill ownership

Source: [Q00/ouroboros](https://github.com/Q00/ouroboros) — MIT License
