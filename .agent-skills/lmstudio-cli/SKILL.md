---
name: lmstudio-cli
description: Use LM Studio CLI docs and OpenAI-compatible LM Studio servers to discover models, verify remote availability, and configure downstream tools like Strix. Supports local `lms` CLI flows and remote HTTP endpoint validation.
allowed-tools: Bash Read Write Grep Glob WebFetch
metadata:
  tags: lmstudio, lm-studio, lms, local-llm, openai-compatible, strix, model-server, inference
  version: 1.0.0
  source: https://lmstudio.ai/docs/cli
---

# LM Studio CLI

Use when the user mentions LM Studio, `lms`, a local/remote LM Studio server, OpenAI-compatible local inference, or wants to wire another tool to LM Studio.

## When to use
- Configure a tool to use LM Studio as an OpenAI-compatible endpoint
- Verify a remote LM Studio server is reachable
- Discover available remote models before selecting one
- Use `lms` CLI commands when LM Studio is installed locally
- Save repeatable config for tools like Strix

## Verified doc facts
From `https://lmstudio.ai/docs/cli` and linked pages:
- `lms` ships with LM Studio — if the app is installed, run `lms --help`
- `lms server status --json --quiet` reports server status in JSON
- `lms ls` lists downloaded local models
- `lms load <model_key>` loads a model; `--identifier` sets a custom API identifier
- `lms ps --json` lists loaded models
- `lms ps --host <host>` can query a remote LM Studio instance on the same subnet

From Strix local-model docs:
- For LM Studio / OpenAI-compatible servers, use `STRIX_LLM="openai/<model-id>"`
- Point `LLM_API_BASE` to the LM Studio OpenAI-compatible base URL, e.g. `http://host:port/v1`
- LM Studio itself does not require a real provider key for local models, but some OpenAI-compatible client layers still insist on an API key field being present; when wiring through such clients, a dummy value like `LLM_API_KEY="lmstudio-local"` / `OPENAI_API_KEY="lmstudio-local"` may be required

## Recommended workflow

### 1) Check whether local `lms` exists
```bash
command -v lms
lms --help
```
If absent, do not invent CLI output. Use the remote OpenAI-compatible HTTP API instead.

### 2) Verify remote LM Studio endpoint
```bash
curl -fsS http://HOST:PORT/v1/models
```
This returns OpenAI-compatible model IDs. Choose the exact ID you want to use.

Optional smoke test:
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

### 2.5) If you need max context, inspect and load via LM Studio native REST API
Use the native API to inspect `max_context_length` and load a dedicated instance with that value:
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
The response includes `instance_id` and the effective `load_config.context_length`. For downstream tools, prefer the returned instance ID if you need to guarantee the exact loaded configuration.

### 3) If `lms` exists locally, use the CLI docs-backed commands
```bash
lms server status --json --quiet
lms ls --llm
lms load <model_key> --identifier "my-model"
lms ps --json
```

For a remote LM Studio instance:
```bash
lms ps --host HOST:PORT
```

### 4) Configure Strix for LM Studio
Use the exact remote model ID under the OpenAI provider namespace:
```bash
export STRIX_LLM="openai/MODEL_ID"
export LLM_API_BASE="http://HOST:PORT/v1"
```
Example:
```bash
export STRIX_LLM="openai/google/gemma-4-26b-a4b"
export LLM_API_BASE="http://10.0.3.27:13009/v1"
```

### 5) Save reusable config files
Prefer tool-specific config JSON files over editing global shell profiles. For Strix:
```json
{
  "env": {
    "STRIX_LLM": "openai/google/gemma-4-26b-a4b",
    "LLM_API_BASE": "http://10.0.3.27:13009/v1",
    "STRIX_REASONING_EFFORT": "low",
    "STRIX_TELEMETRY": "0"
  }
}
```

## Pitfalls
- `lms` may be missing even if a remote LM Studio server exists — the HTTP endpoint can still work
- Use the exact model ID returned by `/v1/models`; do not shorten it unless you've explicitly assigned an identifier via `lms load --identifier`
- For Strix + LM Studio, use `openai/<model-id>` rather than bare model IDs in `STRIX_LLM`
- Remote private-network HTTP endpoints are sensitive; only query hosts the user explicitly authorized
- Local models can work, but Strix docs warn that cloud models are generally stronger for agentic security testing

## Good final report
Include:
- whether `lms` is installed locally
- remote endpoint tested
- models discovered
- exact model selected
- config file path written
- exact run command for the downstream tool
