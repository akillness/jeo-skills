# Lane D — Platform map / alternatives

For this run, the useful abstraction is not vendor-vs-vendor model settings; it is `settings / rules / hooks` across the ClawTeam runtime and nearby repo-local route-outs.

- `settings`: backend choice (tmux vs subprocess), provider/profile setup, worktree isolation, and board visibility surface.
- `rules`: use `clawteam` only for explicit ClawTeam runtime requests; route generic orchestration to `jeo` / `omc` / `omx` / `ohmg`, board governance to `vibe-kanban`, and lightweight fan-out to built-in delegation.
- `hooks`: verify prerequisites before spawn, inspect board/task/inbox/workspace state during execution, and keep recovery/cleanup explicit after failures or completion.

Primary sources:
- `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/clawteam/SKILL.md`
- `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/jeo/SKILL.md`
- `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/omc/SKILL.md`
- `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/omx/SKILL.md`
- `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/ohmg/SKILL.md`
- `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/vibe-kanban/SKILL.md`
- <https://github.com/HKUDS/ClawTeam/blob/main/README.md>
- <https://github.com/HKUDS/ClawTeam/issues/146>
- <https://github.com/HKUDS/ClawTeam/issues/148>
