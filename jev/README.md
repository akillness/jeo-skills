# Jev Control Plane Harness

Optional TypeSafe System One decision harness for skill routing, context pruning, and proposal review. This repository provides the CLI and a host rule, not a native interception hook: a host must load and follow the rule for those decisions to gate its actions.

![Jev control-plane flow](./assets/jev-flow.gif)

## Optional setup

Jev is separate from catalog installation in **every** mode, including `full`. The root `install.sh` offers a default-no prompt only for an interactive home-scoped install. With no TTY and no `JEO_SKILLS_JEV` selection, or with `JEO_SKILLS_JEV=skip`, it does not fetch or install Jev. Skipping preserves existing Jev files and settings; it is not an uninstall or disable command.

Use the canonical setup script after approving a backend and its side effects:

```sh
bash jev/jev-setup.sh                              # interactive, default-no consent
JEO_SKILLS_JEV=api bash jev/jev-setup.sh             # JEV_API_KEY must already be set without a TTY
JEO_SKILLS_JEV=local bash jev/jev-setup.sh           # Python dependencies + full-precision model download
JEO_SKILLS_JEV=ollama bash jev/jev-setup.sh          # may start server + pull quantized model
JEO_SKILLS_JEV=lmstudio bash jev/jev-setup.sh        # may download/load model + start server via lms
JEO_SKILLS_JEV=skip bash install.sh                 # catalog install only; existing Jev unchanged
```

Explicit modes also work without a TTY. API mode requires a nonempty `JEV_API_KEY` from the environment or hidden interactive input; enter secrets privately, not in shared prompts or command history. Setup writes `~/.agents/jev/.env` with mode `600`. The root `install.sh` rejects explicit Jev selection with `INSTALL_GLOBAL=false` before installation writes: Jev is home-scoped only. The standalone setup always targets the home directory, not the project; invoke it separately after explicit approval rather than adding Jev to a project install.

### Backend alternatives

| Mode | Canonical setup side effects and prerequisites | Runtime transport |
|---|---|---|
| `api` | Requires a TypeSafe API key; persists configuration. Hosted inference may incur charges. Setup/status do not validate the key through inference. | Typed state/questions at `https://api.typesafe.ai/v1/systemone` |
| `local` | Requires Python 3; creates a venv with torch, transformers, accelerate, and huggingface_hub; downloads `autotrust/JEV-9B` unless `JEV_SKIP_MODEL_DOWNLOAD=true`. Backend must be started separately. | `jev_local_server.py` at `http://127.0.0.1:8763/v1/systemone` |
| `ollama` | Requires the `ollama` CLI; may start `ollama serve` and pull `hf.co/mradermacher/JEV-9B-GGUF:Q4_K_M` if missing. | Native `/api/chat`, `think:false`, default `http://127.0.0.1:11434` |
| `lmstudio` | Interactive choice is exposed on macOS. With `lms`, attempts model download/load and server startup; otherwise configure them in the app. Setup alone does not prove readiness. | OpenAI-compatible `/v1/chat/completions`, default `http://127.0.0.1:1234` |

The local model and GGUF are third-party alternatives, not TypeSafe's hosted model. Full-precision setup describes an approximately 18 GB download; quantized setup describes approximately 5.6 GB. These are planning estimates, not measured resource guarantees. Local inference requires sufficient memory and compatible dependencies. Model quality, calibration, and parity with the hosted service have not been established by offline checks. Ollama/LM Studio adapt generated JSON into the decision contract; that is not evidence of native hosted-model probability calibration.

Start the full-precision backend after setup. It loads weights from the configured local directory only; startup does not fetch missing weights:

```sh
~/.agents/jev/venv/bin/python ~/.agents/jev/jev_local_server.py
```

### Settings

The harness and local Python server use environment variables first and `~/.agents/jev/.env` as fallback for unset keys. Setup reconfigures that file; use the canonical script rather than maintaining a second installer or credential-writing recipe.

| Setting | Purpose |
|---|---|
| `JEO_SKILLS_JEV` | Setup choice: `skip`, `api`, `local`, `ollama`, `lmstudio`; this is not the runtime mode |
| `JEV_MODE` | Runtime backend; absent mode defaults to `api` |
| `JEV_API_KEY` | Hosted API credential; key presence is not an authentication check |
| `JEV_ENDPOINT` | Full System One URL for `api`/`local`, server base URL for `ollama`/`lmstudio` |
| `JEV_LOCAL_MODEL` | Explicit generative model identifier; LM Studio otherwise resolves a Jev model from `/v1/models` and rejects unrelated-only listings |
| `JEV_LOCAL_MODEL_DIR` | Full-precision backend model directory |
| `JEV_CATALOG_PATH` | Explicit read-only `skills.json` location |
| `JEV_SKIP_MODEL_DOWNLOAD=true` | Local setup only: skip weight download; does not skip dependencies or prove inference readiness |

