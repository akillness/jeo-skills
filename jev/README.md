# Jev Control Plane Harness

Optional TypeSafe System One decision harness for skill routing, context pruning, and proposal review. The catalog also provides a portable Agent Skill plugin and per-agent profiles. This repository provides instructions and a CLI, not a native interception hook: a host must load and follow the rule or skill for those decisions to gate its actions.

![Jev control-plane flow](./assets/jev-flow.gif)

## Optional setup

Jev is optional and separate from catalog installation in every mode, including `full`. With no TTY and no `JEO_SKILLS_JEV` selection, or with `JEO_SKILLS_JEV=skip`, the installer does not fetch or install Jev. Skipping preserves existing Jev files and settings; it is not uninstall or disable.

Use one lowercase profile ID per independent agent environment. `--profile` selects isolated Jev state, while `--agent` selects where the Agent Skill is installed. A missing or disabled selected profile never falls back to another profile or the legacy shared config. Profile and backend files are mode-600. Setup is home-scoped and must be explicitly approved before it performs hosted calls, model downloads, or local execution.

Standalone setup preflights the root `~/.agents/jev/jev-plugin.mjs` destination and raw-native file leaves before staging or publication. Root-controller symlinks/non-files and native non-file leaf collisions are refused. The collision regressions preserve existing core/native/catalog/profile bytes and outside targets; resolve the conflicting destination before rerunning approved setup.

```sh
JEO_SKILLS_AGENT=jeopi JEO_SKILLS_JEV=api bash install.sh
bash jev/jev-setup.sh --profile gjc --agent gjc --mode local
bash jev/jev-setup.sh --profile jeopi --agent jeopi --mode systemone
bash jev/jev-setup.sh --profile gjc --disable
bash jev/jev-setup.sh --profile gjc --status
JEO_SKILLS_JEV=skip bash install.sh
```

API setup requires a nonempty `JEV_API_KEY` from the environment or hidden interactive input. Enter secrets privately, not in prompts or command history. Setup/status are configuration operations, not inference tests.

### Backend alternatives

The registry has exactly five backend kinds: `api`, `local`, `ollama`, `lmstudio`, and `systemone`.

| Kind | Canonical setup side effects and prerequisites | Runtime transport / driver |
|---|---|---|
| `api` | Requires a TypeSafe API key; persists configuration. Hosted inference may incur charges. | TypeSafe `POST <JEV_API_ENDPOINT>` with `{state, model, questions}` and `Authorization: Bearer JEV_API_KEY`; model defaults to `jev-latest`. |
| `local` | Requires Python 3 and the configured server/dependencies; model download is explicit and separate. | Existing `jev_local_server.py` at `http://127.0.0.1:8763/v1/systemone`; reads base `AutoModelForCausalLM` logits. |
| `ollama` | Requires Ollama; model pull/start is explicit and may download a quantized third-party model. | Native `/api/chat` JSON-from-chat adapter, default `http://127.0.0.1:11434`. |
| `lmstudio` | Requires LM Studio; model download/load and server startup are explicit. | OpenAI-compatible `/v1/chat/completions` JSON-from-chat adapter, default `http://127.0.0.1:1234`. |
| `systemone` | Configures an endpoint, model, and optional key; no model download is implied. | `JEV_SYSTEMONE_DRIVER=typesafe` (default), `decide`, or `vllm-jev-decision`. |

`systemone/typesafe` uses the TypeSafe body at `JEV_SYSTEMONE_ENDPOINT`. `systemone/decide` posts each question to `<endpoint>/v1/decide` with `kind`, `state`, `question`, and optional `options`, then reads parallel `options` and `probabilities` arrays (Noul options are `false` and `true`). `systemone/vllm-jev-decision` posts each question to `<endpoint>/v1/completions` with the model, structured decision prompt, `max_tokens:1`, `temperature:1.0`, `logprobs`, `allowed_token_ids`, `add_special_tokens:false`, and `return_tokens_as_token_ids:true`, then reads `choices[0].logprobs.top_logprobs[0]`.

