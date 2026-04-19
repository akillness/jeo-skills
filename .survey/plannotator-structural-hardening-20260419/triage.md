# Triage
- Problem: Tighten `plannotator` into a routing-first visual approval gate that clearly separates pre-code plan review, post-code diff review, manual markdown/spec review, platform setup, and route-outs to neighboring skills.
- Audience: Agent operators using Claude Code, Gemini CLI, Codex CLI, OpenCode, and repo maintainers who need human review checkpoints around plans, diffs, or spec artifacts.
- Why now: Upstream `plannotator` has expanded diff review quickly, Codex hook capabilities changed, and user feedback shows recurring ambiguity around auto-intercept vs manual review, artifact approval semantics, and platform gaps.
