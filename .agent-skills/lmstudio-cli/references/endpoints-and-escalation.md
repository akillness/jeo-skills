# Endpoints and Escalation

## Two surfaces to keep separate
### 1. OpenAI-compatible endpoints
Use this when the goal is **client compatibility**.

Documented upstream endpoints include:
- `GET /v1/models`
- `POST /v1/responses`
- `POST /v1/chat/completions`
- `POST /v1/embeddings`
- `POST /v1/completions`

Primary source: https://lmstudio.ai/docs/developer/openai-compat

This path is best when you only need to:
- verify a base URL
- list model IDs
- send a small chat smoke test
- point an existing OpenAI client at LM Studio

### 2. Native LM Studio REST API
Use this when the goal is **LM Studio-specific model management**.

Primary source: https://lmstudio.ai/docs/developer/rest

This path is best when you need to:
- inspect LM Studio-managed models directly
- load or unload a model
- reason about context length or effective load config
- understand behavior that a generic OpenAI client will not expose

## Escalation rule
Start with the OpenAI-compatible path unless the user explicitly needs model-management details.

Escalate to native REST/CLI when:
- model loading is the real task
- context length is the blocker
- a loaded instance / identifier matters
- the downstream client works, but the wrong model or load config is active

## Example commands
```bash
# Compatibility path
curl -fsS http://HOST:PORT/v1/models
curl -fsS http://HOST:PORT/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"MODEL_ID","messages":[{"role":"user","content":"reply with exactly OK"}],"temperature":0,"max_tokens":8}'

# Native management path
curl -fsS http://HOST:PORT/api/v1/models
curl -fsS http://HOST:PORT/api/v1/models/load \
  -H 'Content-Type: application/json' \
  -d '{"model":"MODEL_KEY","context_length":262144,"echo_load_config":true}'
```

## Why the distinction matters
Upstream issue traffic shows that context-length and load-guardrail questions remain active pain points, especially in headless or remote setups:
- max-context flag request — https://github.com/lmstudio-ai/lms/issues/118
- missing CLI/REST equivalent for GUI "Load anyway" — https://github.com/lmstudio-ai/lms/issues/499