All five kinds default to tier `unvalidated`. A response format or passing loopback fixture proves transport, not calibration. Tier `validated` requires an explicit attestation `JEV_<KIND>_VALIDATED_MODEL=<model id>` in that kind's env file that matches the model id the backend **reports serving in its response** (a response without a served model never matches). Attestation is honored **only for calibrated decision-head drivers**: `api` and `systemone` (`typesafe` `/v1/systemone`, `decide` `/v1/decide`, `vllm-jev-decision` logprobs). `local` (base-model logits), `ollama`, and `lmstudio` (JSON-from-chat) are System 2 paths and remain `unvalidated` permanently — an attestation on those kinds is reported as `eligible: false` and ignored, so no flag can promote them. `permit` is allowed only on `validated`; a stale or mismatched attestation is `unvalidated` with `state: "stale"`. Every request is also bounded by the answering backend's serialized-state limit before any network I/O (`local`/`ollama`/`lmstudio` 6,000 chars, AutoTrust `decide`/`vllm-jev-decision` 3,000, hosted `api`/`systemone` `typesafe` 100,000); an oversized `review` proposal is rejected as `unavailable` and never trimmed, and only the operation's explicit fallback chain may route it to a larger-context backend.

## Native advisory integration

For Claude, jeopi, omp, and pi coding-agent runtimes, Jev provides optional native advisory hooks that receive `UserPromptSubmit` or equivalent events and return skill routing candidates and host model suggestions. These are advisory-only proposals and do not enforce host permissions or change what the agent actually executes. Package registration, session loading, and profile activation are separate:

```sh
# Preview a read-only native session-load plan for Claude (executes nothing)
node ~/.agents/jev/jev-plugin.mjs host-plan --agent claude --profile claude

# Activate an already-configured Claude profile (does not load/register the package)
node ~/.agents/jev/jev-plugin.mjs enable --agent claude --profile claude --apply

# Check advisory status
node ~/.agents/jev/jev-plugin.mjs status --agent claude --profile claude
```

When the host session loads the native package, its advisory callback remains registered whether the selected profile is ON or OFF. An OFF profile returns a neutral result before reading stdin, loading the catalog, or reaching a backend. `JEV_ENABLED` is the single profile activation switch; copying package assets or registering/loading them with a host does not change it. An ON callback examines the current task and returns advisory context prefixed with `Jev advisory only`. The host decides whether to use suggestions under its own permission policies; Jev cannot authorize autonomous action.

For jeopi, OMP, and Pi, helpers tolerate subprocess stdin `EPIPE` only after a parsed `enabled:false` response. Actual-OFF registered callbacks with a 1 MiB prompt return `{}` without changing prior host context, exit 0, and emit no unhandled-error/EPIPE stderr; other stdin errors remain `CONTROLLER_INPUT_ERROR`.

## Configuration and setup

```sh
# Preview configuration (no --apply: shows what will be set)
node ~/.agents/jev/jev-plugin.mjs configure --agent jeopi --profile jeopi --backend api --key-env JEV_API_KEY

# Apply configuration (--apply: writes profile files and environment)
node ~/.agents/jev/jev-plugin.mjs configure --agent jeopi --profile jeopi --backend api --key-env JEV_API_KEY --apply

# Enable profile (default: preview; --apply: changes JEV_ENABLED=true)
node ~/.agents/jev/jev-plugin.mjs enable --agent jeopi --profile jeopi
node ~/.agents/jev/jev-plugin.mjs enable --agent jeopi --profile jeopi --apply

# Disable profile (loaded callbacks return neutral before doing work)
node ~/.agents/jev/jev-plugin.mjs disable --agent jeopi --profile jeopi --apply

# Status (always read-only, never reaches backend)
node ~/.agents/jev/jev-plugin.mjs status --agent jeopi --profile jeopi
```

`configure` with `--agent` and `--backend` prepares a new profile or updates an existing one. Without `--apply`, it validates the request and returns a preview without changes. With `--apply`, it invokes `jev-setup.sh --config-only` and writes configuration files without downloads or inference; a new profile starts OFF. API configuration requires `--key-env` naming an existing non-empty environment variable in the invoking process unless the selected profile's API backend already has a saved key; omit `--key-env` to preserve that saved key. Use the variable name, never a literal credential. `enable` and `disable` toggle `JEV_ENABLED` in the profile's base file; without `--apply` they preview the change, with `--apply` they write it. `status` reports saved configuration without reaching any backend.

