# Triage
- Problem: The existing `omc` skill is a dense, partly stale operator manual that mixes plugin install, CLI runtime, slash-skill usage, and adjacent orchestration ownership instead of acting as a smaller routing-first front door.
- Audience: Maintainers and users of `oh-my-skills` who need Claude Code–native orchestration guidance and reliable boundaries with `jeo`, `ralph`, `omx`, `ohmg`, `plannotator`, `agent-browser`, and `ralphmode`.
- Why now: The repo graph still flags `omc` as an oversized front door, upstream OMC docs and commands have drifted, and recurring operator pain clusters around setup duplication, plugin-vs-CLI confusion, state/worktree collisions, and brittle persistent-mode behavior.
