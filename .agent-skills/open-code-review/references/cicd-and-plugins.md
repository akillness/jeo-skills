# OCR plugin and CI/CD integration

How to wire `ocr` into coding agents and pipelines. All integration methods require the
`ocr` CLI installed and an LLM configured first (see `configuration-and-rules.md`).

## 1. Install as an agent skill

```bash
npx skills add alibaba/open-code-review --skill open-code-review
```

Installs the upstream `open-code-review` skill, which teaches the agent to invoke `ocr`,
classify issues by priority, and optionally apply fixes. This jeo-skills routing front door
is also plugin-installable from this repo:

```bash
npx skills add https://github.com/akillness/jeo-skills --skill open-code-review
npx skills add -g https://github.com/akillness/jeo-skills --skill open-code-review
npx skills add -g https://github.com/akillness/jeo-skills --skill open-code-review -a claude-code -a codex -y
```

## 2. Claude Code plugin

```bash
/plugin marketplace add alibaba/open-code-review
/plugin install open-code-review@open-code-review
```

Registers the `/open-code-review:review` slash command, which runs OCR and filters/fixes
issues. Quick setup without a package manager — copy the command file directly:

```bash
# Project-level (shared via git)
mkdir -p .claude/commands
curl -o .claude/commands/open-code-review.md \
  https://raw.githubusercontent.com/alibaba/open-code-review/main/plugins/open-code-review/commands/review.md

# User-level (global)
mkdir -p ~/.claude/commands
curl -o ~/.claude/commands/open-code-review.md \
  https://raw.githubusercontent.com/alibaba/open-code-review/main/plugins/open-code-review/commands/review.md
```

## 3. Codex plugin

```bash
codex plugin marketplace add alibaba/open-code-review   # or `add .` for a local checkout
codex
/plugins
```

Enable `Open Code Review`, then invoke it explicitly in a new thread:

```text
@Open Code Review review my current changes
@Open Code Review review this branch against main
@Open Code Review review and fix high-confidence issues
```

The Codex skill runs the local CLI as `ocr review --audience agent`. This does not change
OCR's LLM backend and does not require an OpenAI Responses API endpoint.

## 4. CI/CD pipelines

Core command for automated MR/PR review:

```bash
ocr review \
  --from "origin/main" \
  --to "<commit_sha>" \
  --format json
```

- `--from` accepts a branch ref or commit SHA as the base; `--to` accepts a commit SHA or
  branch ref as the head.
- Prefer a **commit SHA for `--to`** in CI so fork PRs/MRs resolve when the source branch
  is absent on the origin remote.
- `--format json` emits machine-readable results for CI scripts to parse and post back.
- Provide credentials via env vars (`OCR_LLM_URL`, `OCR_LLM_TOKEN`, `OCR_LLM_MODEL`,
  `OCR_USE_ANTHROPIC`) rather than writing a config file in CI.

Upstream ships ready-made examples under `examples/` — `github_actions/` and `gitlab_ci/`.
