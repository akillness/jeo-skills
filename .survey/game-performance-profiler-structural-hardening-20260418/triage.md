# Triage
- Problem: `game-performance-profiler` is still a dense 296-line front door after its modernization pass; the repo now has full support coverage, so the next bounded win is structural hardening rather than adding another game-performance wrapper.
- Audience: Agents and maintainers handling Unity/Unreal runtime performance triage, benchmark-route design, and packaged-on-device review packets for game teams.
- Why now: `graphify-out/GRAPH_REPORT.md` still lists `game-performance-profiler` on the oversized front-door watchlist, the game-development cluster is supposed to prefer narrower deterministic specialist skills over catalog expansion, and there is currently no open `.agent-skills` PR after PR #104 merged.
