---
name: jev-control-plane
description: >
  Configure and operate Jev independently for each coding-agent environment,
  including enable/disable, status checks, and API or local backend selection.
  Use when installing the Jev Agent Skill plugin, changing a Jev profile, or
  routing, pruning, or reviewing work with Jev. Jev remains prompt-driven; this
  skill does not install a native hook or guarantee automatic enforcement.
---

# Jev Control Plane

Use this skill to operate Jev for the coding-agent environment that loaded it. The harness is a callable decision service, not an automatic interception hook. This Agent Skill is instruction-only: do not claim that a host automatically blocked or approved an action, and do not promise native hooks.

## When to use this skill

Use it when installing or configuring Jev for one runtime, checking or toggling that runtime's profile, selecting a backend, or invoking an approved routing, pruning, or review command. Jev is optional. Keep each profile isolated and fail closed when a selected operation has no usable backend.

## Select the current agent profile

Use a unique lower-kebab-case profile ID for each independent agent environment, such as `jeopi`, `gjc`, or `aside-u0`. `--profile` selects Jev state; `--agent` selects the Agent Skill destination. Never silently switch profiles or fall back to another profile or the legacy shared config.

Check the exact profile before every live operation:

```sh
node ~/.agents/jev/jev-harness.mjs --profile jeopi status
```

Status exit `2` means inactive or unconfigured; skip Jev gates and follow the host's normal permission policies. Exit `3` means fail closed: the configuration is invalid, or an evaluated operation chain has no usable backend; a down backend that no evaluated chain references never causes it. Exit `0` means the requested chain is not known unavailable, not that model quality or host enforcement is proven. Use `--operation route-skills|prune-context|review` for one operation; otherwise all three chains are evaluated.

## Configure one environment with jev-plugin.mjs

For initial setup or updates, use jev-plugin.mjs with preview-then-apply pattern:

```sh
# Preview configuration (shows what will be set, no changes)
node ~/.agents/jev/jev-plugin.mjs --agent jeopi --profile jeopi --mode api configure

# Apply configuration (invokes setup and writes files)
node ~/.agents/jev/jev-plugin.mjs --agent jeopi --profile jeopi --mode api configure --apply

# Enable profile (preview then apply)
node ~/.agents/jev/jev-plugin.mjs --profile jeopi enable
node ~/.agents/jev/jev-plugin.mjs --profile jeopi enable --apply

# Disable profile  
node ~/.agents/jev/jev-plugin.mjs --profile jeopi disable --apply

# Check profile status (always read-only)
node ~/.agents/jev/jev-plugin.mjs --profile jeopi status
```

`configure` with `--agent` and `--mode` prepares or updates a profile. Without `--apply`, it shows what would change. With `--apply`, it writes configuration files. `enable` and `disable` toggle `JEV_ENABLED`; without `--apply` they show what would change, with `--apply` they write the change. `status` shows current configuration without reaching any backend.
The backend registry has exactly five kinds: `api`, `local`, `ollama`, `lmstudio`, and `systemone`.

- `api`: TypeSafe `POST <JEV_API_ENDPOINT>` with `{state, model, questions}` and `Authorization: Bearer JEV_API_KEY`.
- `local`: existing Python `/v1/systemone` server reading base-model logits.
- `ollama`: native `/api/chat` JSON-from-chat adapter.
- `lmstudio`: OpenAI-compatible `/v1/chat/completions` JSON-from-chat adapter.
- `systemone`: `JEV_SYSTEMONE_DRIVER=typesafe` (default), `decide` (`<endpoint>/v1/decide`), or `vllm-jev-decision` (`<endpoint>/v1/completions` with logprobs).

Every kind defaults to tier `unvalidated`. A response or loopback fixture proves transport only. Tier `validated` requires an exact served-model attestation in the kind env file, `JEV_<KIND>_VALIDATED_MODEL=<model id>`, and is honored only for calibrated decision-head drivers: `api` and `systemone` (`typesafe`, `decide`, `vllm-jev-decision`). `local`, Ollama, and LM Studio are System 2 paths and can never be validated (`attestation.eligible: false`), so they can never permit. Stale or mismatched attestations are `unvalidated`. Oversized review input is rejected as `unavailable` rather than trimmed.

