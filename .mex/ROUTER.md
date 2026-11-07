---
name: router
description: Session bootstrap and navigation hub. Read at the start of every session before any task. Contains project state, routing table, and behavioural contract.
edges:
  - target: context/architecture.md
    condition: when working on system design, integrations, or understanding how components connect
  - target: context/stack.md
    condition: when working with specific technologies, libraries, or making tech decisions
  - target: context/conventions.md
    condition: when writing new code, reviewing code, or unsure about project patterns
  - target: context/decisions.md
    condition: when making architectural choices or understanding why something is built a certain way
  - target: context/setup.md
    condition: when setting up the dev environment or running the project for the first time
  - target: patterns/INDEX.md
    condition: when starting a task — check the pattern index for a matching pattern file
last_updated: 2026-11-06
---

# Session Bootstrap

If you haven't already read `AGENTS.md`, read it now — it contains the project identity, non-negotiables, and commands.

Then read this file fully before doing anything else in this session.

## Current Project State

**Working:**
- 2026-11 full install: 425 catalog skills in shared root `~/.agents/skills` (verified 425/425 catalog slots), non-catalog skills preserved (`other-source` entries untouched)
- Host roots `claude`, `pi`, `gjc`, `antigravity`, `cursor`, `aside-user` are per-skill symlinked to the shared root — 425/425 healthy per host (cursor populated 2026-11-06, +423 links), broken-link scan 0
- `scripts/skills-upgrade.sh` (pull → doctor → shared-root refresh → prune-retired → link reconcile → verify) runs end-to-end with PASS; `scripts/refresh-host-links.py` is idempotent (re-run = empty plan); cron-safe PATH fallback for npx
- Weekly launchd job `com.jeo-skills.skills-upgrade` installed (Monday 09:30, logs in `~/.local/state/jeo-skill/upgrade.log`)
- Catalog projections validate; root `.gitignore` covers everything by default

**Not yet built:**
- No `update`/`sync` command inside the `jeo-skill` router CLI itself (upgrade flow lives in `scripts/skills-upgrade.sh`)

**Known issues:**
- CRITICAL: after symlink conversion, never re-run per-host copy targets (`jeo-skill install -a claude-code` / gjc / antigravity) — installer rmtree can follow symlink slots and delete shared-root originals. Shared-root refresh + `refresh-host-links.py` only.
- Stale-opencode and stale-cursor copy cleanup matters: catalog-matched stale copies reappear if someone re-runs per-host copy installs (see `refresh-host-links.py --replace-copies` to quarantine + convert)
- `opencode-config` host intentionally not in default link set (openspace already serves shared root; adding links would double-list skills)
- Version numbers and statuses are point-in-time claims; re-verify before relying on them. Details belong in `context/` files.## Routing Table

Load the relevant file based on the current task. Always load `context/architecture.md` first if not already in context this session.

| Task type | Load |
|-----------|------|
| Understanding how the system works | `context/architecture.md` |
| Working with a specific technology | `context/stack.md` |
| Writing or reviewing code | `context/conventions.md` |
| Making a design decision | `context/decisions.md` |
| Setting up or running the project | `context/setup.md` |
| Any specific task | Check `patterns/INDEX.md` for a matching pattern |

## Behavioural Contract

For every task, follow this loop:

1. **CONTEXT** — Load the relevant context file(s) from the routing table above. Check `patterns/INDEX.md` for a matching pattern. If one exists, follow it.
2. **BUILD** — Do the work. If a pattern exists, follow its Steps. If you are about to deviate from an established pattern, say so before writing any code — state the deviation and why.
3. **VERIFY** — Load `context/conventions.md` and run the Verify Checklist item by item. State each item and whether the output passes. Do not summarise — enumerate explicitly.
4. **DEBUG** — If verification fails or something breaks, check `patterns/INDEX.md` for a debug pattern. Follow it. Fix the issue and re-run VERIFY.
5. **GROW** — After meaningful work, run this binary checklist:
   - **Ground:** What changed in reality? Name the changed behavior, system, command, dependency, or workflow.
   - **Record:** If project state changed, update the "Current Project State" section above. If documented facts changed, update the relevant `context/` file surgically. Record a new behavioral claim about specific code as its own entity (`mex wiki apply` with a `create-entry` operation), grounded to every symbol whose change could make it false and naming the identifiers and literals it depends on.
   - **Connect:** Link section entities to their enclosing knowledge with `refines` using existing ids. Preview missing structural links with `mex wiki link-sections`, then apply explicitly. Review semantic relationships from evidence; do not connect records just because they share keywords or code groundings.
   - **Orient:** If this task can recur and no pattern exists, create one in `patterns/` using `patterns/README.md`, then add it to `patterns/INDEX.md`. If a pattern exists but you learned a gotcha, update it.
   - **Write:** Bump `last_updated` in every scaffold file you changed. Read `mex logging --json` before optional `mex log` notes: `significant` records material rationale, `checkpoints` batches useful notes at task/session boundaries, and `manual` avoids unsolicited notes. Honor explicit user log requests in every mode; mandatory workflow Activity and recovery audits remain required.
