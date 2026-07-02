---
name: open-code-review
description: >
  Run AI-powered code review through Alibaba's open-code-review (`ocr`) CLI instead of
  hand-reviewing diffs. Use when the user asks to review code, review a PR/MR, review
  staged/unstaged/untracked changes, review a single commit, compare two branches, or
  scan whole files for bugs, security issues, performance problems, and quality concerns.
  Picks the lightest invocation (workspace review, branch range, single commit, or
  full-file scan), passes business context via `--background`, classifies findings by
  priority, and optionally applies fixes. Triggers on: open code review, ocr review,
  ocr scan, alibaba code review, ai code review cli, review my changes, review this pr,
  review this commit, review this branch, scan repository for issues.
allowed-tools: Bash Read Write Edit Grep Glob WebFetch
license: Apache-2.0
compatibility: >
  Requires the `ocr` CLI (install via `npm install -g @alibaba-group/open-code-review`
  or a GitHub release binary; macOS, Linux, Windows). Requires a configured LLM provider
  (Anthropic- or OpenAI-compatible) before the first review. Plugin-installable via
  `npx skills add`, the Claude Code plugin marketplace, or the Codex plugin marketplace.
  Routes evidence-first human review judgment to `code-review`, Git mechanics to
  `git-workflow`, and live-failure reproduction to `debugging`.
metadata:
  tags: open-code-review, ocr, ai-code-review, pull-request-review, diff-review, security-review, cli, plugin, alibaba, git
  platforms: Claude, Codex, Gemini, Cursor, OpenCode, All
  keyword: ocr
  version: "1.0.0"
  upstream: https://github.com/alibaba/open-code-review
  source: akillness/jeo-skills
  license: Apache-2.0
---

# Open Code Review — routing-first AI review via the `ocr` CLI

