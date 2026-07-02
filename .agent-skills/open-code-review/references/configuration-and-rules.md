# OCR LLM configuration and review rules

OCR needs a configured LLM provider before its first review, and it resolves review rules
through a layered priority chain. **Never invent or hardcode an API key** — if credentials
are missing, stop and ask the user.

## 1. Provider configuration

Config is stored in `~/.opencodereview/config.json`. OCR ships many built-in providers and
supports custom (private-gateway) providers.

### Interactive (recommended for humans)

```bash
ocr config provider   # select a built-in provider or add a custom one
ocr config model      # pick a model for the active provider
ocr llm providers     # list all built-in providers
```

The interactive UI handles provider selection, API-key entry, model choice, and a
connectivity test. If the matching env var is already set (e.g. `ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`), the key is picked up automatically.

### Non-interactive (CI / scripts)

Built-in provider:

```bash
ocr config set provider anthropic
ocr config set providers.anthropic.api_key your-api-key-here
ocr config set providers.anthropic.model claude-sonnet-4-6
```

Custom provider (private gateway or other compatible endpoint — `url` and `protocol` required;
protocols: `anthropic`, `openai`):

```bash
ocr config set provider my-gateway
ocr config set custom_providers.my-gateway.url https://my-llm-gateway.internal/v1
ocr config set custom_providers.my-gateway.protocol openai
ocr config set custom_providers.my-gateway.api_key your-api-key-here
ocr config set custom_providers.my-gateway.model gpt-4o

ocr config unset custom_providers.my-gateway   # delete a custom provider
```

Optional provider settings: `providers.<name>.auth_header` (`x-api-key` | `authorization`),
`providers.<name>.extra_body` (JSON merged into the request body),
`providers.<name>.models` (list for interactive selection).

### Environment variables (highest priority — best for CI)

Env vars override the config file:

```bash
export OCR_LLM_URL=https://api.anthropic.com/v1/messages
export OCR_LLM_TOKEN=your-api-key-here
export OCR_LLM_MODEL=claude-opus-4-6
export OCR_USE_ANTHROPIC=true
```

OCR is also compatible with Claude Code env vars (`ANTHROPIC_BASE_URL`,
`ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_MODEL`) and parses `~/.zshrc` / `~/.bashrc` for them.

### Verify

```bash
ocr llm test
```

## 2. Review rules

OCR resolves rules with a four-layer, first-match-wins priority chain:

| Priority | Source | Path |
|---|---|---|
| 1 (highest) | `--rule` flag | user-specified path |
| 2 | project config | `<repoDir>/.opencodereview/rule.json` (commit to git) |
| 3 | global config | `~/.opencodereview/rule.json` |
| 4 (lowest) | system default | embedded `system_rules.json` |

### Rule file format (layers 1–3)

```json
{
  "rules": [
    {
      "path": "force-api/**/*.java",
      "rule": "All new methods must validate required parameters for null values",
      "merge_system_rule": true
    },
    {
      "path": "**/*mapper*.xml",
      "rule": "Check SQL for injection risks, parameter errors, and missing closing tags"
    }
  ]
}
```

- `path` — gitignore-style glob matched against the file path
- `rule` — natural-language review instruction for matching files
- `merge_system_rule` — when `true`, append the built-in system rule instead of replacing it

Preview which rule applies to a path:

```bash
ocr rules check src/main/java/com/example/Foo.java
ocr rules check --rule custom.json src/main/resources/mapper/UserMapper.xml
```

## 3. Viewer security

`ocr viewer` serves session JSONL (LLM requests/responses) over HTTP and enforces a
Host-header allowlist. Loopback names and the concrete bind host are always allowed;
wildcard binds (`--addr :3000`, `--addr 0.0.0.0:3000`) and other hostnames must be added via
`OCR_VIEWER_ALLOWED_HOSTS` (comma-separated) to block DNS-rebinding attacks:

```bash
OCR_VIEWER_ALLOWED_HOSTS=review.internal,ocr.lan ocr viewer --addr :3000
```
