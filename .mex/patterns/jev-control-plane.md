---
name: jev-control-plane
description: Runbook for the Jev System One runtime harness that routes the jeo-skills catalog, prunes context, and gates memory/commit actions.
last_updated: 2026-10-02
---

# Jev Control Plane Runbook

The jeo runtime enforces TypeSafe Jev (System One) decisions via a global harness that lives OUTSIDE this repo but reads this repo's catalog:

- Harness: `~/.agents/jev/jev-harness.mjs` (Node ESM + CLI) — canonical README with structure/flow/list + animated GIF at `~/.agents/jev/README.md`
- Global rule: `~/.agents/rules/jev-control-plane.md`
- Catalog source (read-only): `.agent-skills/skills.json` (resolved at `/Users/jangyoung/.superset/projects/jeo-skills/.agent-skills/skills.json`; fallback path in the harness)
- Discovery split: local catalog → `route-skills`/`jeo-skill`; weak local match emits `publicRegistryFallback` → use the `find-skills` skill (`npx skills find`, public skills.sh registry)
- Provenance: verified contract runner at `~/.aside/u/0/sessions/2026-10-01_Drjt4MX2KkktQp3o/tmp/jev_runner.mjs` (`~/Desktop/JEV_HARNESS_README.md` is now a pointer stub)

## Commands
- `node ~/.agents/jev/jev-harness.mjs route-skills [--mock] [--top-k N] "<task>"` — Top-K skill selection over catalog category families (~99% token savings vs full 352-skill catalog)
- `... prune-context [--mock]` — JSONL `{id,text}` blocks on stdin → keep/drop verdicts for context compaction
- `... review [--mock] "<task>" '<proposal-json>'` — Question Set v4 → permit/proposal_only/reject/unavailable + SHA-256 receipt (threshold 0.8)
- `... self-test --mock` — 8 contract checks; must print 8/8

## Invariants
- Fail-closed: missing `JEV_API_KEY`, timeouts, or malformed responses → `unavailable`, never autonomous action.
- Mock mode never permits: a mock `permit` is downgraded to `proposal_only` in `review()`.
- The harness only READS `skills.json`; never let it (or related work) mutate the catalog.

## When the catalog schema changes
`loadCatalog()` asserts top-level `categories` object + `skills` array with `name/category/description` per skill. If `skills.json` shape changes, update that validator and re-run `self-test --mock`.
