# Platform Map: clawteam structural hardening

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Runtime backend | `clawteam spawn tmux claude ...` or `--profile <name>` | `clawteam spawn tmux codex ...` | not a first-class upstream example in the current README; likely via custom CLI/profile | `settings.runtime_command` |
| Provider/model overrides | `profile` + `preset generate-profile ... claude` | can use direct `codex` spawn or a configured profile | profile-style route more realistic than inline ad hoc env vars | `settings.profile_or_preset` |
| Workspace mode | git worktree by default, `--no-workspace` when needed | same | same | `settings.workspace_isolation` |
| Transport/data dir | config/env (`CLAWTEAM_TRANSPORT`, `CLAWTEAM_DATA_DIR`) | same | same | `settings.transport_and_state` |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| When to use ClawTeam vs native repo orchestration | Prefer `clawteam` when the user explicitly wants ClawTeam's team/task/inbox/worktree system, not just parallel Claude workers | Same boundary: use `clawteam` only when the ClawTeam operator surface matters | Same | `rules.boundary_to_adjacent_skills` |
| Long-running worker safety | Avoid overselling persistent daemon/keepalive behavior because upstream issue #148 shows failure modes | Same | Same | `rules.long_running_worker_caveat` |
| Config-definition trust | Do not assume agent-definition/config files apply fully without verification because upstream issue #146 documents gaps | Same | Same | `rules.verify_config_application` |
| Board vs orchestration vs planning | Route board-only asks to `vibe-kanban`; route integrated plan/runtime loops to `jeo` / `omc` / `omx` / `ohmg` | Same | Same | `rules.route_outs` |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Bootstrap | verify `tmux`, agent CLI, and profile/doctor state | verify `codex` works standalone before wrapping in ClawTeam | verify target CLI/profile before spawning | `hooks.preflight_check` |
| Spawn | choose `tmux` or `subprocess`, then `team spawn-team` / `spawn` or `launch` | same | same | `hooks.spawn_path_selection` |
| Monitor | `board attach`, `board show/live/serve`, inbox/task inspection | same | same | `hooks.monitor_and_report` |
| Recovery | inspect task/inbox/runtime state, then downgrade claims if worker keepalive or config behavior is unreliable | same | same | `hooks.failure_recovery` |

## Platform Gaps
- Current upstream docs are strongest for Claude/Codex/any-CLI agent flows; Gemini-specific examples are not yet equally explicit, so the local skill should not invent parity details.
- The common abstraction is solid for runtime settings, route-out rules, and lifecycle hooks, but plan approval / review / board governance still belongs to neighboring repo skills instead of ClawTeam itself.