The local Python server also accepts `JEV_LOCAL_HOST` and `JEV_LOCAL_PORT`. Keep the harness endpoint consistent if changing either. Routing searches `JEV_CATALOG_PATH`, then `~/.agents/jeo-skills-repo/.agent-skills/skills.json`, then the current checkout's `.agent-skills/skills.json`; installed skill folders alone are not a catalog. Set an explicit catalog path when running outside a checkout/cache.

## Configuration, readiness, and host integration

```sh
node ~/.agents/jev/jev-harness.mjs status
```

`active` means configured opt-in, **not** demonstrated host enforcement. `ready` is `true`/`false` after a limited local probe, or `null` when unverified. Local mode probes `/healthz`; generative modes inspect `/v1/models` for the selected model. API mode with a key reports `ready:null`: no hosted authentication or inference request is made.

| Exit | Meaning | Host rule behavior |
|---|---|---|
| `0` | Configured and not known unavailable; API readiness can still be unverified | Use live routing/pruning/review; proceed autonomously only for a live `permit` |
| `2` | Inactive/unconfigured | Skip Jev gates; continue under the host's normal permission and confirmation policies |
| `3` | Configured but unavailable, or invalid configuration | Fail closed; do not treat an outage as permission to bypass gates |

A readiness probe does not establish successful inference, correct model judgments, or host rule adoption. Setup installs `~/.agents/rules/jev-control-plane.md`; verify that the chosen host loads it through its supported rule mechanism. No native hook installation is supplied by this setup.

## Actual structure

```text
jev/                                  # source in this repository
├── jev-harness.mjs                    # Node ESM CLI, built-in modules only
├── jev-setup.sh                       # canonical optional installer
├── jev_local_server.py                # full-precision Python backend
├── jev-control-plane.rule.md          # host integration instructions
├── README.md
└── assets/                           # repository illustrations

~/.agents/jev/                        # installed runtime files + README
├── jev-harness.mjs
├── jev-setup.sh
├── jev_local_server.py
├── jev-control-plane.rule.md
├── README.md
├── .env                              # private runtime configuration
├── venv/                             # local mode only
└── models/JEV-9B/                     # local mode weights, when downloaded

~/.agents/rules/jev-control-plane.md   # host rule copy, not a native hook
.agent-skills/skills.json              # catalog in checkout, read-only input
```

Assets are repository illustrations, not installed runtime dependencies. Setup syntax-checks the harness; it does not require routing a catalog or performing a paid live smoke test to persist configuration.

## Runtime flow and commands

1. **Route:** backend selects category families; local keyword scoring ranks skills in those families. Top-K defaults to three. Token savings in the result are estimates for returned metadata, not measured whole-session savings.
2. **Discover locally first:** a weak catalog match emits `publicRegistryFallback` pointing to `find-skills` and the public skills.sh registry. The harness does not execute that search or install anything. Review candidates and obtain explicit user approval before installation.
3. **Prune:** `{id,text}` JSONL blocks receive `keep`/`drop` verdicts. Live pruning preserves uncertain blocks; a host may remove only live-approved `drop` blocks.
4. **Review:** task and proposal receive `permit`, `proposal_only`, `reject`, or `unavailable` with a SHA-256 receipt binding the decision. The host rule applies this before `.jeo/memory`, llm-wiki writes, and agent-authored commits; the CLI itself does not intercept those actions.

```sh
node ~/.agents/jev/jev-harness.mjs route-skills --top-k 3 "<task>"
node ~/.agents/jev/jev-harness.mjs prune-context < blocks.jsonl
node ~/.agents/jev/jev-harness.mjs review "<task>" '<proposal-json>'
```

These commands use the configured live backend and may send task/context/proposal data to it. Hosted API calls require separate approval of data sharing and costs. A SHA-256 receipt records a binding, not a signature or independent proof that the proposal is safe.

| Review verdict | Meaning | Host action |
|---|---|---|
| `permit` | Four review questions favorable at confidence ≥ 0.8 | Proceed only with live evidence |
| `proposal_only` | Insufficient favorable confidence, or simulated permit | Ask the user |
| `reject` | Supplied validation fails | Do not proceed |
| `unavailable` | Missing credentials, request error, timeout, or malformed response | No autonomous action |

Proposal JSON is not itself a sandbox or path validator. `review` accepts caller-supplied validation through its exported API; the host remains responsible for validating real actions.

## Offline validation limits

From a checkout with its catalog available:

```sh
node jev/jev-harness.mjs self-test --mock
node jev/jev-harness.mjs route-skills --mock --top-k 3 "React performance task"
node jev/jev-harness.mjs review --mock "Review a patch" '{"summary":"Example proposal"}'
```

`self-test` exercises eight deterministic contract checks and should print `8/8 checks passed`. Mock routing/pruning use local heuristics; a mock review that would permit is downgraded to `proposal_only`. These checks cannot prove provider authentication, model downloads, model loading, inference quality, probability calibration, backend compatibility, or runtime rule enforcement. The local server's `--check` is structural only and does not load model weights.

For live use, first inspect `status`, then verify host rule loading and run an explicitly approved live task against the chosen backend. Preserve real decision receipts; never substitute `--mock` output for real authorization.
