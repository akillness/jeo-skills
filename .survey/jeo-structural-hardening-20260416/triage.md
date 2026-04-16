# Triage
- Problem: `jeo` is the top-level orchestration entrypoint, but its `SKILL.md` has grown into a mixed router + setup manual + state schema + troubleshooting catalog and now exceeds the recommended 500-line limit.
- Audience: operators using `jeo` from Claude Code, Codex CLI, Gemini CLI, and OpenCode; maintainers of `oh-my-skills` discovery/docs surfaces.
- Why now: `validate_skill.sh --all .agent-skills` currently warns on `jeo`, and because `jeo` is referenced from README, README.ko, setup prompts, and `skills.toon`, boundary drift in this file has outsized impact on activation and maintenance.
