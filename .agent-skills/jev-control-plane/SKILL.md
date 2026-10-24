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

Use this skill to operate Jev for the coding-agent environment that loaded it. The harness returns decisions; optional host integrations apply selected results. Loading this Agent Skill alone does not register or activate those integrations. Report the exact host, profile, runtime mode, hook trust, and observed result before claiming automatic behavior.

## When to use this skill

Use it when installing or configuring Jev for one runtime, checking or toggling that runtime's profile, selecting a backend, or invoking an approved routing, pruning, or review command. Jev is optional. Keep each profile isolated and fail closed when a selected operation has no usable backend.

## Select the current agent profile

Identify the coding-agent runtime that loaded this skill, not its model/provider. Set `JEV_AGENT` to one current canonical host ID: `claude`, `jeo`, `jeopi`, `pi`, `omp`, `gjc`, `codex`, `opencode`, `agy`, `kimi`, `grok`, `cursor`, `crush`, `antigravity`, or `aside`. The host list is intentionally separate from provider/model names.

Guide aliases normalize to canonical hosts: `claude-code` → `claude`, `jeo-code` → `jeo`, `oh-my-pi` → `omp`, `antigravity-cli` → `agy`, and `kimi-code-cli` → `kimi`. AGY means the Antigravity CLI; it is distinct from the Antigravity IDE (`antigravity`). Grok Build is explicit-selection-only: set `JEV_AGENT=grok` (or `JEO_SKILLS_AGENT=grok` during setup); never infer it from `PATH`, because an installed `grok` may be Superagent rather than Grok Build.

Use the explicitly assigned profile, otherwise the current host's `profile` in `~/.agents/jev/agents.json`, otherwise the host ID itself. Aside instead requires a selected account and defaults to `aside-u<account>`. Set that exact value as `JEV_PROFILE` in this session. Keep independent accounts/configurations separate (for example `aside-u0` or `claude-work`). If the host or assignment is unknown, stop Jev work rather than choosing the first installed CLI. A selected missing/disabled profile never falls back to `jeopi`, another profile, or legacy configuration.