## Per-operation policy and resolution

The base profile stores `JEV_ENABLED`, `JEV_MODE`, and optional operation keys:

- `JEV_ROUTE_SKILLS_BACKEND`, `JEV_PRUNE_CONTEXT_BACKEND`, `JEV_REVIEW_BACKEND`
- `JEV_ROUTE_SKILLS_FALLBACK`, `JEV_PRUNE_CONTEXT_FALLBACK`, `JEV_REVIEW_FALLBACK`

Each fallback is an ordered comma-separated allow-list; only those kinds may be attempted. Resolution is CLI `--backend <kind>` (must be eligible), then the operation backend, then `JEV_MODE`, then `api`. `--model <id>` overrides the resolved model for that invocation. No cross-profile fallback is allowed. Envelopes report `backend: {kind, model, tier}` and attempted kinds.

## Run approved operations

```sh
node ~/.agents/jev/jev-harness.mjs --profile jeopi route-skills --top-k 3 "<task>"
node ~/.agents/jev/jev-harness.mjs --profile jeopi prune-context < blocks.jsonl
node ~/.agents/jev/jev-harness.mjs --profile jeopi review "<task>" '<proposal-json>'
```

`route-skills` adds `selection` and advisory `routing`. Gate and fit thresholds are both `0.30`. Gate failure is explicit none (`topK: []`, `selection.reason: "gate"`) with `publicRegistryFallback`; fit failure is explicit none with `selection.reason: "fits"`. The strategy is `sharded` when `ceil(catalogSize / choiceCap) <= 4`, otherwise `shortlist`. `routing` reads optional `skills.json` `model_policies` and uses `provider/model` vocabulary (for example `openai/gpt-6.1-sol`); it is advisory only, with the resolved `policy` and `provenance: {backend: {kind, driver, model, tier}}`, and no host adapter is installed.

`prune-context` sends `{blocks:[{id,text}...]}` with position-keyed questions `essential::<index>` per request, so duplicate block IDs are safe. Blocks are batched within the answering backend's state limit so none is judged unseen; an oversized single block is returned as `keep` with a `reason`. Batch-capable drivers send one request per batch; other drivers loop. Keep blocks unless the answer is `no` with confidence at least `0.8`.

Review results bind `backend: {kind, model, tier}`. Any proposed `permit` on a non-validated tier becomes `proposal_only` with reason `Backend tier 'unvalidated' cannot authorize autonomous execution`. Receipt v2 is the SHA-256 of `JSON.stringify({v:2, task, proposal, decision, backend:{kind, model, tier}})`; preserve it as the audit binding.

Every command accepts `--backend <kind>` and `--model <id>`. `smoke [--backend <kind>] [--task "<text>"]` runs route/prune/review with three golden tasks, never permits, and warns for unvalidated tiers. `self-test --mock` remains offline and must print `N/N checks passed`; `--mock` never permits autonomous action.

Missing credentials, unreachable backends, contract errors, malformed responses, and timeouts are `unavailable`. Request approval before transmitting task/context/proposal data to hosted services or downloading models. Treat output as a proposal and apply the host's own confirmation policies.

## Profile boundaries and examples

An install without `--profile` may use the intentional legacy `~/.agents/jev/.env`; a selected profile never falls back to it. Keep profile files private and out of source control.

```sh
bash ~/.agents/jev/jev-setup.sh --profile jeopi --agent jeopi --mode api
bash ~/.agents/jev/jev-setup.sh --profile gjc --agent gjc --mode local
node ~/.agents/jev/jev-harness.mjs --profile jeopi status
node ~/.agents/jev/jev-harness.mjs --profile gjc status
```

## References

- Backend setup and limits: `jev/README.md` in the `jeo-skills` checkout.
- Host integration contract: `jev/jev-control-plane.rule.md` in the `jeo-skills` checkout.