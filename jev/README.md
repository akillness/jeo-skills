# Jev Control Plane Harness

Optional TypeSafe System One harness for skill routing, context pruning, and proposal review. Named profiles select isolated backends. Codex lifecycle hooks can inject selected skill instructions and review proposed tool calls; Claude and Pi-family extensions can inject selected instructions. Host permissions remain authoritative.

![Jev control-plane flow](./assets/jev-flow.gif)

## Optional setup

Jev is optional and separate from catalog installation in every mode, including `full`. With no TTY and no `JEO_SKILLS_JEV` selection, or with `JEO_SKILLS_JEV=skip`, the installer does not fetch or install Jev. Skipping preserves existing Jev files and settings; it is not uninstall or disable.

Use one lowercase profile ID per independent agent environment. `--profile` selects isolated Jev state, while `--agent` selects where the Agent Skill is installed. A missing or disabled selected profile never falls back to another profile or the legacy shared config. Profile and backend files are mode-600. Setup is home-scoped and must be explicitly approved before it performs hosted calls, model downloads, or local execution.

Choose the coding-agent host, not the model/provider. Current canonical host IDs are `claude`, `jeo`, `jeopi`, `pi`, `omp`, `gjc`, `codex`, `opencode`, `agy`, `kimi`, `grok`, `cursor`, `crush`, `antigravity`, and `aside`. Set session-local `JEV_AGENT` to one of these IDs and `JEV_PROFILE` to its explicitly assigned profile, otherwise its `agents.json` mapping, otherwise the host ID. Aside requires a selected account and defaults to `aside-u<account>`; independent accounts need independent profiles such as `aside-u0` or `claude-work`. The [shared rule](jev-control-plane.rule.md#activation-and-profiles) is the canonical host table: `antigravity-cli` is the guide alias for AGY (`agy`), `kimi-code-cli` is the guide alias for Kimi Code (`kimi`), AGY is distinct from the Antigravity IDE (`antigravity`), and Grok Build is explicit-selection-only (`grok`), never PATH-detected because an installed `grok` may be Superagent rather than Grok Build.

After backend opt-in, the [setup guide](../setup-all-skills-prompt.md#jev-control-plane-harness-system-one) selects hosts using `JEV_AGENT` > `JEO_SKILLS_AGENT`; an absent selector or `universal` configures all detected hosts independently except Grok Build, which requires explicit `grok` selection. A custom `JEO_SKILLS_JEV_PROFILE` (otherwise `JEV_PROFILE`) requires one selected host. After each per-host setup succeeds, the guide invokes the existing `jev-plugin.mjs configure --agent <host> --profile <profile> --backend <selected> --apply` configuration-only path to create or update that canonical host's `~/.agents/jev/agents.json` binding. It preserves custom profile/native/scope fields on that host, other host entries, and any saved per-profile key; it does not register native hooks. Session variables count as selections, so unset all four inside the setup subshell for an all-host run without inherited bindings. This is configuration, not native hook activation. Standalone setup/harness commands still require explicit `--profile` (or the harness's existing `JEV_PROFILE`); no runtime selection is inferred from a provider/model name.

Standalone setup preflights the root `~/.agents/jev/jev-plugin.mjs` destination and raw-native file leaves before staging or publication. Root-controller symlinks/non-files and native non-file leaf collisions are refused. The collision regressions preserve existing core/native/catalog/profile bytes and outside targets; resolve the conflicting destination before rerunning approved setup.

```sh
JEO_SKILLS_AGENT=jeopi JEO_SKILLS_JEV=api bash install.sh
bash jev/jev-setup.sh --profile agy --agent agy --mode local
bash jev/jev-setup.sh --profile kimi --agent kimi --mode systemone
bash jev/jev-setup.sh --profile grok --agent grok --mode api
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
| `local` | Defaults to `qev-0.8b-text-Q8_0` (`labqoat/qev-0.8b-GGUF`, ~775 MB, ~1.0 GB RAM/VRAM, tuned for 16 GB RAM / 6 GB VRAM) hosted via `llama-server` on `http://127.0.0.1:8017/v1/systemone`. Pass `--model h2o-lightning-4b-Q4_K_M`, `--model jevos-v5` (or `--mode jevos`), or `--model jev-9b-local` for alternatives. | `qev-0.8b` / `h2o-lightning-4b` TypeSafe `/v1/systemone` (`llama-server`, `choiceCap=24`, `/health`), `jevos-v5`, or legacy `jev_local_server.py` (`8763`). |
| `ollama` | Requires Ollama; model pull/start is explicit and may download a quantized third-party model. | Native `/api/chat` JSON-from-chat adapter, default `http://127.0.0.1:11434`. |
| `lmstudio` | Requires LM Studio; model download/load and server startup are explicit. | OpenAI-compatible `/v1/chat/completions` JSON-from-chat adapter, default `http://127.0.0.1:1234`. |
| `systemone` | Configures an endpoint, model, and optional key; no model download is implied. | `JEV_SYSTEMONE_DRIVER=typesafe` (default), `decide`, or `vllm-jev-decision`. |

For LM Studio, an empty `JEV_LMSTUDIO_MODEL` intentionally auto-selects a loaded
model whose ID matches `/jev/i`. Config-only binding preserves that empty value,
and a valid endpoint-only profile can be enabled without pinning a model.
Explicit `--model`, a saved `JEV_LMSTUDIO_MODEL`, and legacy `JEV_LOCAL_MODEL`
remain model-selection inputs in that order. Enablement does not load a model,
start the server or prove readiness; status and live operations still require
the configured server and a matching loaded model.

The local HTTP server rejects negative `Content-Length` and bodies above 1 MiB
with its existing HTTP 400 JSON error envelope. It applies a 10-second timeout
to each socket I/O operation and closes the listening socket on server exit.
This is not a total request or model-inference deadline; slowly progressing
clients and model/GPU allocation require separate measurement.

`systemone/typesafe` uses the TypeSafe body at `JEV_SYSTEMONE_ENDPOINT`. `systemone/decide` posts each question to `<endpoint>/v1/decide` with `kind`, `state`, `question`, and optional `options`, then reads parallel `options` and `probabilities` arrays (Noul options are `false` and `true`). `systemone/vllm-jev-decision` posts each question to `<endpoint>/v1/completions` with the model, structured decision prompt, `max_tokens:1`, `temperature:1.0`, `logprobs`, `allowed_token_ids`, `add_special_tokens:false`, and `return_tokens_as_token_ids:true`, then reads `choices[0].logprobs.top_logprobs[0]`.

All five kinds default to tier `unvalidated`. A response format or passing loopback fixture proves transport, not calibration. Tier `validated` requires an explicit attestation `JEV_<KIND>_VALIDATED_MODEL=<model id>` in that kind's env file that matches the model id the backend **reports serving in its response** (a response without a served model never matches). Attestation is honored **only for calibrated decision-head drivers**: `api` and `systemone` (`typesafe` `/v1/systemone`, `decide` `/v1/decide`, `vllm-jev-decision` logprobs). `local` (base-model logits), `ollama`, and `lmstudio` (JSON-from-chat) are System 2 paths and remain `unvalidated` permanently — an attestation on those kinds is reported as `eligible: false` and ignored, so no flag can promote them. `permit` is allowed only on `validated`; a stale or mismatched attestation is `unvalidated` with `state: "stale"`. Every request is also bounded by the answering backend's serialized-state limit before any network I/O (`local`/`ollama`/`lmstudio` 6,000 chars, AutoTrust `decide`/`vllm-jev-decision` 3,000, hosted `api`/`systemone` `typesafe` 100,000); an oversized `review` proposal is rejected as `unavailable` and never trimmed, and only the operation's explicit fallback chain may route it to a larger-context backend.

## Automatic Codex integration

Codex CLI 0.162.1 was verified with the official [hooks interface](https://learn.chatgpt.com/docs/hooks). Configure a profile, enable it, merge the generated hooks, then review and trust those definitions in Codex `/hooks`:

```sh
# JEV_API_KEY is the name of an already-set environment variable, not a literal secret.
node jev/jev-plugin.mjs configure --agent codex --profile codex --backend api \
  --key-env JEV_API_KEY --runtime-mode assist --review-mode advisory --apply
node ~/.agents/jev/jev-plugin.mjs enable --agent codex --profile codex --apply
node ~/.agents/jev/jev-plugin.mjs hooks-install --agent codex --profile codex --apply
node ~/.agents/jev/jev-plugin.mjs status --agent codex --profile codex
```

When updating an API profile that already has a saved key, omit `--key-env` to preserve it. `hooks-install` preserves existing hook groups and is idempotent. It writes `hooks.json` in `CODEX_HOME` or `~/.codex`, with an absolute Node/controller command. Preview without `--apply`. Installation does not establish hook trust: Codex skips untrusted or modified definitions. Trust must match the exact generated definition. Restart or start a fresh host session after installation and verify actual injected context.

| Setting | Behavior |
|---|---|
| `JEV_RUNTIME_MODE=advisory` (default) | Return selected skill/model names as suggestions. |
| `JEV_RUNTIME_MODE=assist` | Read selected installed `SKILL.md` files and inject their full text and source paths into model context. |
| `JEV_REVIEW_MODE=off` (default) | PreToolUse returns neutral without a review request. |
| `JEV_REVIEW_MODE=advisory` | PreToolUse calls `review` and injects its verdict; host approvals remain unchanged. |
| `JEV_REVIEW_MODE=enforce` | Explicitly deny matched tool calls unless review returns `permit` on a `validated` backend. Provider/contract failures and missing turn context deny. A permit never returns a host `allow` decision. |

Set these values through `configure --runtime-mode advisory|assist --review-mode off|advisory|enforce ... --apply`. New config-only profiles remain OFF until enabled. The generated Codex PreToolUse matcher covers `Bash`, `apply_patch`, `Write`, `Edit`, `exec_command`, and `write_stdin`; other hosts also match the lowercase `bash`, `write`, and `edit` plus `ast_edit`, and native extension matchers compare case-insensitively. No matcher is an exhaustive filter for every third-party tool. Hooks do not switch coding models or rewrite Codex history. Codex can skip untrusted hooks and fail open on process failure or timeout; this is a host integration, not a security sandbox. Use host permissions for the final boundary. Hook timeout is 90 seconds.

Re-running `hooks-install` migrates the matcher of Jev-owned PreToolUse groups. If a group also contains user-owned hooks, Jev moves its handler into a separate group instead of widening the user's matcher. Preview remains read-only; applying the same matcher again is idempotent. Codex definitions must be trusted again after a change.

### Host integration status

`hooks-install --agent <host>` writes the integration below. Skill selection, context filtering, and action review are separate events: widening a tool matcher never adds skill selection or filtering.

| Host | Skill selection and injection | Context filtering | Action review | Verified |
|---|---|---|---|---|
| Codex | `UserPromptSubmit` | none | `PreToolUse` | live Codex sessions (see Verification) |
| Claude | `UserPromptSubmit` | none (no host context event) | `PreToolUse` | hook fixtures only |
| jeopi / OMP / Pi | `before_agent_start` | `context`: older Jev skill messages; `JEV_MEMORY_MODE=extended` also compresses tool results (string or text-part arrays) and summarizes older text turns | `tool_call` | Pi's real extension loader registers all callbacks from `extensions/jev-control-plane.js`; jeopi/OMP share the same `*.{ts,js}` discovery rule |
| GJC | same extension adapter | same | same | installed GJC extension loader, generated `.js` entrypoint, and route/filter/review callbacks smoke-tested against a loopback fixture; live model sessions not verified |
| AGY | `PreInvocation` | none (no installed context event) | `PreToolUse` | hook fixtures only; no AGY CLI was available to verify |
| jeo | none | none | `pre-tool` command hook in `~/.jeo/config.json` | jeo-code's real `runPreToolHooks` vetoes on exit 2 |
| Cursor | `beforeSubmitPrompt`: suggested skill names only (no skill body; `assist` behaves as advisory) | none | `preToolUse` for `Shell`, `WriteShellStdin`, `Write`, `Delete` | runner tested against payloads built from Cursor's documented hook schema; no live Cursor session observed |

jeo-code exposes `pre-tool`, `post-turn`, `post-implementation` and, in newer builds, `pre-prompt` and `turn-end` command hooks. Jev registers only the `pre-tool` one, whose payload carries no user prompt, so Jev cannot select skills or filter context for jeo, and no task is cached for its review: `enforce` withholds every matched tool, while `advisory` makes no review call because jeo ignores plain-text hook output on a zero exit. `hooks-install --agent jeo` edits only a `config.json` that jeo already created (it must contain `defaultModel`, or jeo ignores the whole file), refuses to turn on `hooks.enabled` while other hooks are configured, and does not apply in projects whose `.jeo/hooks.json` replaces the global hook list. Prompt-time skill routing for jeo is a separate integration: `python3 .agent-skills/openspace/scripts/route-hooks.py install --host jeo` registers it in `~/.jeo/hooks.json`.

Cursor reads user hooks from `~/.cursor/hooks.json`. `hooks-install --agent cursor` adds two command entries that run `plugins/cursor/hooks/jev-cursor-adapter.mjs`: `beforeSubmitPrompt` returns the suggested skill names as `additional_context`, and `preToolUse` reviews `Shell`, `WriteShellStdin`, `Write` and `Delete` calls once the profile sets `JEV_REVIEW_MODE` to `advisory` or `enforce`. `--matcher` takes a regular expression and replaces that default; MCP and other tools are not reviewed unless it names them. Cursor drops `additional_context` longer than 10,000 characters and a skill body is routinely larger, so `JEV_RUNTIME_MODE=assist` behaves as advisory there and no skill file is read or injected. The runner prints one JSON line and exits 0 on every path, never answers `allow` or `ask` (a withheld action is `permission: deny`), and never denies a prompt. Before any backend call it removes common secret shapes (a bare high-entropy string with no key name or known prefix is not detected), shortens the home directory to `~`, and bounds a prompt to its first 2,200 and last 600 characters. Under `enforce` it withholds a matched tool call it cannot review, such as a backend failure, a timeout or malformed input. Installation previews unless `--apply` is given, replaces only its own entries in place and keeps every other entry, event and key in content and order, and refuses a `hooks.json` that has no `"version"` key, contains comments, or is given a matcher that is not a valid regular expression, because Cursor would otherwise discard or misread the whole file. Cursor lets an action proceed when a hook crashes or is killed at its timeout and does not load `~/.cursor/hooks.json` in cloud agents, so this is not a security boundary. `JEV_CURSOR_TIMEOUT_MS` sets the controller deadline in milliseconds (1000-60000, default 8000; any other value falls back to the default); the installer writes a 12-second Cursor hook timeout and the runner adds a 1.5-second watchdog, so keep it at or below 10000. `JEV_CURSOR_HOOK_LOG=<file>` appends one metadata-only line per call. Live Cursor execution has not been observed.

The hook commands name the Node that ran `hooks-install`. Under Homebrew that is the stable `<prefix>/bin/node` (or `<prefix>/opt/<formula>/bin/node`) link rather than the versioned `Cellar` path, when the link resolves to the same binary. Under nvm, fnm or Volta no stable path exists, so the result carries a `warnings` entry: those hooks stop working when that Node version is removed, and re-running `hooks-install` replaces them.

In extended memory mode a dropped tool result keeps its message, with its text replaced by a placeholder, so the matching tool call is never orphaned. Results containing images or other non-text parts are never rewritten.

Assist mode loads only catalog-listed paths `<name>/SKILL.md` within the selected skill root. Escaped symlinks, missing files and oversize skills are skipped; instructions are never partially truncated. Limits are 64 KiB per skill and 96 KiB combined. An explicit `JEV_CATALOG_PATH` selects a caller-trusted catalog/root; native callbacks otherwise pin the installed snapshot instead of trusting the working directory.

For review, the latest task is cached privately per profile/session/turn for up to 24 hours, with mode-600 files. A new prompt cleans up expired cache entries. Jev does not execute tests/builds: the review input describes the proposed tool call, and host validation and approvals remain separate.

Native extension review uses the current task supplied by the host callback before any cached task. Oversized current tasks are withheld instead of falling back to stale task text. Codex continues to require its session/turn-bound task cache.

<a id="native-advisory-integration"></a>

## Native extension integration

For Claude, jeopi, omp, and pi coding-agent runtimes, Jev provides optional native advisory hooks that receive `UserPromptSubmit` or equivalent events and return skill routing candidates and host model suggestions. These are advisory-only proposals and do not enforce host permissions or change what the agent actually executes. Package registration, session loading, and profile activation are separate:

```sh
# Preview a read-only native session-load plan for Claude (executes nothing)
node ~/.agents/jev/jev-plugin.mjs host-plan --agent claude --profile claude

# Activate an already-configured Claude profile (does not load/register the package)
node ~/.agents/jev/jev-plugin.mjs enable --agent claude --profile claude --apply

# Check advisory status
node ~/.agents/jev/jev-plugin.mjs status --agent claude --profile claude
```

When a host loads the native package, its callback remains registered while the selected profile is ON or OFF. An OFF profile returns neutral before stdin/catalog/backend work. `JEV_ENABLED` is the profile activation switch; copying/loading assets does not change it. An ON advisory profile returns suggestions prefixed `Jev advisory only`. In assist mode, Claude injects selected full skill instructions with the prompt; jeopi, OMP, and Pi inject a `jev-skill-context` custom message. Their context callback can remove older Jev-owned messages after a confident prune decision. The newest skill message, all user/system/assistant/tool messages, tool-call pairs and other extensions' messages are preserved. At most 32 old Jev blocks/262,144 characters are considered per callback; errors preserve them. Native extensions do not automatically switch models or enforce action review. Codex uses the separate lifecycle hooks above.

For jeopi, OMP, and Pi, helpers tolerate subprocess stdin `EPIPE` only after a parsed `enabled:false` response. Actual-OFF registered callbacks with a 1 MiB prompt return `{}` without changing prior host context, exit 0, and emit no unhandled-error/EPIPE stderr; other stdin errors remain `CONTROLLER_INPUT_ERROR`.

### Skill usage ledger

Every native or Codex hook that routes at least one skill for an active profile appends one
line to `${JEO_SKILL_STATE_DIR:-${XDG_STATE_HOME:-~/.local/state}/jeo-skill}/jev-usage.jsonl`:
`{v, at, agent, profile, routed, injected, backend: {kind, model, tier}}`. `injected` lists
only skills whose full instructions were actually injected (assist mode); `jeo-skill usage
scan` counts `injected` as use and ignores `routed`. Lines hold names, timestamps, and the
locally configured model only, never task, prompt, or skill text. The directory is mode 700
and files mode 600. At 5 MiB the live file is renamed to a unique
`jev-usage.<stamp>-<pid>-<uuid>.jsonl` segment without locks; the newest segments are kept
up to 10 MiB. OFF or inactive profiles and hooks that route nothing write nothing, and
ledger failures never affect the hook result. Installed hooks pick this up after re-running
Jev setup.

## Configuration and setup

```sh
: "${JEV_AGENT:?Select the current coding agent first}" "${JEV_PROFILE:?Select the current agent profile first}"
# Preview configuration (no --apply: shows what will be set)
node ~/.agents/jev/jev-plugin.mjs configure --agent "$JEV_AGENT" --profile "$JEV_PROFILE" --backend api --key-env JEV_API_KEY

# Apply configuration (--apply: writes profile files and environment)
node ~/.agents/jev/jev-plugin.mjs configure --agent "$JEV_AGENT" --profile "$JEV_PROFILE" --backend api --key-env JEV_API_KEY --apply

# Enable profile (default: preview; --apply: changes JEV_ENABLED=true)
node ~/.agents/jev/jev-plugin.mjs enable --agent "$JEV_AGENT" --profile "$JEV_PROFILE"
node ~/.agents/jev/jev-plugin.mjs enable --agent "$JEV_AGENT" --profile "$JEV_PROFILE" --apply

# Disable profile (loaded callbacks return neutral before doing work)
node ~/.agents/jev/jev-plugin.mjs disable --agent "$JEV_AGENT" --profile "$JEV_PROFILE" --apply

# Status (always read-only, never reaches backend)
node ~/.agents/jev/jev-plugin.mjs status --agent "$JEV_AGENT" --profile "$JEV_PROFILE"
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
| `JEV_RUNTIME_MODE` / `JEV_REVIEW_MODE` | Profile integration modes; defaults `advisory` and `off`. Configure through the controller flags above. |
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

Returns read-only JSON with `capability`, `lifecycle`, and `steps`; `verified: false` and `executed: false` mean nothing was executed or host-verified. Claude/jeopi/omp/pi report `capability: "native-lifecycle"` and `lifecycle: "session-only"`: their `package-load` steps propose session argv (`--plugin-dir` for Claude, `-e` for the others). Claude/jeopi persistent `package-enable`/`package-disable` proposals are marked `status: "unsupported"` pending operator verification of package registration; copying native assets is not registration. Omp/pi have no verified persistent targeted package toggle. Codex reports `capability: "native-hooks"` and `lifecycle: "persistent-with-trust"`, with an installation plan and exact-definition trust step. Remaining hosts advertise adapter-only capability. Host package toggles are independent of the profile's `JEV_ENABLED`; activate a configured profile with the controller's `enable --agent <agent> --profile <profile> --apply`, not with a host package command. `host-plan` never installs, registers, loads, or enables anything.

### Model plan

```sh
: "${JEV_AGENT:?Select the current coding agent first}" "${JEV_PROFILE:?Select the current agent profile first}"
# Preview advice against a fresh host-owned observation, without executing it
node ~/.agents/jev/jev-plugin.mjs model-plan --agent "$JEV_AGENT" --profile "$JEV_PROFILE" \
  --advice advice.json --host-models host-models.json
```

An enabled profile requires both explicit files. `--advice` accepts an array or an object containing a `routing` or `advice` array with `{chosen: "provider/model", candidates: [{provider, model}...]}` entries. `--host-models` accepts this observation shape (replace the placeholders with authorized host observations, not credentials):

```json
{
  "agent": "jeopi",
  "profile": "jeopi",
  "observedAt": "<ISO 8601 date-time with Z or an explicit offset>",
  "inventory": {
    "openai-codex": {
      "authenticated": null,
      "models": [],
      "limitedUntil": null,
      "modelLimits": {}
    }
  }
}
```

The snapshot must match the requested agent/profile and be no more than 60 seconds old, never future-dated. Freshness is rechecked after input reads and immediately before returning; invalid calendar dates are rejected rather than normalized. Only `authenticated: true` and exact model membership qualify a candidate. Provider `limitedUntil` and per-model `modelLimits` contain optional ISO date-time resets: missing/null or elapsed resets are eligible; future or malformed resets are not. OAuth `openai-codex` is distinct from API `openai` in Pi-family plans; Claude remains Anthropic-only and Codex OpenAI-only.

The listed choice is preferred if eligible. Otherwise the plan uses the next eligible advice candidate, preserving supplied order (ranked candidates before policy-only candidates), and includes remaining eligible `fallbacks` with host-native argv. An unlisted choice or an exhausted intersection fails closed. Both files must be nonsymlink regular JSON of at most 1 MiB each; advice is capped at 64 entries, 128 combined candidates per entry, 256-character model IDs and 128-character skill IDs.

Returns `plans` with `{skill, provider, model, argv, fallbacks, advisory: true, executed: false}`. This caller-supplied snapshot is not live authentication proof or execution permission. Jev has no automatic inventory collector here: it never reads host credentials, probes providers, runs the argv, or changes the host model, even with `--apply`. An OFF profile returns inactive before reading either input.

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
├── llama.cpp/                        # llama-server binary when auto-downloaded for default local mode
├── jevos/                            # jevos-v5 binary + OpenVINO INT8 model/ (--mode jevos)
├── venv/                             # legacy local mode (--model jev-9b-local)
└── models/
    ├── qev/                          # default local GGUF weights (qev-0.8b-text-Q8_0.gguf)
    └── JEV-9B/                       # legacy local weights, only when downloaded

~/.agents/rules/jev-control-plane.md   # host rule copy, not a native hook
~/.agents/skills/jev-control-plane/   # portable Agent Skill (when installed)
.agent-skills/skills.json              # catalog input in checkout (wins over the snapshot)
```


## Runtime flow and commands

### Route

`estimatedTokensSaved` and `estimatedSavingsPercent` approximate names/descriptions at one token per four characters; they do not measure end-to-end model tokens or cost.

```sh
node ~/.agents/jev/jev-harness.mjs --profile "${JEV_PROFILE:?Select the current agent profile first}" route-skills --top-k 3 "<task>"
```

`route-skills` retains `task`, mode, `families` (categories of `topK`), `topK`, token estimates, and `publicRegistryFallback`, and adds `selection` and advisory `routing`. Gate and fit thresholds are both `0.30`. A gate below threshold returns explicit none (`topK: []`, `selection.reason: "gate"`) and `publicRegistryFallback`; no candidate meeting fit threshold returns explicit none with `selection.reason: "fits"`. Strategy is `sharded` when `ceil(catalogSize / choiceCap) <= 4` and `shortlist` otherwise. The sharded path chooses per-shard finalists, then a final choice; shortlist is lexical and cap-aware.

If `.agent-skills/skills.json` supplies `model_policies`, `routing` is advisory: candidates use `provider/model` strings such as `openai/gpt-6.1-sol`, `google/gemini-2.5-pro`, `anthropic/claude-fable-5-1`, and `ollama/qwen2.5:7b`; these names identify models, not hosts. Each result carries the resolved `policy` (`{id, candidates, fallback, constraints}`), ranked candidates with probabilities, the chosen value (or `other`), confidence, and `provenance: {backend: {kind, driver, model, tier}}`. Native hosts receive model suggestions and `model-plan` can render host launch arguments; neither automatically switches the coding model. `model_policies` is not projected into `skills.toon` or README catalog tables. If no policy exists, `routing: []`.

### Prune

The standalone CLI emits verdicts rather than editing host context. Pi-family assist callbacks apply them only to older Jev-owned custom messages.

```sh
node ~/.agents/jev/jev-harness.mjs --profile "${JEV_PROFILE:?Select the current agent profile first}" prune-context < blocks.jsonl
```

The request state is `{blocks:[{id,text}...]}`. Questions are keyed by position within that request as `essential::<index>`, so duplicate block IDs are safe. Blocks are split into batches bounded by the answering backend's serialized-state limit (`local`/`ollama`/`lmstudio` 6,000 chars; AutoTrust `decide`/`vllm-jev-decision` 3,000; hosted `api`/`systemone` `typesafe` 100,000) so no block is judged without appearing in the model's input; a single block larger than the limit is returned as `keep` with a `reason` and is never dropped unjudged. Batch-capable drivers send one request per batch; other drivers loop per question. Keep blocks unless Jev returns `no` with confidence at least `0.8`; preserve uncertain blocks.

### Review

The standalone CLI returns a decision; it does not execute tests/builds or intercept a host action. Library callers can supply failed validation evidence. Codex PreToolUse integration applies the profile review mode described above.

```sh
node ~/.agents/jev/jev-harness.mjs --profile "${JEV_PROFILE:?Select the current agent profile first}" review "<task>" '<proposal-json>'
```

Review envelopes and results bind `backend: {kind, model, tier}`. A proposed `permit` on a non-validated tier is downgraded to `proposal_only` with reason `Backend tier 'unvalidated' cannot authorize autonomous execution`. Receipt v2 is the SHA-256 of `JSON.stringify({v:2, task, proposal, decision, backend:{kind, model, tier}})`; preserve the receipt as the audit binding.

| Review verdict | Meaning | Host action |
|---|---|---|
| `permit` | Favorable review on a validated backend. | Proceed only with live evidence and host permissions. |
| `proposal_only` | Insufficient confidence or non-validated/simulated permit. | Ask the user. |
| `reject` | Supplied validation fails. | Do not proceed. |
| `unavailable` | Missing credentials, ineligible/unreachable backend, contract error, timeout, or malformed response. | No autonomous action. |

### Smoke and offline checks

Fresh 2026-10-14 verification: six Node suites reported **117 passed, 1 opt-in live skip**; Python Jev+installer regressions passed **112 tests**; mock self-test passed **20/20**. Real TypeSafe routing selected `react-best-practices` through served `jev-1.13.0`. Two new actual Codex 0.162.1 sessions confirmed injected skill/source recognition and advisory PreToolUse findings before a successful read-only command. The installed profile uses assist/advisory, with both generated definitions reported trusted by the actual host. This verifies the stated transport and integration, not calibration, broad routing quality, or automatic permission grants.

```sh
node ~/.agents/jev/jev-harness.mjs --profile "${JEV_PROFILE:?Select the current agent profile first}" smoke --backend local --task "<task>"
node ~/.agents/jev/jev-harness.mjs self-test --mock
node ~/.agents/jev/jev-harness.mjs route-skills --mock --top-k 3 "React performance task"
```

`smoke` runs route/prune/review against the resolved backend with three golden tasks, never permits, and warns for an unvalidated tier. `self-test --mock` is offline and must print `N/N checks passed`; `--mock` never permits autonomous action. The harness does not execute public registry searches or install skills. Obtain explicit user approval before installing anything.

Recorded 2026-10-12 verification: `python3 -m unittest scripts.test_installer_regressions` passed 48 tests; `python3 -m unittest scripts.test_jev_regressions` passed 64. `JEV_LIVE_SMOKE=0 node --test jev/install.test.mjs jev/plugin.test.mjs jev/profile.test.mjs` reported 54 total, 53 pass, and 1 opt-in live skip. The prior offline mock self-test passed 20/20. The source catalog has 367 skills because of a concurrent MI skill addition; this Jev update adds no catalog entry.

The live Ollama check reached HTTP 200 but returned `selectedSkill:null` / `errorCategory:backend_unavailable`. It establishes transport and fail-closed output, not successful routing, model quality/calibration, or native package registration.

These checks cannot prove provider authentication, model loading, inference quality, probability calibration, backend parity, or runtime rule enforcement. For live use, inspect status, verify host rule loading, obtain approval for data sharing/costs, and preserve real receipts.
