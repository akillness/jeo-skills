---
name: wshobson-agents
description: >
  Operate wshobson/agents, a modular plugin marketplace organizing 73 focused plugins, 112 specialized agents, 16 orchestrators, 146 skills, and 79 tools across 24 engineering categories with cross-platform adapters for OpenCode, Codex, Cursor, and Gemini CLI. Use when browsing wshobson/agents plugins, installing selective domain plugins via /plugin, exporting adapters via Makefile, or running plugin-eval. Do not use for bulk installing all 73 plugins or for role-based browser QA sprints (route to gstack). Triggers on: wshobson/agents, wshobson-agents, claude-code-workflows marketplace, wshobson plugins.
allowed-tools: Read Glob Grep Bash
compatibility: Claude Code plugin marketplace plus Make/Python/Node adapters for OpenCode, Codex, Cursor, and Gemini CLI. Preflight runs offline in Python 3.10+.
license: MIT
metadata:
  version: "1.0.0"
  source: https://github.com/wshobson/agents
  upstream_commit: c96b5f6552dba32e4492307493ee613581430715
  pinned_at: "2026-11-24"
---

# wshobson/agents (`wshobson-agents`)

Source-pinned operator guide for `wshobson/agents` (`MIT`), a large modular multi-agent plugin marketplace (`claude-code-workflows`) designed around **selective, domain-scoped plugin activation**.

## When to use this skill

- Adding the `wshobson/agents` marketplace (`/plugin marketplace add wshobson/agents`) and choosing 2-5 task-relevant domain plugins (`python-development`, `kubernetes-operations`, `security-scanning`, `backend-development`, etc.).
- Exporting `wshobson/agents` plugins into OpenCode, Codex, Cursor, or Gemini CLI formats using upstream `Makefile` and `tools/adapters`.
- Evaluating plugin quality/trigger efficiency with upstream `tools/plugin-eval` or reviewing its 3-tier progressive disclosure pattern (metadata -> `SKILL.md` -> references).
- Routing out: use `gstack` for founder/CEO/design/QA browser sprints, `superpowers` for Socratic TDD workflows, `donchitos-game-studios` for game studio agent rosters, and `nvidia-skill-evaluator` for security/impact scans.

## Instructions

1. **Run offline preflight first**:
   ```bash
   python3 scripts/preflight.py --json
   ```

2. **Install selectively — NEVER bulk-install all 73 plugins**:
   - Register marketplace:
     `/plugin marketplace add wshobson/agents`
   - Install **only** the 2-5 plugins matching the active repository stack (for example: `/plugin install python-development@claude-code-workflows`, `/plugin install security-scanning@claude-code-workflows`, `/plugin install kubernetes-operations@claude-code-workflows`).
   - Bulk-enabling dozens of plugins balloons context budgets, triggers conflicting hooks, and degrades tool selection accuracy.

3. **Export cross-platform adapters via `Makefile` when targeting non-Claude hosts**:
   - Inspect `Makefile` targets and `tools/adapters` before generating OpenCode, Codex, Cursor, or Gemini outputs (`make help` / `make ...`).
   - Read `docs/harnesses.md` and `docs/plugins.md` in upstream before modifying adapter templates.

4. **Audit model tier hints and plugin hooks before enabling**:
   - Plugins encode model tier assignments (`opus`, `sonnet`, `haiku` / `inherit`) and optional tool/hook permissions in `.claude-plugin/marketplace.json` and `plugins/<name>/`.
   - Review hooks and shell permissions inside each selected plugin before running against production repositories.

## Examples

- **Python microservice stack**:
  Run `/plugin marketplace add wshobson/agents` -> install `python-development@claude-code-workflows` + `backend-development@claude-code-workflows` + `security-scanning@claude-code-workflows` (only 3 plugins instead of all 73).
- **Cross-host export**:
  Inspect `Makefile` in a clean clone of `wshobson/agents` and run the specific adapter build target for Codex or OpenCode into a staging directory before copying.

## Best practices

- Keep active plugins per workspace strictly minimal (2-5 plugins max) to preserve token budget and clean routing.
- Prefer local `jeo-skills` core skills when a matching standalone skill already exists, and pull `wshobson/agents` plugins only for missing domain orchestrators.
- Re-evaluate installed plugins whenever switching project stacks so stale domain hooks do not linger.

## References

- Pinned upstream architecture, plugin categories, and adapter notes: [references/upstream.md](references/upstream.md)
- Pinned source provenance and file digests: [references/source.json](references/source.json)
- Offline manifest preflight helper: [scripts/preflight.py](scripts/preflight.py)
- Eval suite: [evals/evals.json](evals/evals.json)
