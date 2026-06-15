# Ponytail — per-runtime command & install crosswalk

Ponytail is one ruleset (the YAGNI ladder + never-cut safety list) plus a small
command surface. Skill-capable hosts get the `/ponytail*` commands; instruction-
only adapters load the always-on ruleset without commands.

## Commands

| Command | What it does | Needs |
|---|---|---|
| `/ponytail [lite\|full\|ultra\|off]` | Set intensity, or report level with no arg | skill host |
| `/ponytail-review` | Review the current diff → delete-list | skill host |
| `/ponytail-audit` | Audit the whole repo, not just the diff | skill host |
| `/ponytail-debt` | Harvest `ponytail:` markers into a tech-debt ledger | skill host |
| `/ponytail-help` | Quick command reference | skill host |

In Codex the commands are skills — invoke with `@` (`@ponytail-review`).

## Install (this catalog)

Plugin-installable from the oh-my-skills catalog:

```bash
npx skills add https://github.com/akillness/oh-my-skills --skill ponytail
# global, non-interactive:
npx skills add https://github.com/akillness/oh-my-skills --skill ponytail -g -y
```

Or run the bundled helper, which wires the upstream marketplace plugin for the
detected runtime:

```bash
bash scripts/install.sh
```

## Install (upstream, by runtime)

Source: https://github.com/DietrichGebert/ponytail (MIT).

| Runtime | Install |
|---|---|
| **Claude Code** | `/plugin marketplace add DietrichGebert/ponytail` then `/plugin install ponytail@ponytail` |
| **Codex** | `codex plugin marketplace add DietrichGebert/ponytail`, then `/plugins` → select Ponytail → install; review/trust its two lifecycle hooks under `/hooks`, start a new thread |
| **Pi** | `pi install git:github.com/DietrichGebert/ponytail` |
| **OpenCode** | run from a checkout; add `{ "plugin": ["./.opencode/plugins/ponytail.mjs"] }` to `opencode.json` (also auto-loads `AGENTS.md`) |
| **Gemini CLI** | `gemini extensions install https://github.com/DietrichGebert/ponytail` |

### Instruction-only adapters (always-on ruleset, no commands)

Copy the matching rules file from the upstream repo:

| Agent | File |
|---|---|
| Cursor | `.cursor/rules/` |
| Windsurf | `.windsurf/rules/` |
| Cline | `.clinerules/` |
| GitHub Copilot | `.github/copilot-instructions.md` (or `~/.copilot/copilot-instructions.md` for global) |
| Kiro | `.kiro/steering/ponytail.md` → `~/.kiro/steering/` (global) or project `.kiro/steering/` |
| Aider / Antigravity / Codex-VS Code | `AGENTS.md` (`~/.codex/AGENTS.md` makes Codex global) |

Agent portability map: https://github.com/DietrichGebert/ponytail/blob/main/docs/agent-portability.md

## The ladder (reference)

```
1. Does this need to exist?   → no: skip it           (YAGNI)
2. Stdlib does it?            → use the stdlib
3. Native platform feature?   → use the platform
4. Already-installed dep?      → use what's installed
5. One line?                  → write one line
6. Only then                  → the minimum that works
```

Never cut for line count: trust-boundary validation, data-loss handling,
security, accessibility.
