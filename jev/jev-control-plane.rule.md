<!-- JEV-CONTROL-PLANE:START -->
# Jev Control Plane

Always-applied runtime enforcement for the `jeo` agent runtime.

## Skill Routing
Before loading or selecting skills for a task, run:

```sh
node ~/.agents/jev/jev-harness.mjs route-skills "<task>"
```

Inject only the returned Top-K skills into the active context; do not preload the full catalog. Top-K defaults to 3. `--mock` enables deterministic offline keyword routing only. If the result contains `publicRegistryFallback` (no confident local-catalog match), route discovery through the `find-skills` skill: search the public skills.sh registry with `npx skills find "<query>"`, triage install count/source/stars per that skill's rules, and never auto-install without explicit user confirmation.

## Long-Session Context
Before compacting a long session, pass candidate `{ "id": "...", "text": "..." }` blocks as JSON Lines to:

```sh
node ~/.agents/jev/jev-harness.mjs prune-context
```

Only drop blocks Jev marks `drop`; preserve `keep` blocks. Mock mode applies conservative local heuristics and is proposal-biased.

## Memory and Commit Gate
Before writing to `.jeo/memory` or the llm-wiki, or committing agent-authored patches, run the `review` subcommand with the task and proposal. Proceed autonomously only for `permit`. For `proposal_only`, stop and ask the user. For `reject`, do not proceed. For `unavailable`, fail closed: no autonomous action. Preserve the SHA-256 receipt with the decision as the audit binding.

```sh
node ~/.agents/jev/jev-harness.mjs review "<task>" '<proposal-json>'
```

## Activation (optional feature)
Jev is OPTIONAL and installed/configured by `jev-setup.sh` during jeo-skills installation. Check activation with `node ~/.agents/jev/jev-harness.mjs status` (exit 0 = active, 2 = inactive). When INACTIVE (no API key in api mode, or the local/ollama/LM Studio server not running): skip Jev routing/pruning/review gates entirely and fall back to asking the user before `.jeo/memory`/llm-wiki writes and agent-authored commits. Never use `--mock` as a substitute activation gate.

## Transport and Backends
Four backends, selected by `JEV_MODE` in `~/.agents/jev/.env`:
- `api` (default): posts typed state/questions to `https://api.typesafe.ai/v1/systemone` with `JEV_API_KEY`.
- `local`: posts to `http://127.0.0.1:8763/v1/systemone` (override with `JEV_ENDPOINT`), served by `jev_local_server.py` running the full-precision open-weight `autotrust/JEV-9B` (~18 GB RAM; a third-party distillation of Jev 1.13, not the original hosted model).
- `ollama`: quantized `hf.co/mradermacher/JEV-9B-GGUF:Q4_K_M` (~6 GB RAM) via the native ollama API at `http://127.0.0.1:11434` with `think:false`; the harness implements the systemone contract (noul probability / choice distribution) on top of chat completions. Override model with `JEV_LOCAL_MODEL`, endpoint with `JEV_ENDPOINT`.
- `lmstudio` (macOS): same quantized GGUF served by LM Studio's OpenAI-compatible server at `http://127.0.0.1:1234`; the loaded model id is auto-resolved from `/v1/models` (pin with `JEV_LOCAL_MODEL`).


Missing credentials, unreachable backends, request errors, malformed responses, and timeouts are `unavailable` and must not permit action. `--mock` works offline using deterministic heuristics/fixtures, is proposal-biased, and must never silently permit autonomous action; review mock outcomes require explicit human confirmation regardless of simulated verdict.
<!-- JEV-CONTROL-PLANE:END -->

