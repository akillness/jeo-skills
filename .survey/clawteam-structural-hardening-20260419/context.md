# Context: clawteam structural hardening

## Workflow Context
`clawteam` shows up when one agent is no longer enough and the user wants a leader/worker workflow with worktree isolation, tmux-backed monitoring, task dependencies, and message passing. In practice the jobs span the repo's required lanes: CLI/dev workflow automation, fullstack build splits, product/ops research and coordination swarms, marketing/content production teams, and game/business analysis groups. Upstream ClawTeam positions itself as "one command line → full automation" and documents both manual team control (`team spawn-team`, `spawn`, `task create/update`, `inbox send`, `board attach/serve`) and higher-level template launches (`launch hedge-fund`, profile/preset setup).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Agent maintainer | Keep the skill truthful, triggerable, and boundary-clean against adjacent orchestration skills | advanced |
| Developer/operator | Split implementation, tests, review, or research across multiple CLI agents | intermediate-advanced |
| Product / ops / marketing lead | Use swarm patterns for research, synthesis, reporting, and campaign/package coordination | intermediate |
| Game / simulation team lead | Coordinate milestone, build-analysis, and multi-role production swarms | intermediate-advanced |

## Current Workarounds
1. Read a long feature-tour style `SKILL.md` and manually infer which command path applies.
   - Limitation: users must decode whether they need manual team control, `launch`, tmux vs subprocess, or profile/preset setup.
2. Rely on upstream README or PyPI page instead of the local skill.
   - Limitation: the local skill stops being the trustworthy front door; activation quality drops.
3. Mix stale and current commands from multiple docs.
   - Limitation: current skill examples still emphasize `send`, `broadcast`, `task add/done/block`, `monitor`, and `template` flows while upstream docs now foreground `inbox send`, `task create/update/wait`, `board attach/serve`, `launch`, `profile`, and `preset` flows.
4. Treat `clawteam` as a generic multi-agent wrapper.
   - Limitation: that blurs boundaries with `jeo`, `omc`, `omx`, `ohmg`, `vibe-kanban`, and local delegation tools.

## Adjacent Problems
- Trigger overlap with other orchestration/platform skills if `clawteam` stays too broad.
- Support docs can silently drift even when `SKILL.md` still lint-passes.
- Discovery docs (README / README.ko / setup prompt / manifests) amplify any stale wording because `clawteam` is already visible on repo-wide surfaces.
- Real-world behavior includes long-running worker caveats and definition/config pitfalls; a skill that presents only the happy path becomes misleading.

## User Voices
> "Worker agents spawned with `spawn --task` containing explicit 'ONGOING JOB - NEVER mark completed' and 'Do NOT exit' instructions still terminate after completing their first turn." — GitHub issue #148, `HKUDS/ClawTeam` (https://github.com/HKUDS/ClawTeam/issues/148)

> "The agent definitions system ... can successfully parse agent configuration files but fails to apply most of the parsed configuration when spawning subagents." — GitHub issue #146, `HKUDS/ClawTeam` (https://github.com/HKUDS/ClawTeam/issues/146)

Sources:
- GitHub raw primary-source retrieval: https://raw.githubusercontent.com/HKUDS/ClawTeam/main/README.md
- GitHub API primary-source retrieval: https://api.github.com/repos/HKUDS/ClawTeam
- GitHub API primary-source retrieval (issues): https://api.github.com/repos/HKUDS/ClawTeam/issues/148 and https://api.github.com/repos/HKUDS/ClawTeam/issues/146
- PyPI primary-source retrieval: https://pypi.org/project/clawteam/
