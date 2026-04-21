# ralph — Specification-First Completion Loop Guide

> **ralph** is the portable Ouroboros method: clarify first, freeze an immutable seed,
> execute against that contract, verify before claiming success, and keep looping until
> completion is actually verified.

← [Back to README](../../README.md)

---

## What `ralph` owns

`ralph` is the **method contract**, not the runtime shell.

```text
Interview → Seed → Execute → Evaluate → Evolve
                     ↓
                 ooo ralph
             (persist until verified)
```

Use `ralph` when you need:
- Socratic clarification before coding
- immutable requirements / seed specs
- drift-aware implementation
- a verify-before-done loop
- repeated retries until completion is verified

## What `ralph` does not own

Route outward when the main problem is runtime-specific:
- **Claude-native orchestration** → `omc`
- **Codex-native orchestration / hooks / `.rules` / approvals** → `omx`
- **Gemini / Antigravity harness setup** → `ohmg`
- **Integrated delivery ledger / plan review / browser verification** → `jeo`
- **Permission posture / sandbox / trust policy** → `ralphmode`

---

## Core workflow

### 1. Interview
Reduce ambiguity before writing code.

```text
ooo interview "build a task management CLI"
```

Do not proceed until ambiguity is low enough to act.

### 2. Seed
Freeze the clarified request into an immutable spec.

```text
ooo seed
```

Typical seed contents:
- goal
- constraints
- acceptance criteria
- ontology / core object model

### 3. Execute
Run against the seed, not drifting chat context.

```text
ooo run [seed.yaml]
```

### 4. Evaluate
Verify before claiming success.

```text
ooo evaluate <session_id>
```

Use the three-stage gate:
- Mechanical
- Semantic
- Consensus (optional)

### 5. Persistent completion
Use `ooo ralph` when the task should continue until verified.

```text
ooo ralph "fix all failing tests" --max-iterations=10
```

The loop is:
1. execute
2. verify
3. record failures
4. adjust
5. continue until verified or capped

A completion promise like `<promise>DONE</promise>` is useful, but the real stop rule is **verified completion**.

---

## Examples

### Clarify first
```text
ooo interview "design a deployment dashboard"
```

### Freeze a seed
```text
ooo seed
```

### Persistent verified loop
```text
ooo ralph "fix all failing tests" --max-iterations=10
```

### Break a failure loop deliberately
```text
ooo unstuck contrarian
```

---

## Local helper setup

### Install the skill

```bash
npx skills add https://github.com/akillness/oh-my-skills --skill ralph
```

### Repo-local helper scripts

```bash
bash .agent-skills/ralph/scripts/setup-codex-hook.sh
bash .agent-skills/ralph/scripts/setup-gemini-hook.sh
```

These scripts install the **current local helper paths** shipped by this repo.
They do not make `ralph` the owner of all platform runtime behavior.

### Helper state file

```text
.omc/state/ralph-ooo-state.json
```

Inspect / reset local helper state:

```bash
bash .agent-skills/ralph/scripts/ooo-state.sh status
bash .agent-skills/ralph/scripts/ooo-state.sh reset
bash .agent-skills/ralph/scripts/ooo-state.sh resume
```

---

## Platform notes

### Claude Code
Claude has rich native hook surfaces.
Use `ralph` for the method and `omc` for deep Claude-native orchestration.

### Codex CLI
Older local docs described Codex as compensation-only.
That is now stale.
Official Codex docs now expose native **experimental hooks**, `.rules`, sandbox, and approval controls.

Truthful current position:
- this repo still ships a **fallback local helper** via `setup-codex-hook.sh`
- Codex also has **native runtime controls** upstream
- detailed Codex-native execution ownership belongs to `omx`

### Gemini CLI
Gemini supports hook-based continuation and trust-folder controls.
Use the local helper when you need the repo's shipped setup path; use `ohmg` when the real need is harness / projection setup.

### OpenCode
OpenCode can use `ralph` directly through the skills system with minimal extra setup.

---

## Best practices

1. Clarify before coding when ambiguity is high.
2. Treat the seed as immutable once generated.
3. Verify before done — confidence is not enough.
4. Keep runtime setup separate from the portable method.
5. Fix stale runtime docs in the references or sibling runtime skills instead of bloating `ralph`.

---

## Further reading

- [`../../.agent-skills/ralph/SKILL.md`](../../.agent-skills/ralph/SKILL.md)
- [`../../.agent-skills/ralph/references/platform-setup.md`](../../.agent-skills/ralph/references/platform-setup.md)
- [`../../.agent-skills/ralph/references/runtime-boundaries.md`](../../.agent-skills/ralph/references/runtime-boundaries.md)
- [Q00/ouroboros](https://github.com/Q00/ouroboros)
