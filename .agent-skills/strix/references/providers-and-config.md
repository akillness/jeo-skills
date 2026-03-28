# Strix Providers And Configuration

> Source: https://docs.strix.ai/advanced/configuration and provider docs
> Last reviewed: 2026-03-28

## Required variables

| Variable | Purpose |
|----------|---------|
| `STRIX_LLM` | LiteLLM-style model selector such as `openai/gpt-5.4` |
| `LLM_API_KEY` | API key for the chosen provider when required |

## Common optional variables

| Variable | Purpose |
|----------|---------|
| `LLM_API_BASE` | OpenAI-compatible proxy or local endpoint |
| `PERPLEXITY_API_KEY` | Enables Strix web search during scans |
| `STRIX_REASONING_EFFORT` | `none`, `minimal`, `low`, `medium`, `high`, `xhigh` |
| `STRIX_DISABLE_BROWSER` | Disable browser automation when UI testing is unnecessary |
| `STRIX_TELEMETRY` | Global telemetry toggle |
| `STRIX_IMAGE` | Override sandbox image |
| `STRIX_RUNTIME_BACKEND` | Runtime backend, default `docker` |
| `LLM_TIMEOUT` | LLM request timeout in seconds |

## OpenAI example

```bash
export STRIX_LLM="openai/gpt-5.4"
export LLM_API_KEY="sk-..."
```

## Anthropic example

```bash
export STRIX_LLM="anthropic/claude-sonnet-4-6"
export LLM_API_KEY="sk-ant-..."
```

## Vertex AI example

```bash
export STRIX_LLM="vertex_ai/gemini-3-pro-preview"
```

Use your cloud environment's standard Google auth instead of `LLM_API_KEY` when applicable.

## Local or proxy-hosted model example

```bash
export STRIX_LLM="ollama/llama4"
export LLM_API_BASE="http://localhost:11434"
```

## Config file

Default config path:

```bash
~/.strix/cli-config.json
```

Custom config example:

```json
{
  "env": {
    "STRIX_LLM": "openai/gpt-5.4",
    "LLM_API_KEY": "sk-...",
    "STRIX_REASONING_EFFORT": "high"
  }
}
```

Run with a custom file:

```bash
strix --target ./app --config /path/to/config.json
```

## Local telemetry artifacts

Even without remote OTEL export, Strix keeps run telemetry locally:

```bash
strix_runs/<run-name>/events.jsonl
```

## Recommendations

1. Pin `STRIX_LLM` explicitly in CI instead of relying on a saved local config.
2. Store `LLM_API_KEY` in a secret manager or CI secret store.
3. Disable the browser only when you are sure UI navigation is not needed.
4. Keep telemetry and remote trace settings intentional, especially on regulated targets.
