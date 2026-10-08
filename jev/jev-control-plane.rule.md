<!-- JEV-CONTROL-PLANE:START -->
# Jev Control Plane

Opt-in runtime policy for a host agent environment, not an automatically enabled hook or provider plugin. The portable Agent Skill is instruction-only; it does not guarantee that a runtime loads or obeys these rules. There is no native hook installation. Every live operation is fail-closed and requires approval before hosted calls or model downloads.

## Activation and profiles

Jev is installed/configured only after opting in through `jev-setup.sh`. For a per-agent installation, identify the profile assigned to this runtime and use that same `--profile <id>` on every harness command. Never fall back to a different profile or the legacy shared config when the selected profile is missing or disabled. A no-profile install is supported only for an intentionally configured legacy setup.

Before any live operation, inspect the profile:

```sh
node ~/.agents/jev/jev-harness.mjs --profile jeopi status
```

`active` means configured, not proven inference readiness. Status exit `2` means inactive/unconfigured and the host continues with its normal permission policies. Exit `3` means fail closed: the configuration is invalid, or an evaluated operation chain has no usable backend. A down backend that no evaluated chain references never causes exit `3`. Exit `0` means the requested operation chain is not known unavailable. Use `--operation route-skills|prune-context|review` to inspect one chain; without it, status evaluates all three.

## Backends and tiers

The backend registry has exactly five kinds: `api`, `local`, `ollama`, `lmstudio`, and `systemone`.

| Kind | Driver and transport |
|---|---|
| `api` | TypeSafe `POST <JEV_API_ENDPOINT>` with `{state, model, questions}` and `Authorization: Bearer JEV_API_KEY`; model is `JEV_API_MODEL` or `jev-latest`. |
| `local` | Existing Python `/v1/systemone` server; it reads base `AutoModelForCausalLM` logits. |
| `ollama` | Native `/api/chat` JSON-from-chat adapter. |
| `lmstudio` | OpenAI-compatible `/v1/chat/completions` JSON-from-chat adapter. |
| `systemone` | `JEV_SYSTEMONE_DRIVER=typesafe` (default), `decide`, or `vllm-jev-decision`. |

For `systemone`, `typesafe` uses the TypeSafe body at `JEV_SYSTEMONE_ENDPOINT`; `decide` posts each question to `<endpoint>/v1/decide` with `kind`, `state`, `question`, and optional `options`, reading parallel `options`/`probabilities`; `vllm-jev-decision` posts each question to `<endpoint>/v1/completions` with `model`, a structured `[kind]`/`[state]`/`[question]`/`[options]` prompt, `max_tokens:1`, `temperature:1.0`, `logprobs`, `allowed_token_ids`, `add_special_tokens:false`, and `return_tokens_as_token_ids:true`, then reads top-logprob tokens.

Every backend defaults to tier `unvalidated`. Transport success or a loopback fixture does not establish calibration. A backend is `validated` only when the model id it reports serving matches `JEV_<KIND>_VALIDATED_MODEL` in that kind's env file, and only for calibrated decision-head drivers: `api` and `systemone` (`typesafe`, `decide`, `vllm-jev-decision`). `local`, `ollama`, and `lmstudio` are System 2 paths and stay `unvalidated` regardless of any attestation (`attestation.eligible: false`); no flag can promote them. `permit` is allowed only on `validated`. A stale or mismatched attestation is `unvalidated` (`state: "stale"`). Requests whose state exceeds the answering backend's limit are rejected before I/O as `unavailable` (the proposal is never trimmed); only the explicit fallback chain may try a larger-context backend.

## Per-operation resolution

Profiles store `JEV_ENABLED`, `JEV_MODE`, and optional operation policies in the base file. The operation keys are `JEV_ROUTE_SKILLS_BACKEND`, `JEV_PRUNE_CONTEXT_BACKEND`, and `JEV_REVIEW_BACKEND`, with ordered comma-separated allow-lists `JEV_ROUTE_SKILLS_FALLBACK`, `JEV_PRUNE_CONTEXT_FALLBACK`, and `JEV_REVIEW_FALLBACK`. Resolution is CLI `--backend <kind>` (must be eligible), then the operation backend, then `JEV_MODE`, then `api`; only the operation's explicit fallback list may be tried. No cross-profile fallback is permitted. `--model <id>` overrides the resolved model for that invocation. Envelopes report the selected `backend.kind/model/tier` and attempted kinds.

## Skill routing

```sh
node ~/.agents/jev/jev-harness.mjs --profile jeopi route-skills --top-k 3 "<task>"
```

The result retains `task`, mode, `families`, `topK`, token estimates, and `publicRegistryFallback`, and adds `selection` and advisory `routing`. Gate Nouls use threshold `0.30`; candidate fit uses threshold `0.30`. A gate below threshold returns explicit none (`topK: []`, `selection.reason: "gate"`) and `publicRegistryFallback`. Choice shards are selected by `ceil(catalogSize / choiceCap) <= 4`: sharded routing takes per-shard finalists then a final choice; otherwise a lexical shortlist is used. Candidates below the fit threshold produce explicit none (`selection.reason: "fits"`) and `publicRegistryFallback`.

When `.agent-skills/skills.json` has `model_policies`, `routing` provides advisory provider/model vocabulary such as `openai/gpt-6.1-sol`, `anthropic/claude-fable-5-1`, or `ollama/qwen2.5:7b`, with the resolved `policy`, ranked candidates, the chosen value (or `other`), and `provenance: {backend: {kind, driver, model, tier}}`. It is advisory only; no host adapter is installed this round. `model_policies` is not projected into `skills.toon` or README catalog tables.

## Context pruning

```sh
node ~/.agents/jev/jev-harness.mjs --profile jeopi prune-context < blocks.jsonl
```

The request state is `{blocks:[{id,text}...]}` and questions are keyed by position within each request as `essential::<index>` (duplicate block IDs are safe). Blocks are batched within the answering backend's state limit so none is judged unseen; an oversized single block comes back `keep` with a `reason`. Batch-capable drivers send one request per batch; other drivers loop per question. Keep a block unless the answer is `no` with confidence at least `0.8`; uncertain blocks remain.

## Review and receipts

```sh
node ~/.agents/jev/jev-harness.mjs --profile jeopi review "<task>" '<proposal-json>'
```

Review envelopes and results bind `backend: {kind, model, tier}`. A `permit` on any tier other than `validated` is downgraded to `proposal_only` with reason `Backend tier 'unvalidated' cannot authorize autonomous execution`. Receipt v2 is the SHA-256 of `JSON.stringify({v:2, task, proposal, decision, backend:{kind, model, tier}})`; preserve it as the audit binding. `reject` never proceeds and `unavailable` never authorizes action.

## Smoke and safety

Every command accepts `--backend <kind>` and `--model <id>`. `smoke [--backend <kind>] [--task "<text>"]` runs route/prune/review against the resolved backend with three golden tasks, never permits, and warns for an unvalidated tier. `self-test --mock` is offline and prints `N/N checks passed`; `--mock` never permits autonomous action.

Missing credentials, ineligible or unreachable backends, contract errors, malformed responses, and timeouts are `unavailable` and must not permit action. Obtain approval before sending task/context/proposal data to hosted services or downloading models. The host remains responsible for its own permissions and confirmation policies.
<!-- JEV-CONTROL-PLANE:END -->