The controller's `--agent` is the canonical host identity; standalone setup's `--agent` is the skill installation destination. `--profile` always selects Jev state. See the [shared host table](../../jev/jev-control-plane.rule.md#activation-and-profiles) for each destination, storage root, and verified Jev boundary; it is the source of truth for AGY, Kimi Code, and Grok Build distinctions.

After a successful per-host setup, the guide creates or updates that canonical host's `~/.agents/jev/agents.json` binding through the existing controller `configure --agent <host> --profile <profile> --backend <selected> --apply` path. It preserves custom host fields, other host entries, and saved per-profile keys; configuration-only binding is not native hook registration.

Check the exact profile before every live operation:
```sh
node ~/.agents/jev/jev-harness.mjs --profile "${JEV_PROFILE:?Select the current agent profile first}" status
```


Status exit `2` means inactive or unconfigured; skip Jev gates and follow the host's normal permission policies. Exit `3` means fail closed: the configuration is invalid, or an evaluated operation chain has no usable backend; a down backend that no evaluated chain references never causes it. Exit `0` means the requested chain is not known unavailable, not that model quality or host enforcement is proven. Use `--operation route-skills|prune-context|review` for one operation; otherwise all three chains are evaluated.

## Configure one environment with jev-plugin.mjs

For initial setup or updates, use jev-plugin.mjs with preview-then-apply pattern:

```sh
: "${JEV_AGENT:?Select the current coding agent first}" "${JEV_PROFILE:?Select the current agent profile first}"
# Preview configuration (shows what will be set, no changes)
node ~/.agents/jev/jev-plugin.mjs configure --agent "$JEV_AGENT" --profile "$JEV_PROFILE" --backend api --key-env JEV_API_KEY

# Apply configuration (invokes setup and writes files)
node ~/.agents/jev/jev-plugin.mjs configure --agent "$JEV_AGENT" --profile "$JEV_PROFILE" --backend api --key-env JEV_API_KEY --apply

# Enable profile (preview then apply)
node ~/.agents/jev/jev-plugin.mjs enable --agent "$JEV_AGENT" --profile "$JEV_PROFILE"
node ~/.agents/jev/jev-plugin.mjs enable --agent "$JEV_AGENT" --profile "$JEV_PROFILE" --apply

# Disable profile  
node ~/.agents/jev/jev-plugin.mjs disable --agent "$JEV_AGENT" --profile "$JEV_PROFILE" --apply

# Check profile status (always read-only)
node ~/.agents/jev/jev-plugin.mjs status --agent "$JEV_AGENT" --profile "$JEV_PROFILE"
```

`configure` with `--agent` and `--backend` prepares or updates a profile. Without `--apply`, it validates the request and returns a preview without changes. With `--apply`, it invokes configuration-only setup and writes files without downloads or inference; new profiles start OFF. API configuration requires `--key-env` naming an existing non-empty environment variable in the invoking process unless the selected profile's API backend already has a saved key; omit `--key-env` to preserve that key. Use the variable name, never a literal credential. `enable` and `disable` toggle `JEV_ENABLED`; without `--apply` they preview the change, with `--apply` they write it. `status` shows saved configuration without reaching any backend.
The backend registry has exactly five kinds: `api`, `local`, `ollama`, `lmstudio`, and `systemone`.

- `api`: TypeSafe `POST <JEV_API_ENDPOINT>` with `{state, model, questions}` and `Authorization: Bearer JEV_API_KEY`.
- `local`: existing Python `/v1/systemone` server reading base-model logits.
- `ollama`: native `/api/chat` JSON-from-chat adapter.
- `lmstudio`: OpenAI-compatible `/v1/chat/completions` JSON-from-chat adapter.
- `systemone`: `JEV_SYSTEMONE_DRIVER=typesafe` (default), `decide` (`<endpoint>/v1/decide`), or `vllm-jev-decision` (`<endpoint>/v1/completions` with logprobs).

### Optional native session integration

```sh
: "${JEV_AGENT:?Select the current coding agent first}" "${JEV_PROFILE:?Select the current agent profile first}"
# Read-only session-load plan; does not install, register, load, or enable anything
node ~/.agents/jev/jev-plugin.mjs host-plan --agent "$JEV_AGENT" --profile "$JEV_PROFILE"

# Advisory model argv only; never executes the plan
node ~/.agents/jev/jev-plugin.mjs model-plan --agent "$JEV_AGENT" --profile "$JEV_PROFILE" --advice advice.json
```

Profiles default to `JEV_RUNTIME_MODE=advisory` and `JEV_REVIEW_MODE=off`. Explicit `configure --runtime-mode assist` enables trusted selected skill instruction loading in a registered, enabled integration. Skill bodies include source paths for resolving referenced files. They must match the trusted catalog and remain within its skill root; files exceeding 64 KiB or the 96 KiB combined budget are skipped whole, never partially injected.

| Host integration | Automatic behavior after activation |
|---|---|
| Claude | Prompt-time selected skill instruction injection; no automatic history pruning or action enforcement. |
| jeopi / OMP / Pi | Prompt-time skill injection as a Jev custom message; context callbacks may remove only older Jev custom messages from model input. The newest skill instructions and all user, system, assistant, tool, and other extensions' messages are preserved. Persisted history is unchanged. |
| Codex 0.162.1 | `UserPromptSubmit` skill injection and optional `PreToolUse` review for registered tool matchers; no automatic history pruning. Requires exact hook definitions to be trusted in `/hooks`. |

For Codex, after the harness is installed:

```sh
# JEV_API_KEY is already set; omit --key-env to preserve an existing profile key
node ~/.agents/jev/jev-plugin.mjs configure --agent codex --profile codex --backend api --key-env JEV_API_KEY --runtime-mode assist --review-mode advisory --apply
node ~/.agents/jev/jev-plugin.mjs enable --agent codex --profile codex --apply
node ~/.agents/jev/jev-plugin.mjs hooks-install --agent codex --profile codex --apply
```

Review and trust the generated definitions in Codex `/hooks`; changed definitions need renewed trust. Installation, trust, and `JEV_ENABLED` are separate. Review mode `off` performs no action review; `advisory` reports a verdict; explicit `enforce` denies unless the result is `permit` from a validated backend. Even then, the hook never returns a host permission grant. Host failures, skipped or untrusted hooks, and timeouts can fail open: this is not an OS security boundary. Jev does not execute tests when reviewing an action, and successful transport does not prove calibration or decision quality.

Native session loading is available for Claude, jeopi, OMP, and Pi. `host-plan` remains read-only with `executed: false`; a package-load command loads only that session. Copying package assets is not persistent registration, and package toggles do not change `JEV_ENABLED`. A registered OFF hook returns neutral before stdin, catalog, or backend work. `model-plan` returns advisory argv and never changes the host model. Do not claim all hosts were exercised live based on callback tests.

Every kind defaults to tier `unvalidated`. A response or loopback fixture proves transport only. Tier `validated` requires an exact served-model attestation in the kind env file, `JEV_<KIND>_VALIDATED_MODEL=<model id>`, and is honored only for calibrated decision-head drivers: `api` and `systemone` (`typesafe`, `decide`, `vllm-jev-decision`). `local`, Ollama, and LM Studio are System 2 paths and can never be validated (`attestation.eligible: false`), so they can never permit. Stale or mismatched attestations are `unvalidated`. Oversized review input is rejected as `unavailable` rather than trimmed.

## Per-operation policy and resolution

The base profile stores `JEV_ENABLED`, `JEV_MODE`, `JEV_RUNTIME_MODE` (`advisory` or `assist`), `JEV_REVIEW_MODE` (`off`, `advisory`, or `enforce`), and optional operation keys:

- `JEV_ROUTE_SKILLS_BACKEND`, `JEV_PRUNE_CONTEXT_BACKEND`, `JEV_REVIEW_BACKEND`
- `JEV_ROUTE_SKILLS_FALLBACK`, `JEV_PRUNE_CONTEXT_FALLBACK`, `JEV_REVIEW_FALLBACK`

Each fallback is an ordered comma-separated allow-list; only those kinds may be attempted. Resolution is CLI `--backend <kind>` (must be eligible), then the operation backend, then `JEV_MODE`, then `api`. `--model <id>` overrides the resolved model for that invocation. No cross-profile fallback is allowed. Envelopes report `backend: {kind, model, tier}` and attempted kinds.

## Run approved operations

```sh
node ~/.agents/jev/jev-harness.mjs --profile "${JEV_PROFILE:?Select the current agent profile first}" route-skills --top-k 3 "<task>"
node ~/.agents/jev/jev-harness.mjs --profile "${JEV_PROFILE:?Select the current agent profile first}" prune-context < blocks.jsonl
node ~/.agents/jev/jev-harness.mjs --profile "${JEV_PROFILE:?Select the current agent profile first}" review "<task>" '<proposal-json>'
```

`route-skills` adds `selection` and advisory `routing`. Gate and fit thresholds are both `0.30`. Gate failure is explicit none (`topK: []`, `selection.reason: "gate"`) with `publicRegistryFallback`; fit failure is explicit none with `selection.reason: "fits"`. The strategy is `sharded` when `ceil(catalogSize / choiceCap) <= 4`, otherwise `shortlist`. `routing` reads optional `skills.json` `model_policies` and uses `provider/model` vocabulary (for example `openai/gpt-6.1-sol` or `google/gemini-2.5-pro`); these are model examples, not host IDs. Model advice remains advisory, with the resolved `policy` and `provenance: {backend: {kind, driver, model, tier}}`. The command itself does not install skills or change the coding model. Token savings are estimates rather than measured host usage.

`prune-context` sends `{blocks:[{id,text}...]}` with position-keyed questions `essential::<index>` per request, so duplicate block IDs are safe. Blocks are batched within the answering backend's state limit so none is judged unseen; an oversized single block is returned as `keep` with a `reason`. Batch-capable drivers send one request per batch; other drivers loop. Keep blocks unless the answer is `no` with confidence at least `0.8`.

Review results bind `backend: {kind, model, tier}`. Any proposed `permit` on a non-validated tier becomes `proposal_only` with reason `Backend tier 'unvalidated' cannot authorize autonomous execution`. Receipt v2 is the SHA-256 of `JSON.stringify({v:2, task, proposal, decision, backend:{kind, model, tier}})`; preserve it as the audit binding.

Every command accepts `--backend <kind>` and `--model <id>`. `smoke [--backend <kind>] [--task "<text>"]` runs route/prune/review with three golden tasks, never permits, and warns for unvalidated tiers. `self-test --mock` remains offline and must print `N/N checks passed`; `--mock` never permits autonomous action.

Missing credentials, unreachable backends, contract errors, malformed responses, and timeouts are `unavailable`. Request approval before transmitting task/context/proposal data to hosted services or downloading models. Treat output as a proposal and apply the host's own confirmation policies.

## Profile boundaries and examples

An install without `--profile` may use the intentional legacy `~/.agents/jev/.env`; a selected profile never falls back to it. Keep profile files private and out of source control.

```sh
# Two independent hosts; these are examples, not a shared default.
bash ~/.agents/jev/jev-setup.sh --profile claude --agent claude-code --mode api
bash ~/.agents/jev/jev-setup.sh --profile agy --agent agy --mode local
bash ~/.agents/jev/jev-setup.sh --profile kimi --agent kimi --mode systemone
node ~/.agents/jev/jev-harness.mjs --profile claude status
node ~/.agents/jev/jev-harness.mjs --profile agy status
node ~/.agents/jev/jev-harness.mjs --profile kimi status

```
## References

- Backend setup and limits: `jev/README.md` in the `jeo-skills` checkout.
- Host integration contract: `jev/jev-control-plane.rule.md` in the `jeo-skills` checkout.
