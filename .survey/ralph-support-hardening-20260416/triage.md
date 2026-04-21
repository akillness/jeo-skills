# Triage
- Problem: `ralph` is a high-visibility orchestration/spec-first skill that still lacks eval coverage and contains stale self-install/self-path examples that point at `ralph-ooo` instead of the live `ralph` skill directory.
- Audience: Claude Code, Codex CLI, Gemini CLI, and OpenCode users who rely on specification-first workflows and persistent completion loops.
- Why now: The latest graph refresh says `ralph` is the only remaining live skill without `evals/evals.json`, making it the highest-value bounded support gap left after the `remotion-video-production` PR merged.
