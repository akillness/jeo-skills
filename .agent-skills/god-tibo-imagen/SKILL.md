---
name: god-tibo-imagen
description: >
  Generate images using Codex's ChatGPT backend with zero production dependencies.
  Reuses existing local Codex authentication (~/.codex/auth.json) — no new credentials
  needed. Supports CLI (gti command), Node.js library, and Python SDK. Accepts text
  prompts with optional reference images (PNG/JPG/GIF/WebP). Includes dry-run mode
  and debug output. Triggers on: god-tibo-imagen, gti, image generation, codex image,
  chatgpt image, ai image, gpt image generation.
allowed-tools: Read Write Bash Grep Glob WebFetch
metadata:
  tags: image-generation, ai-image, codex, chatgpt, gti, cli, npm, python, multimodal
  platforms: Claude Code, Codex CLI, Gemini CLI, OpenCode
  keyword: god-tibo-imagen
  version: latest
  source: NomaDamas/god-tibo-imagen
  license: MIT
---

# god-tibo-imagen — AI Image Generation via Codex Backend

> Zero dependencies. Reuses your Codex login. Works from CLI, Node.js, or Python.

`god-tibo-imagen` generates images by sending requests to Codex's ChatGPT backend. It reads existing local authentication from `~/.codex/auth.json` — no separate API key setup required if you already use Codex CLI.

## Installation

### Plugin (Claude Code)
```bash
claude plugin marketplace add NomaDamas/god-tibo-imagen
```

### npm (CLI — global)
```bash
npm install -g god-tibo-imagen
# Provides the `gti` command
```

### npm (Library)
```bash
npm install god-tibo-imagen
```

### Python SDK
```bash
pip install god-tibo-imagen
```

### Skill (any platform)
```bash
npx skills add https://github.com/akillness/oh-my-skills --skill god-tibo-imagen
```

## Requirements

- Node.js 20+ (CLI / library)
- Python 3.10+ (Python SDK)
- Existing Codex CLI login at `~/.codex/auth.json`

## When to use

- Generate AI images **without a separate API key** — reuses Codex auth
- Automate image generation from shell scripts, Node.js, or Python workflows
- Use **reference images** as context for guided generation (up to multiple images)
- Run **dry-run validation** before submitting real generation requests
- Integrate image generation into agent pipelines via the Python `Client` class

## Do not use when

- You need a supported public API (this uses an undocumented internal backend — may change)
- You do not have an active Codex / ChatGPT subscription with a valid `~/.codex/auth.json`
- You need guaranteed SLA or production-grade image generation → use DALL-E API or Stable Diffusion

## CLI usage

```bash
# Basic generation
gti --prompt "blue square icon on white background" --output ./out.png

# With reference image(s)
gti --prompt "make it round" --input ./ref1.png --input ./ref2.jpg --output ./out.png

# Dry-run (validate without generating)
gti --prompt "sunset over mountains" --dry-run

# Debug output (redacts sensitive data)
gti --prompt "cartoon cat" --output ./cat.png --debug
```

## Node.js library

```javascript
import { createProvider, resolveConfig } from 'god-tibo-imagen'

const config = await resolveConfig()
const provider = createProvider(config)
const result = await provider.generate({ prompt: 'abstract art' })
```

## Python SDK

```python
from god_tibo_imagen import Client

client = Client()
client.generate_image(
    prompt="blue square icon",
    output="./out.png"
)
```

## Supported formats

| Format | Input | Output |
|--------|-------|--------|
| PNG    | ✅    | ✅     |
| JPG    | ✅    | ✅     |
| GIF    | ✅    | —      |
| WebP   | ✅    | —      |

## Operating rules

1. Verify `~/.codex/auth.json` exists and is valid before running
2. Use `--dry-run` to validate prompt and config without consuming quota
3. Treat the backend as undocumented — avoid hard dependencies in production code
4. Use `--debug` to inspect request shape; sensitive tokens are automatically redacted
5. Pass multiple `--input` flags for multi-image reference context

## References

- [NomaDamas/god-tibo-imagen](https://github.com/NomaDamas/god-tibo-imagen)
- [npm: god-tibo-imagen](https://www.npmjs.com/package/god-tibo-imagen)
- [Docs](../../docs/god-tibo-imagen/README.md)

Source: [NomaDamas/god-tibo-imagen](https://github.com/NomaDamas/god-tibo-imagen) — MIT License
