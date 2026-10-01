# Jev Control Plane Harness

TypeSafe Jev (System One) runtime enforcement for the `jeo` agent runtime: skill routing, context pruning, and a memory/commit gate — all fail-closed.

![Jev control-plane flow](./assets/jev-flow.gif)

## Setup (optional, TUI)

Jev is an opt-in feature. The jeo-skills installer (`install.sh`) ends with an interactive prompt; you can also run it directly:

```sh
bash jev/jev-setup.sh                                     # interactive: install? → mode (API / Local / Ollama / LM Studio)
JEO_SKILLS_JEV=api JEV_API_KEY=... bash jev/jev-setup.sh  # non-interactive API mode
JEO_SKILLS_JEV=local bash jev/jev-setup.sh                # non-interactive local (full-precision) mode
JEO_SKILLS_JEV=ollama bash jev/jev-setup.sh               # non-interactive quantized mode via ollama
JEO_SKILLS_JEV=lmstudio bash jev/jev-setup.sh             # non-interactive LM Studio mode (macOS)
JEO_SKILLS_JEV=skip bash install.sh                       # skip entirely
```

- **API mode** — prompts for your TypeSafe `JEV_API_KEY` (hidden input) and writes `~/.agents/jev/.env` (mode 600). Uses `https://api.typesafe.ai/v1/systemone`.
- **Local mode** — creates `~/.agents/jev/venv` (torch/transformers/huggingface_hub), downloads the open-weight **`autotrust/JEV-9B`** from Hugging Face (~18 GB) to `~/.agents/jev/models/JEV-9B`, and sets `JEV_MODE=local`. Start the backend with `~/.agents/jev/venv/bin/python ~/.agents/jev/jev_local_server.py` (same `/v1/systemone` contract on `127.0.0.1:8763`; override with `JEV_ENDPOINT`). Needs ~18 GB RAM. Note: JEV-9B is a third-party distillation of Jev 1.13, **not** TypeSafe's original hosted model.
- **Ollama mode** — pulls the quantized **`hf.co/mradermacher/JEV-9B-GGUF:Q4_K_M`** (~5.6 GB download, ~6 GB RAM; recommended on 16 GB machines). The harness speaks ollama's native API (`127.0.0.1:11434`, `think:false` to skip Qwen3.5 reasoning traces) and implements the systemone contract (noul probability / choice distribution) on top of chat completions. Pin with `JEV_LOCAL_MODEL`, override endpoint with `JEV_ENDPOINT`.
- **LM Studio mode (macOS)** — same quantized GGUF served by LM Studio's OpenAI-compatible server (`127.0.0.1:1234`). If the `lms` CLI is present, setup downloads/loads the model; otherwise load it in the UI and start the server (Developer → Start Server). The harness auto-resolves the loaded model id from `/v1/models` (pin with `JEV_LOCAL_MODEL`).


Check activation any time: `node ~/.agents/jev/jev-harness.mjs status` (exit 0 = active, 2 = inactive). When inactive, agents skip all Jev gates and ask the user instead.

## Structure

```
~/.agents/jev/
├── jev-harness.mjs        # Node ESM harness + CLI (zero deps)
├── jev-setup.sh           # install-time TUI (mode select, API key entry, model download)
├── jev_local_server.py    # local backend serving /v1/systemone from JEV-9B
├── .env                   # JEV_MODE / JEV_API_KEY / JEV_ENDPOINT / JEV_LOCAL_MODEL(_DIR) (600)
├── venv/ + models/JEV-9B/ # local (full-precision) mode only

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
node ~/.agents/jev/jev-harness.mjs status   # exit 0 active, 2 inactive

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
- **Mock never permits**: a mock `permit` is downgraded to `proposal_only`; real autonomy requires an active backend — `JEV_API_KEY` → `https://api.typesafe.ai/v1/systemone` (api mode) or a running local backend (`jev_local_server.py`, ollama, or LM Studio serving JEV-9B).

- **Catalog is read-only**: the harness only reads `skills.json`, never mutates it.
- **Receipts are binding**: keep the SHA-256 receipt with each decision as the audit record.
- **Two discovery surfaces**: local catalog → `route-skills` / `jeo-skill`; public registry → `find-skills` skill. Never mix them.

## Provenance

Contract logic ported from the verified Aside session runner (`2026-10-01_Drjt4MX2KkktQp3o/tmp/jev_runner.mjs`). Runbook: `jeo-skills/.mex/patterns/jev-control-plane.md`. Flow frames generated with the `god-tibo-imagen` skill (`gti`), assembled with ffmpeg.