## Settings

With `--profile <id>`, the harness reads only that profile's base file and selected backend files under `~/.agents/jev/profiles/`. Profile file values are authoritative; environment variables from the host do not override selected profile configuration. A selected profile never falls back to another profile or the legacy `~/.agents/jev/.env`, even if disabled. Without a profile, the intentional legacy `~/.agents/jev/.env` behavior remains.

| Setting | Purpose |
|---|---|
| `JEO_SKILLS_JEV` | Setup choice: `skip`, `api`, `local`, `ollama`, `lmstudio`, or `systemone`; not the runtime mode. |
| `JEV_ENABLED` | Profile opt-in state in the base file. |
| `JEV_MODE` | Default backend for each operation; absent mode defaults to `api`. |
| `JEV_ROUTE_SKILLS_BACKEND` / `JEV_PRUNE_CONTEXT_BACKEND` / `JEV_REVIEW_BACKEND` | Per-operation primary backend. |
| `JEV_ROUTE_SKILLS_FALLBACK` / `JEV_PRUNE_CONTEXT_FALLBACK` / `JEV_REVIEW_FALLBACK` | Ordered comma-separated allow-list of fallback kinds; no other kinds are tried. |
| `JEV_API_KEY` / `JEV_API_ENDPOINT` / `JEV_API_MODEL` | TypeSafe credential, endpoint, and model (`jev-latest` default). |
| `JEV_SYSTEMONE_ENDPOINT` / `JEV_SYSTEMONE_DRIVER` / `JEV_SYSTEMONE_MODEL` | System One endpoint, driver (`typesafe`, `decide`, or `vllm-jev-decision`), and served model. |
| `JEV_SYSTEMONE_API_KEY` / `JEV_SYSTEMONE_HEAD_JSON` / `JEV_SYSTEMONE_CALIBRATION_JSON` | Optional System One key and driver metadata paths. |
| `JEV_SYSTEMONE_CHOICE_CAP` / `JEV_SYSTEMONE_VALIDATED_MODEL` | Choice cap and model attestation for `systemone`. |
| `JEV_<KIND>_VALIDATED_MODEL` | Exact served-model attestation; honored only for `api` and `systemone`, ignored (`eligible: false`) for `local`/`ollama`/`lmstudio`. |
| `JEV_LOCAL_ENDPOINT` / `JEV_OLLAMA_ENDPOINT` / `JEV_LMSTUDIO_ENDPOINT` | Profile-specific local backend URLs. |
| `JEV_LOCAL_MODEL` / `JEV_LOCAL_MODEL_DIR` | Generative model ID or full-precision model directory for local adapters. |
| `JEV_CATALOG_PATH` | Explicit read-only `skills.json` location. Otherwise `route-skills` reads the working checkout's `.agent-skills/skills.json`, then the setup-installed snapshot `~/.agents/jev/skills.json` (excerpts from `~/.agents/skills/<name>/SKILL.md`), then a legacy `~/.agents/jeo-skills-repo` clone. |
| `--profile <id>` / `JEV_PROFILE` | Select isolated profile; never falls back to another profile. |
| `--backend <kind>` / `--model <id>` | Per-invocation backend and model overrides; backend must be eligible. |
| `--operation <route-skills, prune-context, or review>` | Status filter for one operation chain. |
## Readiness and host integration

### Host plan

```sh
# Preview native session-load argv and unsupported registration proposals
node ~/.agents/jev/jev-plugin.mjs host-plan --agent claude --profile claude
```

Returns read-only JSON with `capability`, `lifecycle`, and `steps`; `verified: false` and `executed: false` mean nothing was executed or host-verified. Claude/jeopi/omp/pi report `capability: "native-lifecycle"` and `lifecycle: "session-only"`: their `package-load` steps propose session argv (`--plugin-dir` for Claude, `-e` for the others). Claude/jeopi persistent `package-enable`/`package-disable` proposals are marked `status: "unsupported"` pending operator verification of package registration; copying native assets is not registration. Omp/pi have no verified persistent targeted package toggle. Other hosts advertise adapter-only capability, not native enforcement. Host package toggles are independent of the profile's `JEV_ENABLED`; activate a configured profile with the controller's `enable --agent <agent> --profile <profile> --apply`, not with a host package command. `host-plan` never installs, registers, loads, or enables anything.

