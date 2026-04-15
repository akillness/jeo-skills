# Fabric install and provider setup

This guide keeps install/setup advice practical instead of turning the main skill into a command dump.

## Install patterns

### macOS / Linux
```bash
curl -fsSL https://raw.githubusercontent.com/danielmiessler/fabric/main/scripts/installer/install.sh | bash
```

### Homebrew
```bash
brew install fabric-ai
```

### Windows
```bash
winget install danielmiessler.Fabric
```

### First-time setup
```bash
fabric --setup
```

Upstream README positioning to remember:
- Fabric supports many providers and local-model setups.
- Install success does **not** mean provider config is correct.
- Server mode exists, but it should not be the default recommendation unless another tool needs HTTP access.

## Provider / model questions to answer
1. Which provider or local model is already available?
2. Does the user need one default model or pattern-by-pattern routing?
3. Is the workflow local-only, remote API based, or mixed?
4. Is server mode necessary, or is CLI use enough?

## Common friction points from upstream issues
- Vendor/model configuration drift or mis-parsing can break otherwise valid setups (for example remote Ollama vendor resolution issues).
- Custom pattern directories can behave differently between listing and retrieval in some server-mode paths.
- As Fabric keeps growing, the CLI surface can feel crowded; prefer a small recommended subset of commands.

## Safe default operator advice
- Start with one working provider/model before discussing multi-provider routing.
- Verify pattern listing before deeper workflow work:
```bash
fabric -l
fabric -L
```
- Only recommend `fabric --serve` when the workflow genuinely needs HTTP access.
- If provider setup is the dominant blocker, say so explicitly instead of pretending the pattern choice is the real problem.
