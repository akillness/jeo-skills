# god-tibo-imagen — AI Image Generation via Codex Backend

> Zero dependencies. Reuses your Codex login. Works from CLI, Node.js, or Python.

← [Back to README](../../README.md)

---

## What `god-tibo-imagen` owns

`god-tibo-imagen` is the skill for [NomaDamas/god-tibo-imagen](https://github.com/NomaDamas/god-tibo-imagen), a zero-dependency image generation tool that uses Codex's ChatGPT backend. It reuses the existing local Codex authentication file (`~/.codex/auth.json`) — no separate API key setup is required if you already use Codex CLI.

Use this skill when you need to:
- **Generate AI images from text prompts** without a separate API key
- **Automate image generation** in shell scripts, Node.js, or Python workflows
- **Use reference images** as visual context for guided generation
- **Validate generation config** with dry-run mode before consuming quota
- **Integrate image generation** into agent pipelines via the Python `Client` class

## Installation

### Plugin (Claude Code)
```bash
claude plugin marketplace add NomaDamas/god-tibo-imagen
```

### npm (CLI — global)
```bash
npm install -g god-tibo-imagen
```

### npm (Library)
```bash
npm install god-tibo-imagen
```

### Python SDK
```bash
pip install god-tibo-imagen
```

### Skill
```bash
npx skills add https://github.com/akillness/oh-my-skills --skill god-tibo-imagen
```

---

## Requirements

- Node.js 20+ (CLI / library)
- Python 3.10+ (Python SDK)
- Existing Codex CLI session at `~/.codex/auth.json`

---

## Quick start

```bash
# Install CLI
npm install -g god-tibo-imagen

# Generate an image
gti --prompt "blue square icon on white background" --output ./icon.png

# With reference image(s)
gti --prompt "make it round" --input ./ref.png --output ./round.png

# Dry-run validation
gti --prompt "sunset over mountains" --dry-run
```

---

## Python SDK

```python
from god_tibo_imagen import Client

client = Client()
client.generate_image(
    prompt="blue square icon",
    output="./out.png"
)
```

---

## Supported formats

| Format | Input | Output |
|--------|-------|--------|
| PNG    | ✅    | ✅     |
| JPG    | ✅    | ✅     |
| GIF    | ✅    | —      |
| WebP   | ✅    | —      |

---

## Further reading

- [`.agent-skills/god-tibo-imagen/SKILL.md`](../../.agent-skills/god-tibo-imagen/SKILL.md)
- [NomaDamas/god-tibo-imagen](https://github.com/NomaDamas/god-tibo-imagen)
- [npm: god-tibo-imagen](https://www.npmjs.com/package/god-tibo-imagen)
