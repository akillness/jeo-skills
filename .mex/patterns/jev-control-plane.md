---
name: jev-control-plane
description: Runbook for the Jev System One runtime harness that routes the jeo-skills catalog, prunes context, and gates memory/commit actions.
last_updated: 2026-10-01
---

# Jev Control Plane Runbook

The jeo runtime enforces TypeSafe Jev (System One) decisions via a harness whose source of truth now lives IN this repo and is installed globally by the setup guide:

- Source of truth: `jev/` in this repo (`jev-harness.mjs`, `README.md`, `jev-control-plane.rule.md`)
- Installed by: `setup-all-skills-prompt.md` Step 5 ("Jev control-plane harness") → `~/.agents/jev/jev-harness.mjs` + `~/.agents/rules/jev-control-plane.md`; verified with `self-test --mock` (8/8)
- Catalog resolution (first VALID wins, stale candidates fall through): `$JEV_CATALOG_PATH` → `~/.agents/jeo-skills-repo/.agent-skills/skills.json` → `$PWD/.agent-skills/skills.json`
- Discovery split: local catalog → `route-skills`/`jeo-skill`; weak local match emits `publicRegistryFallback` → use the `find-skills` skill (`npx skills find`, public skills.sh registry)
- Provenance: verified contract runner at `~/.aside/u/0/sessions/2026-10-01_Drjt4MX2KkktQp3o/tmp/jev_runner.mjs` (`~/Desktop/JEV_HARNESS_README.md` is now a pointer stub)


## Commands
- `node ~/.agents/jev/jev-harness.mjs status` — optional-feature activation check: exit 0 active (key via env or `~/.agents/jev/.env`), exit 2 inactive → skip Jev enforcement, ask user at gates
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

## Install-time setup (optional feature, 2026-10-01)
- `install.sh` ends with the `jev/jev-setup.sh` TUI (skip with `JEO_SKILLS_JEV=skip`; force with `=api|=local`).
- Two backends via `~/.agents/jev/.env` (`JEV_MODE`): `api` (JEV_API_KEY → api.typesafe.ai) and `local` (`jev_local_server.py` serving the `/v1/systemone` contract from the open-weight `autotrust/JEV-9B` HF distillation, venv at `~/.agents/jev/venv`, model at `~/.agents/jev/models/JEV-9B`, endpoint 127.0.0.1:8763, override `JEV_ENDPOINT`).
- `jev-harness.mjs status` → exit 0 active / 2 inactive; inactive ⇒ skip Jev gates, ask the user. `--mock` is never an activation substitute.

## Quantized backends (2026-10-01)
- `JEV_MODE` now also accepts `ollama` and `lmstudio` (TUI options 3/4; option 4 shown on Darwin only).
- ollama: native `/api/chat` with `think:false` (suppresses Qwen3.5 reasoning; 4-noul review ≈18s, choice routing ≈13s at 16 tok/s on M2 16GB). Model `hf.co/mradermacher/JEV-9B-GGUF:Q4_K_M` (~5.6GB).
- lmstudio: OpenAI `/v1/chat/completions` on :1234, model id auto-resolved from `/v1/models`, max_tokens 2048 for reasoning budget.
- Full-precision `local` mode needs ~18GB RAM — not runnable on 16GB machines; route those to ollama mode.
- setup gotcha: SCRIPT_DIR==JEV_HOME self-copy was fatal under `set -e`; guarded with `-ef`.
