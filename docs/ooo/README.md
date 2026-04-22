# ooo — Ouroboros Specification-First Development

> **ooo** is the portable Ouroboros method: clarify first, freeze an immutable seed,
> execute against that contract, verify before claiming success, and keep looping until
> completion is actually verified.

← [Back to README](../../README.md)

---

## What `ooo` owns

`ooo` is the **method contract + CLI** for the Ouroboros loop.

```text
Interview → Seed → Execute → Evaluate → Evolve
                     ↓
                 ooo ralph
             (persist until verified)
```

Use `ooo` when you need:
- Socratic clarification before coding
- Immutable requirements / seed specs
- Drift-aware implementation
- A verify-before-done loop
- Repeated retries until completion is verified

## Installation

### Plugin (Claude Code)
```bash
claude plugin marketplace add Q00/ouroboros
```

### pip
```bash
pip install ouroboros-ai[all]
```

### Skill (any platform)
```bash
npx skills add https://github.com/akillness/oh-my-skills --skill ooo
```

### Runtime setup
```bash
ouroboros setup                     # auto-detects Claude / Codex / OpenCode
ouroboros setup --runtime claude
ouroboros setup --runtime codex
```

---

## Core workflow

### 1. Interview — reduce ambiguity
```bash
ouroboros init start "build a task management CLI"
ouroboros init list
```

Do not proceed until ambiguity ≤ 0.2.

### 2. Seed — freeze the spec
After interview, `seed.yaml` is written to `.ouroboros/seeds/`.
The seed locks: goal, constraints, acceptance criteria, ontology.

### 3. Run — execute against the seed
```bash
ouroboros run workflow .ouroboros/seeds/seed_<hash>.yaml
ouroboros run workflow seed.yaml --sequential
ouroboros run resume
```

### 4. Evaluate — three-stage gate
- **Mechanical**: lint, tests, build, typecheck
- **Semantic**: acceptance criteria and goal alignment
- **Consensus**: optional multi-model agreement

```bash
ouroboros status executions
ouroboros status execution <id> --events
```

### 5. Persistent completion (ooo ralph)
```bash
ouroboros run workflow seed.yaml   # run → verify → adjust → repeat
ouroboros run resume               # resume after pause or failure
```

The loop continues until verified or execution cap is reached.

---

## Unstuck mode

When repeated attempts fail, use a deliberate persona:

| Keyword | When |
|---------|------|
| `contrarian` | Repeated similar failures |
| `simplifier` | Too many options, paralysis |
| `researcher` | Missing evidence |
| `hacker` | Need momentum |
| `architect` | Wrong foundation |

---

## Monitor progress

```bash
ouroboros tui monitor              # Textual TUI
ouroboros tui monitor --backend slt  # native Rust TUI
ouroboros status health
```

---

## MCP server

```bash
ouroboros mcp serve
claude mcp add ouroboros -- uvx --from ouroboros-ai[mcp] ouroboros mcp serve
```

---

## Uninstall

```bash
ouroboros uninstall
ouroboros uninstall --keep-data --dry-run
```

---

## Further reading

- [`.agent-skills/ooo/SKILL.md`](../../.agent-skills/ooo/SKILL.md)
- [CLI Reference](https://github.com/Q00/ouroboros/blob/v0.29.0/docs/cli-reference.md)
- [Q00/ouroboros v0.29.0](https://github.com/Q00/ouroboros/tree/v0.29.0)
