# OCR intake, modes, and flags

Reference for choosing the right `ocr` invocation and its flags. Pick **one** primary mode
per question; do not run both `review` and `scan` for the same request.

## 1. Intake packet

Capture before invoking:

- **Surface**: working copy | single commit | branch range / PR | whole-file audit
- **Goal**: what behavior or requirement the change should satisfy (→ `--background`)
- **Consumer**: human terminal (`--audience human`) or agent/CI (`--audience agent`, `--format json`)
- **Constraints**: rate limits (→ lower `--concurrency`), token budget (→ `scan --max-tokens-budget`), excluded paths

## 2. Mode selection

| Situation | Command | Why |
|---|---|---|
| Uncommitted local work | `ocr review` | Reviews staged + unstaged + untracked (workspace mode) |
| One commit's intent | `ocr review --commit <sha>` | Diffs the commit against its parent; auto-fills `--background` from the message |
| PR / two refs | `ocr review --from <base> --to <head>` | Diff between refs; use a commit SHA for `--to` in CI to resolve fork PRs |
| No meaningful diff | `ocr scan` | Reviews whole files; works even in non-git dirs |
| Scope/cost check first | `ocr review --preview` / `ocr scan --preview` | Lists files (and a token estimate for scan) without LLM calls |

## 3. `ocr review` flags

| Flag | Short | Default | Description |
|---|---|---|---|
| `--repo` | — | current dir | Git repository root |
| `--from` | — | — | Source ref (e.g. `origin/main`) |
| `--to` | — | — | Target ref or commit SHA |
| `--commit` | `-c` | — | Single commit to review |
| `--background` | `-b` | from commit msg | Requirement/business context for the review |
| `--exclude` | — | — | Comma-separated gitignore-style skip patterns (merged with rule.json) |
| `--preview` | `-p` | `false` | List files without running the LLM |
| `--format` | `-f` | `text` | `text` or `json` |
| `--concurrency` | — | `8` | Max concurrent file reviews — lower to dodge rate limits |
| `--timeout` | — | `10` | Per-task timeout in minutes |
| `--audience` | — | `human` | `human` (progress UI) or `agent` (summary only) |
| `--model` | — | provider default | Override the LLM model for this run |
| `--rule` | — | — | Path to custom JSON review rules |

## 4. `ocr scan` flags

`ocr scan` reviews entire files — useful for auditing an unfamiliar codebase or a
pre-migration sweep. It prints a rough token-cost estimate before each run.

| Flag | Default | Description |
|---|---|---|
| `--path` | whole repo | Comma-separated dirs/files to scan |
| `--exclude` | — | Comma-separated skip patterns (merged with rule.json) |
| `--preview` | `false` | List files + estimate without LLM calls |
| `--max-tokens-budget` | `0` (unlimited) | Cap total token spend; dispatch stops once exceeded |
| `--no-plan` | `false` | Skip the per-file planning pre-pass |
| `--no-dedup` | `false` | Skip per-batch de-duplication of similar comments |
| `--no-summary` | `false` | Skip the project-level summary |
| `--batch` | `by-language` | Batching: `none`, `by-language`, or `by-directory` |
| `--format` | `text` | `text` or `json` (JSON adds a `project_summary` field) |
| `--concurrency` | `8` | Max concurrent file scans |

## 5. Comment shape

Each comment OCR emits contains:

- `path` — file path
- `content` — review comment text
- `start_line` / `end_line` — line range (both `0` means positioning failed)
- `suggestion_code` — optional fix suggestion
- `existing_code` — optional original snippet
- `thinking` — optional LLM reasoning

Classify each into **High / Medium / Low** priority; report High + Medium, drop Low noise
unless the user wants everything.