> **Keyword**: `open-code-review` · `ocr review` · `ocr scan`
>
> [OpenCodeReview (OCR)](https://github.com/alibaba/open-code-review) is an open-source
> AI code-review CLI from Alibaba. It reads Git diffs (or whole files) and produces
> structured, line-level review comments through a configured LLM.

This skill is the **operator front door for the `ocr` binary**: it decides the lightest
invocation that answers the user's question, supplies business context, classifies the
findings, and only then applies fixes. It does **not** re-implement human review judgment —
that lives in the neighboring `code-review` skill.

## When to use this skill

- The user wants an automated review of working-copy changes, a commit, a branch range, or a PR/MR
- The user wants to scan whole files (no diff) to audit an unfamiliar or pre-migration codebase
- The user wants the review wired into a coding agent (Claude Code / Codex slash command) or CI/CD
- The user needs help configuring the `ocr` LLM provider or testing connectivity
- The user wants OCR comments classified by priority and selectively auto-fixed

## When NOT to use this skill

- Evidence-first human review judgment (approve / request-changes / block reasoning) → `code-review`
- Splitting commits, rebasing, conflict resolution, push recovery → `git-workflow`
- Reproducing or isolating a live runtime failure → `debugging`
- Long-term coverage policy, CI gates, flaky-suite direction → `testing-strategies`
- Measurement-led bottleneck analysis → `performance-optimization`

## Instructions

### Step 1: Confirm prerequisites before reviewing

```bash
which ocr || echo "NOT INSTALLED"   # CLI present?
ocr llm test                        # LLM reachable?
```

If `ocr` is missing, install only what the environment needs:

```bash
bash scripts/install.sh --method npm         # global npm install (default)
bash scripts/install.sh --method release     # GitHub release binary (macOS/Linux)
bash scripts/install.sh --method source      # build from source with make
```

If `ocr llm test` fails, the user must configure a provider. **Never invent or hardcode an
API key** — stop and ask the user for credentials, then use one path:

```bash
# Interactive (recommended for humans)
ocr config provider
ocr config model

# Non-interactive (CI/scripts) — built-in provider
ocr config set provider anthropic
ocr config set providers.anthropic.api_key <api-key>
ocr config set providers.anthropic.model claude-sonnet-4-6

# Environment variables (highest priority — best for CI)
export OCR_LLM_URL=https://api.anthropic.com/v1/messages
export OCR_LLM_TOKEN=<api-key>
export OCR_LLM_MODEL=claude-opus-4-6
export OCR_USE_ANTHROPIC=true
```

Provider/config details live in [references/configuration-and-rules.md](references/configuration-and-rules.md).

### Step 2: Gather business context before invoking

Read the commit messages, branch name, or the user's stated intent and distill one short
requirement sentence. Pass it through `--background` (`-b`) — OCR uses it to judge whether
the change implements the requirement, not just whether the code parses.

### Step 3: Choose the lightest invocation that fits

Pick exactly one primary mode:

| User intent | Command |
|---|---|
| Review the working copy (staged + unstaged + untracked) | `bash scripts/run-review.sh -b "context"` |
| Review a single commit | `bash scripts/run-review.sh --commit <sha> -b "context"` |
| Compare two refs (PR / feature branch) | `bash scripts/run-review.sh --from <base> --to <head> -b "context"` |
| Dry-run: which files would be reviewed | `ocr review --preview` |
| Audit whole files with no meaningful diff | `bash scripts/run-scan.sh --path <dir>` |

The wrapper scripts default to `--audience agent`, which suppresses progress UI and emits
only the final summary — the right mode when an agent (not a human terminal) consumes output.

```bash
# Workspace review with context
bash scripts/run-review.sh -b "Adding rate limiting to the login API"

# Branch range, JSON output for parsing, lower concurrency to dodge rate limits
bash scripts/run-review.sh --from origin/main --to feature-x --format json --concurrency 4

# Single commit; --background auto-fills from the commit message when omitted
bash scripts/run-review.sh --commit abc123

# Full-file scan of a subdirectory, capped spend, skipping generated/test files
bash scripts/run-scan.sh --path internal --exclude '**/*_test.go,**/generated/**' --max-tokens-budget 500000
```

Review/scan flag references live in [references/intake-and-modes.md](references/intake-and-modes.md).

### Step 4: Classify and report findings

OCR returns comments with `path`, `content`, `start_line`/`end_line` (both `0` = positioning
failed), optional `suggestion_code`, `existing_code`, and `thinking`. Group them by priority:

- **High** — obvious bugs, security issues, clear mistakes, or well-founded fixes with a precise proposal
- **Medium** — reasonable but context-dependent concerns, style/perf suggestions, manual-fix items
- **Low** — likely false positives, missing context, nitpicks — discard silently unless the user wants everything

Report High and Medium grouped by level; cite `path:line` for each.

### Step 5: Fix only with intent and verification

- If the user explicitly asked to "review and fix", apply High/Medium fixes directly when safe and well-defined
- If the user only asked to "review", ask before changing any code
- For complex fixes needing manual work, describe what must be done instead of guessing
- Always re-run the relevant tests/build and confirm fixes with the user before committing

### Step 6: Wire OCR into agents or CI when asked

- **Skill install**: `npx skills add alibaba/open-code-review --skill open-code-review`
- **Claude Code plugin**: `/plugin marketplace add alibaba/open-code-review` then `/plugin install open-code-review@open-code-review`
- **Codex plugin**: `codex plugin marketplace add alibaba/open-code-review`, then `/plugins` to enable
- **CI/CD**: `ocr review --from "origin/main" --to "<commit_sha>" --format json` (use a commit SHA for `--to` so fork PRs resolve)

Plugin and CI wiring details live in [references/cicd-and-plugins.md](references/cicd-and-plugins.md).

## Output format

When asked to review, return a compact, priority-grouped brief:

```markdown
## Code Review Results

**Mode**: workspace | commit <sha> | <base>..<head> | scan
**Files reviewed**: N
**Issues**: X high / Y medium

### High priority
- **`path/to/file.go:42`** — what is wrong
  > Recommendation: how to fix

### Medium priority
- **`path/to/other.ts:88`** — concern + context

### Decision
- ran <command>; fixes applied | fixes proposed (awaiting approval) | route-out to <skill>
```

## Examples

### Example 1: "Review my changes"
Run `bash scripts/run-review.sh -b "<context>"` (workspace mode), then classify and report.

### Example 2: "Review this PR against main"
Run `bash scripts/run-review.sh --from origin/main --to <branch> -b "<context>"`.

### Example 3: "Audit this unfamiliar repo for issues"
Use `bash scripts/run-scan.sh --preview` first to see the file list and token estimate, then scan.

### Example 4: "Review commit abc123 and fix the high-confidence bugs"
Run `bash scripts/run-review.sh --commit abc123`, apply only High findings with precise fixes, verify, confirm.

### Example 5: "Add OCR to our GitHub Actions"
Route to [references/cicd-and-plugins.md](references/cicd-and-plugins.md); use `ocr review --from origin/main --to <sha> --format json`.

### Example 6: "Help me decide whether to approve this risky migration"
That is review *judgment*, not tooling — run OCR for signal, then route the decision to `code-review`.

## Best practices

1. Confirm `ocr` is installed and `ocr llm test` passes before promising a review.
2. Always pass `--background` context when you can infer it — it materially improves relevance.
3. Choose one invocation mode; do not run review and scan for the same question.
4. Use `--preview` to estimate scope and cost before a large `scan`.
5. Use `--format json` and `--audience agent` for machine consumption; reserve text/human output for terminals.
6. Treat OCR comments as evidence inputs, not the final verdict — silently drop Low-confidence noise.
7. Never fabricate or hardcode API keys; stop and ask the user for credentials.
8. Auto-fix only with explicit intent, on safe High/Medium items, and verify before committing.
9. Route human approve/block judgment to `code-review`, Git cleanup to `git-workflow`, and live debugging to `debugging`.

## References

- [references/intake-and-modes.md](references/intake-and-modes.md)
- [references/configuration-and-rules.md](references/configuration-and-rules.md)
- [references/cicd-and-plugins.md](references/cicd-and-plugins.md)
- [scripts/install.sh](scripts/install.sh)
- [scripts/run-review.sh](scripts/run-review.sh)
- [scripts/run-scan.sh](scripts/run-scan.sh)
- [OpenCodeReview GitHub Repository](https://github.com/alibaba/open-code-review)
- [OpenCodeReview Documentation](https://alibaba.github.io/open-code-review/)
