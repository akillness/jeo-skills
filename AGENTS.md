---
name: agents
description: Always-loaded project anchor. Read this first. Contains project identity, non-negotiables, commands, and pointer to ROUTER.md for full context.
last_updated: 2026-10-02
---

# jeo-skills

## What This Is
A curated, cross-platform catalog of 353 categorized AI agent skills (`.agent-skills/<name>/SKILL.md`), with all taxonomy/relationship metadata centralized once in `.agent-skills/skills.json` and installable selectively via the `jeo-skill` router CLI.

## Non-Negotiables
- Never duplicate a skill's category/subcategory/tags/relationships in its own `SKILL.md` — that metadata lives once in `.agent-skills/skills.json`
- Never run `repair-skill-frontmatter.py` or `flatten_skills.py` in mutating mode from CI — only `--check`/`--dry-run` (a prior mutating CI config corrupted 26 skill descriptions)
- Never create category subfolders under `.agent-skills/` — one flat `<name>/SKILL.md` per skill, enforced by `flatten_skills.py --dry-run`
- Never hand-edit `.agent-skills/skills.toon` or the README category tables to "fix" a validation failure — they are projections of `skills.json`; fix the manifest instead

## Commands
- Validate catalog: `python3 scripts/validate-catalog-projections.py`
- Frontmatter audit: `python3 scripts/repair-skill-frontmatter.py --check`
- Layout check: `python3 flatten_skills.py --dry-run`
- Browse/install: `jeo-skill categories` / `jeo-skill install <names> --dry-run`

## Code Graph
The repo is indexed into `.mex/graph.db`. Use it to avoid re-reading code you already have — it is one tool alongside Grep/Glob, not a replacement for them.
- Resolve the binary before the first call. TeX Live also ships a `mex`, and on this machine bare `mex` resolves to it. `mex --version` must print a bare semver (e.g. `0.7.1`); if it prints `pdfTeX ...` or is missing, use `mex-agent` (installed at `~/.local/bin/mex-agent`) or `npx mex-agent`. Sandboxes with a minimal PATH (e.g. Aside) see neither — call the package entrypoint by absolute path instead. Never assume bare `mex` is mex-agent.
- If you know the symbol name, go straight to it: `mex graph query <who-calls|what-calls|where-defined> <symbol>` and `mex graph get <id>` are exact and cheap. This is the strongest part of the graph. Give it exact names — an approximate name can return a confident wrong match.
- Exploring an unfamiliar task? `mex graph scope "<task>"` returns a compact JSONL manifest (`meta`, `fact`s, `summary`). Scope matches on words, not meaning: if your phrasing does not share vocabulary with the code, results will be weak. Treat it as a starting point, never as a complete answer.
- If the manifest does not clearly contain what you need, use Grep/Glob instead. Do not expand node ids that look irrelevant, and do not re-run `scope` with reworded phrasing more than once — that costs more than searching directly.
- Treat any source the graph DOES return as ALREADY READ; do not re-open those files.
- Pick 1-3 relevant node ids from the manifest and expand only those with `mex graph get <id> --detail source`.
- Before editing a symbol, run `mex impact <symbol|file>` to see affected callers and scaffold memory.
- If a result is `truncated`, do NOT repeat the broad query — narrow the task or use the summary's `suggestedNextCommands`. Scale through a few focused calls, never one giant response.
- During `mex sync`, adjudicate any AMBIGUOUS grounding; after repairs, ensure the refreshed grounding is re-emitted.

## After Every Task
After meaningful work, run GROW:
- Ground: what changed in reality?
- Record: update `.mex/ROUTER.md` and relevant `.mex/context/` files
- Orient: create or update a `.mex/patterns/` runbook if this can recur
- Write: bump `last_updated` on changed scaffold files and run `mex log` when rationale matters

## Navigation
At the start of every session, read `.mex/ROUTER.md` before doing anything else.
For full project context, patterns, and task guidance — everything is there.