### Model plan

```sh
# Generate model routing plan from advice
node ~/.agents/jev/jev-plugin.mjs model-plan --agent jeopi --profile jeopi --advice advice.json
```

For an enabled profile, requires `--advice` pointing to a JSON array or an object containing a `routing` or `advice` array with `{chosen: "provider/model", candidates: [{provider, model}...]}` entries. Returns `plans` containing `{skill, provider, model, argv, advisory: true, executed: false}` after checking the chosen candidate against the advice and host provider allow-list. It never executes the argv or changes the host model; the host makes its own execution choice. An OFF profile returns an inactive plan before reading advice.

### Status and configuration

```sh
node ~/.agents/jev/jev-harness.mjs --profile gjc status
node ~/.agents/jev/jev-harness.mjs --profile gjc status --operation route-skills
```

Status reports per-operation `policies` with primary backend, ordered fallback, chain, and `usable`, plus each backend's `configured`, `eligible`, `ready`, `state`, `tier`, model, endpoint, and attestation. A chain is usable when any backend is not known unavailable (`ready !== false`; `null` is unverified). Top-level `ready` is false if any operation is unusable and true only when every operation has a backend with `ready:true`.

| Exit | Meaning | Host rule behavior |
|---|---|---|
| `0` | Requested operation chain is not known unavailable; some readiness may be unverified. | Continue under host permissions; only a validated live `permit` may authorize autonomous action. |
| `2` | Inactive or unconfigured profile. | Skip Jev gates and use normal host permission policies. |
| `3` | Invalid configuration, or an evaluated operation chain has no usable backend. | Fail closed; never bypass the gate. A down backend that no evaluated chain references never causes `3`. |

Readiness probes do not install or session-load native hooks and do not establish inference quality, calibration, authentication, or host rule adoption. Use the read-only host plan to identify optional session loading; for instruction-only integration, verify that the host loads `~/.agents/rules/jev-control-plane.md` through its supported rule mechanism.

## Actual structure

```text
jev/                                  # source in this repository
├── jev-harness.mjs                    # Node ESM CLI, built-in modules only (route/prune/review operations)
├── jev-plugin.mjs                     # Node ESM native plugin and configuration CLI
├── jev-setup.sh                       # canonical optional installer
├── jev_local_server.py                # full-precision Python backend
├── jev-control-plane.rule.md          # host integration instructions
├── README.md
└── assets/                           # repository illustrations

~/.agents/jev/                        # installed runtime files + README
├── jev-harness.mjs
├── jev-plugin.mjs
├── jev-setup.sh
├── jev_local_server.py
├── jev-control-plane.rule.md
├── README.md
├── skills.json                       # catalog snapshot for route-skills outside a checkout
├── .env                              # intentional legacy private configuration
├── profiles/
│   ├── <id>.env                       # profile opt-in and operation policy
│   ├── <id>.api.env                   # API key/endpoint/model/attestation
│   ├── <id>.local.env                 # local backend settings
│   ├── <id>.ollama.env                # Ollama settings
│   ├── <id>.lmstudio.env              # LM Studio settings
│   └── <id>.systemone.env             # System One endpoint/driver/model
├── venv/                             # local mode only
└── models/JEV-9B/                    # local weights, only when downloaded

~/.agents/rules/jev-control-plane.md   # host rule copy, not a native hook
~/.agents/skills/jev-control-plane/   # portable Agent Skill (when installed)
.agent-skills/skills.json              # catalog input in checkout (wins over the snapshot)
```


## Runtime flow and commands

### Route

```sh
node ~/.agents/jev/jev-harness.mjs --profile jeopi route-skills --top-k 3 "<task>"
```

`route-skills` retains `task`, mode, `families` (categories of `topK`), `topK`, token estimates, and `publicRegistryFallback`, and adds `selection` and advisory `routing`. Gate and fit thresholds are both `0.30`. A gate below threshold returns explicit none (`topK: []`, `selection.reason: "gate"`) and `publicRegistryFallback`; no candidate meeting fit threshold returns explicit none with `selection.reason: "fits"`. Strategy is `sharded` when `ceil(catalogSize / choiceCap) <= 4` and `shortlist` otherwise. The sharded path chooses per-shard finalists, then a final choice; shortlist is lexical and cap-aware.

