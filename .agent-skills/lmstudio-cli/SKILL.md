---
name: lmstudio-cli
description: "Operate LM Studio's `lms` CLI and local/remote LM Studio servers for model discovery, server status checks, model loading, endpoint smoke tests, and downstream OpenAI-compatible wiring. Use when the user mentions LM Studio, `lms`, a local model server, `/v1/models`, a remote LM Studio host, or wants to connect another tool to LM Studio; even if they only ask to test a local OpenAI-compatible endpoint or choose the correct loaded-model identifier. Triggers on: lmstudio, lm studio, lms, local model server, LM Studio API, LM Studio endpoint, /v1/models, connect Strix to LM Studio, load model in LM Studio."
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: Requires LM Studio for native `lms` usage; remote verification also works against an authorized LM Studio HTTP endpoint without the local app installed.
metadata:
  tags: lmstudio, lm-studio, lms, local-llm, openai-compatible, model-server, inference, local-inference, endpoint-validation, strix
  version: "1.1"
  source: https://lmstudio.ai/docs/cli
---

# LM Studio CLI

Use this skill when the real job is operating LM Studio itself: confirming whether `lms` exists, checking whether a local or remote LM Studio server is actually running, discovering exact model IDs, deciding whether the OpenAI-compatible endpoints are enough, and wiring a downstream tool to the correct base URL and model identifier.

Do **not** use this as a generic local-LLM comparison skill. Route broad provider comparison or platform selection to research/survey work. Route downstream-tool-specific scanning or appsec operation to that tool's skill (for example `strix`) once LM Studio itself is verified.

## When to use this skill
- A user mentions LM Studio, `lms`, or an LM Studio server directly
- You need to verify whether LM Studio is running locally or on another authorized host
- You need the exact model IDs returned by `/v1/models` before wiring another tool
- You need to choose between LM Studio's OpenAI-compatible endpoints and its native REST API
- You need to load, inspect, or confirm models before an agent or CLI can use them
- A downstream tool works with OpenAI-compatible endpoints, but the user needs LM Studio-specific setup help
- A remote/headless LM Studio workflow is failing and you need a deterministic verification path

## Instructions

### Step 1: Identify the operating mode
Classify the request before touching commands:

1. **Local native CLI mode** — the machine should have LM Studio installed and `lms` available
2. **Remote HTTP mode** — you only need to test or consume an authorized LM Studio endpoint
3. **LM Studio-native management mode** — the user needs model loading / listing / unload behavior that goes beyond generic OpenAI-compatible calls
4. **Downstream wiring mode** — the user already has LM Studio running and needs to point another tool at it

Use the smallest mode that answers the request.

### Step 2: Check whether local `lms` exists
If local CLI operation is expected, verify it first:

```bash
command -v lms
lms --help
```

If `lms` is missing, do not hallucinate local CLI output. Continue with remote HTTP verification only if the host/endpoint is explicitly authorized.

### Step 3: Verify server status or endpoint reachability
For local native checks:

```bash
lms server status
lms server status --json --quiet
```

For a remote or client-style smoke test:

```bash
curl -fsS http://HOST:PORT/v1/models
```

Optional minimal response test:

```bash
curl -fsS http://HOST:PORT/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "MODEL_ID",
    "messages": [{"role": "user", "content": "reply with exactly OK"}],
    "temperature": 0,
    "max_tokens": 8
  }'
```

If you want a reusable parser instead of copy-pasting curl, use `python3 scripts/check_lmstudio_endpoint.py --base-url http://HOST:PORT/v1`.

### Step 4: Discover exact model identifiers
Do **not** guess model names.

Use one of these:

```bash
lms ls
lms ls --llm
lms ps --json
curl -fsS http://HOST:PORT/v1/models
```

If the user needs the exact loaded instance or runtime state, prefer `lms ps` or the native REST API over a generic downstream client view.

### Step 5: Escalate to LM Studio-native management only when needed
Use the native REST API or LM Studio-native commands when OpenAI compatibility is not enough:

