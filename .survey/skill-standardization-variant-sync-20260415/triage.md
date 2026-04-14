# Triage
- Problem: `skill-standardization` does not explicitly cover syncing token-optimized discovery variants like `SKILL.toon` / `SKILL.compact.md`, even though the repo runtime and docs use them.
- Audience: maintainers improving `.agent-skills`, plus agents that standardize skills and keep repo discovery surfaces in sync.
- Why now: recent skill modernizations increasingly ship `SKILL.toon`, so stale compact variants can silently drift from `SKILL.md` and mislead runtime discovery even when manifest/docs validation passes.