If `.agent-skills/skills.json` supplies `model_policies`, `routing` is advisory: candidates use `provider/model` strings such as `openai/gpt-6.1-sol`, `anthropic/claude-fable-5-1`, and `ollama/qwen2.5:7b`; each result carries the resolved `policy` (`{id, candidates, fallback, constraints}`), ranked candidates with probabilities, the chosen value (or `other`), confidence, and `provenance: {backend: {kind, driver, model, tier}}`. Hosts are not adapted this round. `model_policies` is not projected into `skills.toon` or README catalog tables. If no policy exists, `routing: []`.

### Prune

```sh
node ~/.agents/jev/jev-harness.mjs --profile jeopi prune-context < blocks.jsonl
```

The request state is `{blocks:[{id,text}...]}`. Questions are keyed by position within that request as `essential::<index>`, so duplicate block IDs are safe. Blocks are split into batches bounded by the answering backend's serialized-state limit (`local`/`ollama`/`lmstudio` 6,000 chars; AutoTrust `decide`/`vllm-jev-decision` 3,000; hosted `api`/`systemone` `typesafe` 100,000) so no block is judged without appearing in the model's input; a single block larger than the limit is returned as `keep` with a `reason` and is never dropped unjudged. Batch-capable drivers send one request per batch; other drivers loop per question. Keep blocks unless Jev returns `no` with confidence at least `0.8`; preserve uncertain blocks.

### Review

```sh
node ~/.agents/jev/jev-harness.mjs --profile jeopi review "<task>" '<proposal-json>'
```

Review envelopes and results bind `backend: {kind, model, tier}`. A proposed `permit` on a non-validated tier is downgraded to `proposal_only` with reason `Backend tier 'unvalidated' cannot authorize autonomous execution`. Receipt v2 is the SHA-256 of `JSON.stringify({v:2, task, proposal, decision, backend:{kind, model, tier}})`; preserve the receipt as the audit binding.

| Review verdict | Meaning | Host action |
|---|---|---|
| `permit` | Favorable review on a validated backend. | Proceed only with live evidence and host permissions. |
| `proposal_only` | Insufficient confidence or non-validated/simulated permit. | Ask the user. |
| `reject` | Supplied validation fails. | Do not proceed. |
| `unavailable` | Missing credentials, ineligible/unreachable backend, contract error, timeout, or malformed response. | No autonomous action. |

### Smoke and offline checks

```sh
node ~/.agents/jev/jev-harness.mjs --profile jeopi smoke --backend local --task "<task>"
node ~/.agents/jev/jev-harness.mjs self-test --mock
node ~/.agents/jev/jev-harness.mjs route-skills --mock --top-k 3 "React performance task"
```

`smoke` runs route/prune/review against the resolved backend with three golden tasks, never permits, and warns for an unvalidated tier. `self-test --mock` is offline and must print `N/N checks passed`; `--mock` never permits autonomous action. The harness does not execute public registry searches or install skills. Obtain explicit user approval before installing anything.

Recorded 2026-10-12 verification: `python3 -m unittest scripts.test_installer_regressions` passed 48 tests; `python3 -m unittest scripts.test_jev_regressions` passed 64. `JEV_LIVE_SMOKE=0 node --test jev/install.test.mjs jev/plugin.test.mjs jev/profile.test.mjs` reported 54 total, 53 pass, and 1 opt-in live skip. The prior offline mock self-test passed 20/20. The source catalog has 367 skills because of a concurrent MI skill addition; this Jev update adds no catalog entry.

The live Ollama check reached HTTP 200 but returned `selectedSkill:null` / `errorCategory:backend_unavailable`. It establishes transport and fail-closed output, not successful routing, model quality/calibration, or native package registration.

These checks cannot prove provider authentication, model loading, inference quality, probability calibration, backend parity, or runtime rule enforcement. For live use, inspect status, verify host rule loading, obtain approval for data sharing/costs, and preserve real receipts.
