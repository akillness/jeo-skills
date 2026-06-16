---
name: spec-stack
description: >
  Compose GitHub spec-kit, Ouroboros (ooo), and HKUDS CLI-Anything into one
  spec-driven delivery stack — Write → Freeze → Run, verified. Author the
  spec with `/speckit.*`, freeze it as an immutable ooo seed with
  machine-checkable acceptance criteria, arm the loop with agent-native
  CLI harnesses from CLI-Hub (`--json` output as evaluate evidence), and
  loop until verification passes. Routes three patterns — full-stack
  (spec-kit → ooo → cli-anything), loop-only (ooo), docs-only (spec-kit) —
  with explicit anti-patterns (two spec SSOTs, harness-first builds,
  seedless ralph loops). Use when the user wants spec-to-verified-artifact
  delivery, wants spec-kit and ooo to work together without fighting, or
  needs real software driven inside a verified loop. Triggers on:
  spec-stack, spec stack, write freeze run, spec to verified, speckit +
  ooo, ooo + cli-anything, spec-driven loop, verified delivery stack,
  seed with tools.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: >
  Cross-platform composition wrapper usable from Claude Code, Codex,
  Gemini CLI, Cursor, opencode, and any runtime where the three upstream
  tools install. Routes spec authoring detail to `spec-kit`, loop/seed
  mechanics to `ooo`, harness generation to `cli-anything`, packet-first
  artifact selection to `bmad`, and plan approval to `plannotator`.
metadata:
  tags: spec-stack, spec-kit, ooo, ouroboros, cli-anything, spec-driven, verification, loop, seed, harness, composition, sdd
  platforms: Claude, Codex, Gemini, Cursor, OpenCode, All
  keyword: spec-stack
  version: "1.0.0"
  composes: spec-kit, ooo, cli-anything
  source: akillness/jeo-skills
---

# spec-stack — Write → Freeze → Run, Verified

spec-stack composes three skills that own different layers of spec-driven
delivery and keeps them from fighting over the same job:

| Layer | Skill | Owns |
|-------|-------|------|
| **Spec (what)** | [`spec-kit`](../spec-kit/SKILL.md) | Human-readable SDD artifacts via `/speckit.constitution` → `specify` → `plan` → `tasks`; shareable across 30+ agents |
| **Loop (until done)** | [`ooo`](../ooo/SKILL.md) | Socratic interview to ambiguity ≤ 0.2, immutable seed, drift measurement, persistent verify-before-done loop (ralph) |
| **Tools (with what)** | [`cli-anything`](../cli-anything/SKILL.md) | Agent-native CLIs for real software — CLI-Hub registry, `--json` output, artifact-level verification |

The stack's one rule: **spec-kit writes, ooo freezes and loops,
cli-anything is the hands.** Each layer hands a concrete artifact to the
next — `spec.md`/`plan.md` feed the seed interview, the seed names the
harnesses the loop may use, and harness `--json` output is the evidence
the evaluate step accepts.

## When to use this skill

- The user wants the **full path from a written spec to a verified
  artifact**, not just one of the three tools
- The user asks how spec-kit and ooo should **work together** (which owns
  the spec, which owns completion) or how to avoid duplicating the spec
- The implementation must **drive real software** (image/video/office/3D/
  GIS/game tooling) inside a verified loop instead of one-shot codegen
- The user says "spec-stack", "write freeze run", or names two or more of
  `spec-kit`, `ooo`, `cli-anything` in one workflow

## When not to use this skill

- Only **authoring SDD documents** for one or more agents → use `spec-kit`
- Only a **verify-until-done loop** with no document artifacts → use `ooo`
- Only **installing or generating a CLI harness** → use `cli-anything`
- Deciding **which planning artifact comes next** (brief, PRD,
  architecture) → use `bmad`
