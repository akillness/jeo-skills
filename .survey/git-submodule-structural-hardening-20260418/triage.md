# Triage
- Problem: `git-submodule` still solves the right repo-boundary problem, but its 293-line front door is denser than it needs to be and mixes routing, command packets, and hosted-platform gotchas.
- Audience: agents and maintainers working on repos that use Git submodules, especially contributors handling clone/bootstrap, pointer updates, detached-HEAD recovery, or private-submodule CI/auth setup.
- Why now: support coverage is already complete across the live skill catalog, the graph report still flags `git-submodule` as an oversized front-door candidate, and the next bounded win is tightening an existing high-utility skill instead of adding another Git wrapper.
