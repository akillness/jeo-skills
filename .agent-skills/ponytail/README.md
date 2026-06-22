# 🐴 ponytail

> "He says nothing. He writes one line. It works."

The **laziest senior dev in the room** as an agent skill.  
Before writing anything, ponytail walks the YAGNI ladder and stops at the first rung that holds:


1. Does this need to exist?   → no: skip it           (YAGNI)
2. Stdlib does it?            → use the stdlib
3. Native platform feature?   → use the platform       (e.g. <input type="date">)
4. Already-installed dep?      → use what's installed
5. One line?                  → write one line
6. Only then                  → the minimum that works


Every shortcut taken gets a `ponytail:` comment naming its upgrade path so "later" never becomes "never."

---

## Demo

![ponytail in action](assets/ponytail-demo.gif)

*Terminal walkthrough: YAGNI ladder → before/after date-picker example → install commands*

---

## Install

### Quick (any runtime)

bash
npx skills add https://github.com/akillness/oh-my-skills --skill ponytail
# global, non-interactive:
npx skills add https://github.com/akillness/oh-my-skills --skill ponytail -g -y


Or run the bundled auto-detect helper:

bash
# prints the right install command; set APPLY=1 to actually run it
bash .agent-skills/ponytail/scripts/install.sh

# force a specific runtime and apply immediately
RUNTIME=claude APPLY=1 bash .agent-skills/ponytail/scripts/install.sh


---

### Per-runtime (upstream plugin)

Source: <https://github.com/DietrichGebert/ponytail> (MIT)

| Runtime | Install command |
|---------|-----------------|
| **Claude Code** | `claude plugin marketplace add DietrichGebert/ponytail` → then in-session: `/plugin install ponytail@ponytail` |
| **Codex** | `codex plugin marketplace add DietrichGebert/ponytail` → `/plugins` → select Ponytail → install; trust 2 hooks under `/hooks`; start a new thread |
| **Gemini CLI** | `gemini extensions install https://github.com/DietrichGebert/ponytail` |
| **Pi** | `pi install git:github.com/DietrichGebert/ponytail` |
| **OpenCode** | run from a checkout; add `{ "plugin": ["./.opencode/plugins/ponytail.mjs"] }` to `opencode.json` |

---

### Claude Desktop (MCP server)

Add ponytail's rules via the MCP server entry in `~/Library/Application Support/Claude/claude_desktop_config.json`:


{
  "mcpServers": {
    "ponytail": {
      "command": "npx",
      "args": [
        "-y",
        "skills",
        "serve",
        "https://github.com/akillness/oh-my-skills",
        "--skill",
        "ponytail"
      ]
    }
  }
}


Restart Claude Desktop after saving. The skill activates on triggers: `ponytail`, `write less code`, `YAGNI`, `anti-bloat`, `minimal code`.

---

### Instruction-only adapters (always-on, no commands needed)

Copy the matching rules file from the upstream repo into your project:

| Agent | Drop file here |
|-------|---------------|
| Cursor | `.cursor/rules/ponytail.md` |
| Windsurf | `.windsurf/rules/ponytail.md` |
| Cline | `.clinerules/ponytail.md` |
| GitHub Copilot | `.github/copilot-instructions.md` (or `~/.copilot/copilot-instructions.md` for global) |
| Kiro | `.kiro/steering/ponytail.md` (project) or `~/.kiro/steering/ponytail.md` (global) |
| Aider / Antigravity / Codex-VS Code | `AGENTS.md` (`~/.codex/AGENTS.md` for global Codex) |

Agent portability map: <https://github.com/DietrichGebert/ponytail/blob/main/docs/agent-portability.md>

---

## Commands

Available in skill-capable hosts (Claude Code, Codex, Gemini CLI, Pi, OpenCode).  
In Codex, prefix commands with `@` instead of `/`.