- **Human review/approval** of an existing plan or diff → use `plannotator`

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Python 3.11+ | `specify-cli` requires 3.11+; CLI-Hub needs 3.10+ |
| `uv` (recommended) or `pipx`/`pip` | Used by `scripts/install.sh` for all three tools |
| One supported AI agent | Claude Code, Codex, Gemini, Cursor, opencode, … |
| Target software (pattern A) | Harnesses call the real backend — install the upstream app too |

## Instructions

### Step 0 — Choose the composition pattern

| Pattern | When | Layers |
|---------|------|--------|
| **A — full-stack** | Medium+ work that touches real software and needs both shared docs and a verified loop | spec-kit → ooo → cli-anything |
| **B — loop-only** | Single-session "keep going until verified" with no document deliverable | ooo (+ cli-anything if software is involved) |
| **C — docs-only** | Multi-agent/team needs the `.specify/` artifacts; completion is enforced elsewhere | spec-kit |

If the user has not stated a pattern, default to A when external software
or acceptance evidence is involved, B for code-only persistence, C for
documentation handoffs.

### Step 1 — Install the stack

```bash
bash scripts/install.sh                      # specify-cli + cli-anything-hub
SPEC_STACK_OOO=1 bash scripts/install.sh     # also pip-install ouroboros-ai
```

On Claude Code, prefer the ooo plugin instead of pip:
`claude plugin marketplace add Q00/ouroboros`. Verify with
`specify --version`, `cli-hub list`, and `ouroboros --help` (or the
`ouroboros_*` MCP tools).

### Step 2 — Write the spec (spec-kit)

```bash
specify init . --integration claude
```

Then inside the agent: `/speckit.constitution` → `/speckit.specify` →
`/speckit.clarify` (only if open questions remain). Stop before
`/speckit.implement` — implementation belongs to the loop layer in
pattern A. Write success criteria as **machine-checkable statements**
("output PNG is 1024×1024, verified by pixel inspection"), not vibes
("image looks right") — Step 3 and Step 5 depend on this.

### Step 3 — Freeze the contract (ooo)

Feed `spec.md`/`plan.md` into the ooo interview (brownfield weighting),
drive ambiguity ≤ 0.2, then generate the immutable seed:

```bash
ouroboros interview --context .specify/   # or MCP: ouroboros_interview
ouroboros seed generate                   # or MCP: ouroboros_generate_seed
```

Two seed rules that make the stack work:

1. **Success criteria mirror the spec's acceptance criteria** in
   machine-checkable form — the evaluate step will demand evidence.
2. **Constraints name the tools**: e.g. "image operations go through the
   `cli-anything-gimp` harness; GUI automation is out of contract." This
   turns tool drift into measurable spec drift.

The seed is the execution SSOT from here on; `spec.md` stays the document
SSOT. Direction is one-way: spec-kit → seed. If requirements change,
update the spec first, then re-freeze.

### Step 4 — Arm the tools (cli-anything)

Before writing integration code, search the registry:

```bash
cli-hub search <keyword>     # 40+ harnesses exist — seconds, not a session
cli-hub install <name>       # install the harness + the upstream app
```

Only when the registry has no match, generate: `/cli-anything <path-or-repo>`
(7-phase pipeline), then `/cli-anything:refine` as needed. Generation is
the fallback, never the default.

### Step 5 — Run the loop

```bash
ouroboros run        # or MCP: ouroboros_execute_seed; ralph for persistence
ouroboros evaluate   # or MCP: ouroboros_evaluate
```

In the evaluate step, **verify artifacts, not exit codes**: use the
harness `--json` output, magic bytes, document structure, or pixel/audio
checks as evidence — the same discipline cli-anything's own test suite
uses. On failure the loop continues; on repeated failure use ooo's
unstuck step instead of blind retries. Pattern A users who want the
spec-kit task list can run `/speckit.implement` per task inside the loop
— the seed still gates completion.

### Step 6 — Plugin-style installation alongside jeo-skills

