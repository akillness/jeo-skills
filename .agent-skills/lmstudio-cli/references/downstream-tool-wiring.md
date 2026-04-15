# Downstream Tool Wiring

## Core handoff pattern
For downstream tools that already speak OpenAI-style APIs, the handoff usually boils down to:

1. verify the LM Studio endpoint,
2. capture the exact model ID,
3. set the downstream tool's base URL to LM Studio,
4. pass the model under the tool's provider namespace or model-format expectation.

The skill should not skip step 2. Guessing model IDs is one of the fastest ways to turn an LM Studio problem into a fake downstream-tool problem.

## Safe handoff example
```bash
curl -fsS http://HOST:PORT/v1/models
python3 scripts/check_lmstudio_endpoint.py --base-url http://HOST:PORT/v1
```

Then configure the downstream tool with the exact model ID:

```bash
export LLM_API_BASE="http://HOST:PORT/v1"
export STRIX_LLM="openai/MODEL_ID"
```

## Client-compatibility quirks
LM Studio itself does not require a real provider API key for local inference, but some OpenAI-compatible clients still expect an API key field to exist.

Guidance:
- call this a **client compatibility requirement**, not an LM Studio authentication requirement
- put the placeholder only in the downstream tool's config if needed
- avoid rewriting unrelated global provider config unless the user asked for that scope

## Boundary rule
- `lmstudio-cli` owns: endpoint verification, model discovery, native-vs-compatible routing, and final LM Studio connection facts
- downstream-tool skills own: their own scan modes, CI wrappers, output interpretation, or tool-specific operational behavior once LM Studio is confirmed working

## Comparison note
It is normal for users to compare LM Studio against Ollama, LocalAI, or llama.cpp server while debugging local inference. That comparison can help orientation, but it should not dilute this skill into a generic local-LLM chooser. Keep the skill anchored on LM Studio-specific operator work.
