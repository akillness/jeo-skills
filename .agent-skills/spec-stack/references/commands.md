# spec-stack command crosswalk

Three tools, one delivery path. Layer skills own the detail:
[`../../spec-kit/references/commands.md`](../../spec-kit/references/commands.md),
`../../ooo/SKILL.md`, `../../cli-anything/references/commands.md`.

## The handoff map

| Stage | Artifact produced | Consumed by |
|-------|-------------------|-------------|
| `/speckit.constitution` | `constitution.md` (principles) | `/speckit.plan`, seed Constraints |
| `/speckit.specify` (+ `clarify`) | `spec.md` (requirements, acceptance criteria) | ooo interview context |
| `/speckit.plan` → `/speckit.tasks` | `plan.md`, task list | loop iterations (optional in pattern A) |
| `ouroboros interview` → `seed generate` | immutable `seed.yaml` | `ouroboros run` / `ralph`, drift measurement |
| `cli-hub install <name>` | agent-native CLI harness on PATH | implementation steps inside the loop |
| `cli-anything-<name> --json …` | structured artifact evidence | `ouroboros evaluate` verification |

## Stage 1 — Spec (spec-kit)

| Command | Purpose |
|---------|---------|
| `specify init . --integration <agent>` | Bootstrap `.specify/` for the chosen agent |
| `/speckit.constitution` | Principles and non-negotiables (feeds seed Constraints) |
| `/speckit.specify` | Requirements + **machine-checkable** acceptance criteria |
| `/speckit.clarify` | Resolve open questions before freezing anything |
| `/speckit.plan` · `/speckit.tasks` | Technical strategy and task breakdown |
| `/speckit.analyze` | Constitution ↔ spec ↔ plan consistency check |

In pattern A, stop before `/speckit.implement` — the loop layer gates
completion.

## Stage 2 — Contract (ooo)

| Command / MCP tool | Purpose |
|--------------------|---------|
| `ouroboros interview` / `ouroboros_interview` | Socratic interview (brownfield weighting when a spec exists); proceed only at ambiguity ≤ 0.2 |
| `ouroboros seed generate` / `ouroboros_generate_seed` | Freeze the immutable seed from the interview + spec |
| `ouroboros run` / `ouroboros_execute_seed` | Execute against the seed |
| `ouroboros evaluate` / `ouroboros_evaluate` | Verify before done; demands the evidence the seed promised |
| ralph (`ooo ralph`) / `ouroboros_ralph` | Persistent completion loop until evaluation passes |
| `ouroboros_measure_drift` | Distance between implementation and the frozen contract |

Seed authoring rules: success criteria mirror `spec.md` acceptance
criteria in machine-checkable form; constraints name the permitted
harnesses (e.g. `cli-anything-gimp`, no GUI automation).

## Stage 3 — Tools (cli-anything)

| Command / MCP tool | Purpose |
|--------------------|---------|
| `cli-hub search <kw>` / `hub_search` | Registry first — 40+ harnesses already exist |
| `cli-hub install <name>` / `hub_install` | Install a harness (install the upstream app too) |
| `cli-anything-<name> --json <cmd>` | Structured output → evaluate-step evidence |
| `/cli-anything <path-or-repo>` | Generate a new harness (7-phase) only when the registry has no match |
| `/cli-anything:refine` · `:test` · `:validate` | Iterate harness coverage during the loop |

## Pattern quick reference

| Pattern | Command sequence |
|---------|------------------|
| **A — full-stack** | `specify init` → `/speckit.specify` → `ouroboros interview` → `seed generate` → `cli-hub install` → `ouroboros run`/`ralph` ↔ `evaluate` |
| **B — loop-only** | `ouroboros interview` → `seed generate` → (`cli-hub install` if software) → `ralph` ↔ `evaluate` |
| **C — docs-only** | `specify init` → full `/speckit.*` pipeline including `/speckit.implement` |

## Anti-patterns

- **Two SSOTs**: running `/speckit.implement` to completion *and* an ooo
  loop against a separately-evolved seed. Flow is one-way: spec → seed.
- **Generate-first**: building a harness before `cli-hub search`.
- **Seedless ralph**: a persistence loop with no frozen verification
  criteria.
- **Exit-code verification**: `evaluate` should inspect artifacts
  (`--json` output, file structure, pixels), not just process status.