```bash
# Project install (writes into .agents/skills/spec-stack/)
npx skills add https://github.com/akillness/jeo-skills --skill spec-stack

# Global install for every detected agent
npx skills add -g https://github.com/akillness/jeo-skills --skill spec-stack

# Target specific agents
npx skills add -g https://github.com/akillness/jeo-skills --skill spec-stack -a claude-code -a codex -y
```

Installing `spec-stack` does not auto-install the three layer skills;
install whichever you lack the same way (`--skill spec-kit`, `--skill ooo`,
`--skill cli-anything`).

## Output format

When the user asks `spec-stack` for help, return a compact brief:

```markdown
# spec-stack Routing Brief

## Scope
- Pattern: full-stack | loop-only | docs-only
- Target software: <name> | none | undecided
- Stack state: nothing-installed | spec-written | seed-frozen | tools-armed | loop-running

## Recommended next move
- install-stack | specify-init | write-spec | freeze-seed | hub-search | run-loop | evaluate

## Why
- 2-3 bullets grounded in the user's packet

## Route-outs
- `spec-kit` / `ooo` / `cli-anything` for single-layer work
- `bmad` for choosing the next planning artifact
- `plannotator` for human plan approval before implement
```

## Examples

### Example 1 — Pattern A end to end (image pipeline against real software)

```bash
bash scripts/install.sh                      # specify-cli + cli-anything-hub
specify init . --integration claude          # spec layer
# in the agent: /speckit.constitution → /speckit.specify → /speckit.clarify
ouroboros interview --context .specify/      # loop layer: drive ambiguity ≤ 0.2
ouroboros seed generate                      #   freeze; criteria mirror spec.md
cli-hub search image && cli-hub install gimp # tool layer: registry first
ouroboros run                                # implement against the seed
ouroboros evaluate                           # verify --json artifacts, loop on fail
```

### Example 2 — Routing a vague combined request

User: "spec-kit이랑 ooo 같이 쓰고 싶은데 어디서부터?"
→ Return the Routing Brief with `Pattern: full-stack`,
`Stack state: nothing-installed`, `Recommended next move: install-stack`,
and route-outs left intact. Do not start `/speckit.implement` — in
pattern A completion belongs to the ooo loop.

### Example 3 — Near-miss that should route out

User: "GIMP용 CLI 하니스만 만들어줘" → single-layer work; hand off to
`cli-anything` (registry search first), no seed or spec ceremony.

## Best practices

1. **One SSOT per concern** — spec.md is the document SSOT, seed.yaml the
   execution SSOT, flowing one way. Running both pipelines fully in
   parallel creates two competing specs.
2. **Registry before generation** — `cli-hub search` costs seconds; a
   7-phase harness build costs a session.
3. **Machine-checkable acceptance criteria** — write them in
   `/speckit.specify`, mirror them in the seed, demand them in evaluate.
4. **Name tools in seed constraints** — uncontracted tool choice is
   invisible drift.
5. **No ralph without a seed** — a persistent loop without verification
   criteria runs "until tired", not "until done". Seed first, loop second.
6. **Hand the plan to `plannotator`** before implement on level 2+ work;
   the approval gate sits between Step 3 and Step 5.

## References

- Layer skills: [`../spec-kit/SKILL.md`](../spec-kit/SKILL.md),
  [`../ooo/SKILL.md`](../ooo/SKILL.md),
  [`../cli-anything/SKILL.md`](../cli-anything/SKILL.md)
- Upstream: <https://github.com/github/spec-kit>,
  <https://github.com/Q00/ouroboros>,
  <https://github.com/HKUDS/CLI-Anything>
- Installer script: [`scripts/install.sh`](scripts/install.sh)
- Command crosswalk + handoff map: [`references/commands.md`](references/commands.md)
- Adjacent skills: `../bmad/SKILL.md`, `../plannotator/SKILL.md`
- License: MIT (this wrapper); upstream licenses apply to each tool
