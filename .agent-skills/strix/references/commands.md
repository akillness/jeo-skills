# Strix Commands

> Source: https://docs.strix.ai and https://github.com/usestrix/strix
> Last reviewed: 2026-03-28

## Prerequisites

- Docker installed and running
- Strix CLI installed
- `STRIX_LLM` configured
- Provider authentication available through `LLM_API_KEY` or provider-native auth

## Installation

### Official install script

```bash
curl -sSL https://strix.ai/install | bash
```

### `pipx` install

```bash
pipx install strix-agent
```

### Verify installation

```bash
strix --version
```

## Minimum environment

```bash
export STRIX_LLM="openai/gpt-5.4"
export LLM_API_KEY="your-api-key"
```

## Core scan commands

### Local directory

```bash
strix --target ./app-directory
```

### GitHub repository

```bash
strix --target https://github.com/org/repo
```

### Live web app

```bash
strix --target https://your-app.com
```

### Multi-target

```bash
strix -t https://github.com/org/repo -t https://your-app.com
```

### Authenticated or scoped testing

```bash
strix --target https://app.com --instruction "Use credentials from the approved test account"
strix --target https://app.com --instruction-file ./instruction.md
```

### Headless CI run

```bash
strix -n --target ./ --scan-mode quick
```

## Key flags

| Flag | Meaning |
|------|---------|
| `--target`, `-t` | Add a target. Can be repeated. |
| `--instruction` | Inline scope, credentials, or focus hints. |
| `--instruction-file` | File-based instructions. Prefer this for longer scope documents. |
| `--scan-mode`, `-m` | `quick`, `standard`, or `deep`. |
| `--non-interactive`, `-n` | Headless mode for CI/CD. |
| `--config` | Use a custom JSON config file instead of `~/.strix/cli-config.json`. |

## Output and exit codes

- Results are written under `strix_runs/<run-name>`
- `0`: no vulnerabilities found
- `1`: execution or environment error
- `2`: vulnerabilities found in headless mode

## Notes

- The first run may pull the sandbox image and take longer
- Keep credentials and scope restrictions explicit
- Only use Strix against authorized targets
