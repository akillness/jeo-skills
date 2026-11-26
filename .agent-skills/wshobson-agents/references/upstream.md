# Upstream Provenance: `wshobson/agents`

- **Repository**: <https://github.com/wshobson/agents>
- **Pinned Commit**: `c96b5f6552dba32e4492307493ee613581430715` (`2026-11-24`)
- **License**: `MIT`
- **Marketplace Name**: `claude-code-workflows` (`.claude-plugin/marketplace.json`)

## Scale & Structure

- 73 focused plugins (`plugins/`) across 24 categories
- 112 specialized agents, 16 multi-agent orchestrators, 146 agent skills, 79 dev tools
- `tools/adapters` + `Makefile`: cross-platform build/export targets for OpenCode, Codex, Cursor, and Gemini CLI
- `tools/plugin-eval`: upstream plugin evaluation harness

## Selection Discipline

- **Never bulk-install all 73 plugins**: install only 2-5 task-relevant plugins per project (`/plugin marketplace add wshobson/agents`, `/plugin install <plugin>@claude-code-workflows`).
- Inspect `plugins/<plugin>/` hooks, agents, and model tier hints (`opus`/`sonnet`/`haiku`) before enabling in sensitive repos.

## Cross-Routing

- Founder/CEO/QA browser sprints -> `gstack`
- Socratic TDD subagent workflow -> `superpowers`
- Game-studio team personas -> `donchitos-game-studios`
- Security & skill-impact scans -> `nvidia-skill-evaluator`
