# Jev Control Plane Harness

TypeSafe Jev (System One) runtime enforcement for the `jeo` agent runtime: skill routing, context pruning, and a memory/commit gate — all fail-closed.

![Jev control-plane flow](./assets/jev-flow.gif)

## Structure

```
~/.agents/jev/
├── jev-harness.mjs        # Node ESM harness + CLI (zero deps)
├── README.md              # this file
└── assets/
    ├── jev-flow.gif       # animated flow (route → prune → review)
    └── frames/f1..f3.png  # source frames (god-tibo-imagen)

~/.agents/rules/jev-control-plane.md   # always-applied runtime rule
~/.claude/skills/                      # globally installed interview skills
.agent-skills/skills.json              # local catalog (read-only input, 352+ skills)
```

## Flow

1. **route-skills** — task → Jev Choice over catalog category families → Top-K skills (default 3) injected into context instead of the full 352-skill catalog (~99% token savings). No confident local match → `publicRegistryFallback` routes discovery to the **find-skills** skill (`npx skills find "<query>"`, public skills.sh registry, triage before install).
2. **prune-context** — JSONL `{id,text}` blocks on stdin → `keep`/`drop` verdicts for long-session compaction. Only Jev-marked `drop` blocks may be removed.
3. **review** — task + proposal → Question Set v4 → `permit` / `proposal_only` / `reject` / `unavailable` + SHA-256 receipt (threshold 0.8). Gates `.jeo/memory`, llm-wiki writes, and agent-authored commits.
4. **self-test** — 8 offline contract checks; must print `8/8 checks passed`.

## Commands

```sh
node ~/.agents/jev/jev-harness.mjs route-skills [--mock] [--top-k N] "<task>"
cat blocks.jsonl | node ~/.agents/jev/jev-harness.mjs prune-context [--mock]
node ~/.agents/jev/jev-harness.mjs review [--mock] "<task>" '<proposal-json>'
node ~/.agents/jev/jev-harness.mjs self-test --mock
```

## Decision table (review)

| Verdict | Meaning | Agent behavior |
|---|---|---|
| `permit` | All 4 questions favorable ≥ 0.8 | Proceed autonomously |
| `proposal_only` | Any question below threshold | Stop, ask the user |
| `reject` | Validation failure (e.g. path traversal) | Do not proceed |
| `unavailable` | No key / timeout / malformed response | Fail closed — no autonomous action |

## Invariants

- **Fail-closed**: transport errors never permit action.
- **Mock never permits**: a mock `permit` is downgraded to `proposal_only`; real autonomy requires `JEV_API_KEY` → `https://api.typesafe.ai/v1/systemone`.
- **Catalog is read-only**: the harness only reads `skills.json`, never mutates it.
- **Receipts are binding**: keep the SHA-256 receipt with each decision as the audit record.
- **Two discovery surfaces**: local catalog → `route-skills` / `jeo-skill`; public registry → `find-skills` skill. Never mix them.

## Provenance

Contract logic ported from the verified Aside session runner (`2026-10-01_Drjt4MX2KkktQp3o/tmp/jev_runner.mjs`). Runbook: `jeo-skills/.mex/patterns/jev-control-plane.md`. Flow frames generated with the `god-tibo-imagen` skill (`gti`), assembled with ffmpeg.