| Command | What it does |
|---------|-------------|
| `/ponytail [lite\|full\|ultra\|off]` | Set intensity, or report current level with no argument. Default on activation: **full**. Mode persists until changed. |
| `/ponytail-review` | Review the **current diff** for over-engineering → returns a delete-list grouped by confidence. |
| `/ponytail-audit` | Audit the **whole repo** (not just the diff) for the same patterns. |
| `/ponytail-debt` | Harvest all `ponytail:` markers in the tree into a tech-debt ledger. |
| `/ponytail-help` | Quick command reference. |

### Intensity levels

| Level | Behaviour |
|-------|-----------|
| `lite` | Apply the ladder, but bias toward the user's existing style; flag only the loudest bloat. |
| `full` | Default. Walk the ladder on every non-trivial unit of code. |
| `ultra` | Maximal laziness — aggressively collapse, inline, and delete. |
| `off` | Stand down until re-activated. |

---

## Never-cut list

Laziness is about effort, not correctness. These are **never** removed at any intensity:

- **Trust-boundary validation** — user input, network data, file reads are still validated.
- **Data-loss handling** — failures that can corrupt data are still handled.
- **Security** — authn/authz, secrets, injection defences stay.
- **Accessibility** — semantic, accessible output stays.

If cutting code would weaken one of these, that code is not bloat.

---

## The `ponytail:` marker

Every shortcut gets a one-line comment naming its upgrade path:

js
// ponytail: in-memory map — swap for Redis when this needs to survive a restart
const seen = new Map()


html
<!-- ponytail: browser has one -->
<input type="date">


Run `/ponytail-debt` to harvest all markers into a tech-debt ledger.

---

## References

- [`references/commands.md`](references/commands.md) — per-runtime command & install crosswalk
- [`scripts/install.sh`](scripts/install.sh) — auto-detect + apply installer
- [`evals/evals.json`](evals/evals.json) — canonical evals
- Upstream (MIT): <https://github.com/DietrichGebert/ponytail>
- Benchmarks (80–94% less code, 3–6× faster): <https://github.com/DietrichGebert/ponytail/tree/main/benchmarks>
- Related: [`../caveman/SKILL.md`](../caveman/SKILL.md) · [`../code-refactoring/SKILL.md`](../code-refactoring/SKILL.md) · [`../code-review/SKILL.md`](../code-review/SKILL.md)

---

## Changelog (latest 5)

See [`CHANGELOG.md`](CHANGELOG.md) for the full history.

### [1.2.0] — 2026-06-22
- Added `metadata` block to `SKILL.md` (category, tags, platforms, keyword, version, source, upstream)
- Expanded trigger list; added `ai-slop-cleaner` route-out to compatibility block

### [1.1.0] — 2025-07-10
- Added `README.md` with full per-runtime install crosswalk and MCP server setup
- Added demo GIF (`assets/ponytail-demo.gif`) — animated YAGNI ladder walkthrough
- Added `CHANGELOG.md`

### [1.0.1] — 2025-06-18
- Fixed `install.sh` early-exit on macOS when optional CLIs are absent
- Tightened SKILL.md trigger phrasing per skill-standardization validator
- Added third eval: route-out to `caveman` for communication-brevity requests

### [1.0.0] — 2025-05-30
- Initial release: SKILL.md, `references/commands.md`, `scripts/install.sh`, `evals/evals.json`
- Four intensity levels (lite / full / ultra / off), YAGNI ladder, `ponytail:` marker convention

### [0.2.0] — 2025-04-14
- Added `SKILL.toon` compact rendering for token-limited runtimes
- Route-outs to `caveman` and `code-refactoring` made explicit in SKILL.md

---


<sub>Upstream: <a href="https://github.com/DietrichGebert/ponytail">DietrichGebert/ponytail</a> (MIT) · Catalog: <a href="https://github.com/akillness/oh-my-skills">akillness/oh-my-skills</a> · "Done. He'd be proud. He won't say it."</sub>