```bash
curl -fsS http://HOST:PORT/api/v1/models
curl -fsS http://HOST:PORT/api/v1/models/load \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "MODEL_KEY",
    "context_length": 262144,
    "echo_load_config": true
  }'
```

And locally:

```bash
lms load MODEL_KEY --identifier my-model
lms ps --json
```

Use this path for context-length, load-state, or instance-specific questions. Do **not** treat every integration problem as a native-management problem if `/v1/models` and `/v1/chat/completions` already answer the user's need.

### Step 6: Wire downstream tools carefully
For tools that expect an OpenAI-compatible server, pass the exact model ID and base URL:

```bash
export LLM_API_BASE="http://HOST:PORT/v1"
export STRIX_LLM="openai/MODEL_ID"
```

Some OpenAI-compatible clients still insist on an API key field even when LM Studio itself does not need a real provider key. When that happens, set the client-required dummy key only in the downstream tool's config, not as a claim about LM Studio authentication.

### Step 7: Report the operating facts, not guesses
A good final report should include:
- whether `lms` was present locally
- whether the server was verified locally, remotely, or both
- exact base URL tested
- exact model IDs discovered
- whether the user needed OpenAI-compatible calls only or LM Studio-native management
- the final env/config snippet or command needed by the downstream tool

## Examples

### Example 1: Local machine with LM Studio installed
User asks: "Is `lms` installed and what model is loaded?"

Recommended flow:

```bash
command -v lms
lms server status --json --quiet
lms ps --json
```

### Example 2: Remote LM Studio host for another tool
User asks: "Point Strix at my LM Studio box."

Recommended flow:

```bash
curl -fsS http://HOST:PORT/v1/models
python3 scripts/check_lmstudio_endpoint.py --base-url http://HOST:PORT/v1
export STRIX_LLM="openai/MODEL_ID"
export LLM_API_BASE="http://HOST:PORT/v1"
```

### Example 3: Need more than OpenAI-compatible smoke tests
User asks: "Load the model with a bigger context length and tell me the effective settings."

Recommended flow:

```bash
curl -fsS http://HOST:PORT/api/v1/models
curl -fsS http://HOST:PORT/api/v1/models/load \
  -H 'Content-Type: application/json' \
  -d '{"model":"MODEL_KEY","context_length":262144,"echo_load_config":true}'
```

### Example 4: Headless failure triage
User asks: "`lms server start` broke on my Linux VM. What should I check first?"

Recommended flow:
- verify `lms --help`
- run `lms server status --json --quiet`
- rerun with verbose logging if needed
- separate local daemon/server failure from downstream OpenAI-client failure before editing configs

## Best practices
1. Separate **local CLI availability** from **remote HTTP reachability**; they are related but not the same fact.
2. Use the exact model IDs returned by LM Studio instead of shortening names by hand.
3. Prefer the OpenAI-compatible endpoints for downstream-tool wiring, and the native REST/CLI surfaces for model-management questions.
4. When a downstream client insists on an API key field, describe it as a client compatibility quirk rather than an LM Studio requirement.
5. Treat remote private-network hosts as sensitive; only probe endpoints the user has authorized.
6. Escalate to load-state or context-length guidance only when the simpler `/v1/models` path is not enough.
7. Keep the boundary clear: `lmstudio-cli` verifies and configures LM Studio itself; downstream-tool skills own what happens after the endpoint is working.

## References
- [references/cli-and-server-basics.md](references/cli-and-server-basics.md)
- [references/endpoints-and-escalation.md](references/endpoints-and-escalation.md)
- [references/downstream-tool-wiring.md](references/downstream-tool-wiring.md)
- [scripts/check_lmstudio_endpoint.py](scripts/check_lmstudio_endpoint.py)
- [LM Studio CLI docs](https://lmstudio.ai/docs/cli)
- [LM Studio OpenAI compatibility docs](https://lmstudio.ai/docs/developer/openai-compat)
- [LM Studio REST API docs](https://lmstudio.ai/docs/developer/rest)
