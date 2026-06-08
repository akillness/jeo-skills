# spec-kit command reference

Upstream: <https://github.com/github/spec-kit>

## CLI (`specify`)

| Command | Purpose |
|---------|---------|
| `specify --version` | Print installed `specify-cli` version |
| `specify integration list` | List supported AI coding agents and their flags |
| `specify init <dir> --integration <agent>` | Bootstrap a new spec-kit project for an agent |
| `specify init . --integration <agent>` | Initialize spec-kit in the current directory |
| `specify init --here --force --integration <agent>` | Force re-init in-place |
| `specify extension search` | Search community extensions |
| `specify extension add <name>` | Install a community extension |
| `specify preset search` | Search community presets |
| `specify preset add <name>` | Install a community preset |

## Slash commands (run inside the chosen agent)

| Command | Purpose |
|---------|---------|
| `/speckit.constitution` | Project principles, non-negotiables, decision rules |
| `/speckit.specify` | Requirements, user stories, success criteria |
| `/speckit.clarify` | Targeted interview to resolve ambiguity in the spec |
| `/speckit.plan` | Technical implementation strategy honoring the constitution |
| `/speckit.tasks` | Actionable task breakdown derived from the plan |
| `/speckit.analyze` | Cross-check constitution ↔ spec ↔ plan consistency |
| `/speckit.checklist` | Review/quality checklists for gates |
| `/speckit.implement` | Execute the tasks against the codebase |

## Recommended order

1. `/speckit.constitution` — once, then revisit when principles change
2. `/speckit.specify` — describe the change in product language
3. `/speckit.clarify` — only if the spec has open questions
4. `/speckit.plan` — generate the technical strategy
5. `/speckit.analyze` — verify the plan honors the spec + constitution
6. `/speckit.tasks` — decompose into independently runnable tasks
7. `/speckit.checklist` — produce gate-ready review artifacts
8. `/speckit.implement` — execute, one task at a time

## Supported integrations (selected)

`specify integration list` is authoritative. Common values:

- `claude` — Claude Code
- `copilot` — GitHub Copilot
- `gemini` — Google Gemini CLI
- `codex` — OpenAI Codex CLI
- `cursor` — Cursor CLI
- `opencode` — opencode
- `qwen` — Qwen CLI
- `kiro` — Kiro CLI
- `tabnine`, `mistral`, `goose`, `forge`, `pi`, and 15+ others
