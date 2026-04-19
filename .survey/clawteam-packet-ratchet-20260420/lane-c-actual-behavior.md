# What People Actually Use

Across ClawTeam-style tooling, the recurring real workflow is **not** “fully autonomous swarm” so much as **a human/operator or one leader agent driving multiple terminal sessions** backed by **tmux + git worktrees + simple mail/status files**.

- **Tmux + worktrees is the common substrate.**
  - ClawTeam’s own README centers the leader spawning workers into **their own git worktree, tmux window, and identity**, then watching with `board attach` / `board serve`. This is the core mental model the project teaches, not a hidden implementation detail.  
    Source: https://github.com/HKUDS/ClawTeam
  - `claude-swarm` is even more explicit: it is a shell script that launches an **admin + workers in tmux**, each with its own **git worktree**, plus a **monitor window** and shared `/tmp` coordination directory.  
    Source: https://github.com/sethshoultes/claude-swarm
  - `wt` presents a lighter-weight pattern: one tmux window per worktree, with commands like `o new`, `o peek`, `o list`, `o rm`, plus optional split panes for dev servers.  
    Source: https://github.com/NazmievBulat/wt
  - `Goblin Forge` packages the same primitives into a fuller CLI/TUI, but still defines the system in terms of **tmux session isolation** and **git worktree isolation**.  
    Source: https://github.com/astoreyai/goblin-forge
  - `Legio` is the most “platformized” of the set, but its README still describes parallel agents as **tmux sessions + isolated git worktrees**, just with typed SQLite mail and a dashboard on top.  
    Source: https://github.com/katyella/legio

- **Humans still manually inspect, attach, and merge.**
  - `claude-swarm` tells users to `tmux attach -t claude-swarm`, watch agents, navigate windows manually, tile panes, and then kill the session / prune worktrees / clean `/tmp` state by hand when done.  
    Source: https://github.com/sethshoultes/claude-swarm
  - `wt` exposes manual operator verbs (`peek`, `focus`, `dashboard`, `reopen`, `dev`, `rm`) rather than pretending the system is fully self-managing.  
    Source: https://github.com/NazmievBulat/wt
  - ClawTeam’s docs also bias toward explicit operator commands (`team spawn-team`, `spawn`, `task create/update`, `inbox send/receive`, `board attach/show/live/serve`) rather than a single stable “do the whole thing” flow.  
    Source: https://github.com/HKUDS/ClawTeam

- **Persistent coordination is still mostly polling or ad-hoc protocols.**
  - `claude-swarm` coordinates through `tmux send-keys`, `tmux capture-pane`, status/result files in `/tmp/claude-shared`, and a monitor loop.  
    Source: https://github.com/sethshoultes/claude-swarm
  - ClawTeam users explicitly report that Codex workers finish their initial `--task` and stop unless a loop protocol is manually injected.  
    Source: https://github.com/HKUDS/ClawTeam/issues/99
  - Even Legio has an open issue asking for **push-based completion announce** because current parent awareness depends too much on poll intervals (`mail check`).  
    Source: https://github.com/katyella/legio/issues/8

# Common Workarounds

- **Manual loop protocols to keep workers alive.**
  - In ClawTeam, users report Codex workers do not auto-poll inboxes after the first task; the stated workaround is to **manually inject a loop protocol into the task text**.  
    Source: https://github.com/HKUDS/ClawTeam/issues/99
  - A newer ClawTeam issue shows operators writing tasks like **“ONGOING JOB - NEVER mark completed”** and embedding `while true; do ... sleep 60; done` to keep subprocess workers useful, because the orchestration layer itself does not provide a reliable long-running worker contract.  
    Source: https://github.com/HKUDS/ClawTeam/issues/148

- **Fallback to raw tmux scripting.**
  - `claude-swarm` documents low-level tmux mechanics as first-class operational knowledge: `send-keys` message and `Enter` must be sent as **two separate commands**, `capture-pane` is used for observation, and operators can hand-build tiled views with `join-pane`.  
    Source: https://github.com/sethshoultes/claude-swarm
  - ClawTeam users patched tmux backend behavior manually to handle Claude’s permissions TUI by sending the actual **Down-arrow escape sequence** and `Enter`, then sleeping before prompt injection.  
    Source: https://github.com/HKUDS/ClawTeam/issues/77

- **Manual trust/permissions handling in fresh worktrees.**
  - `claude-swarm` says trust prompts may block worker startup and the script **cannot auto-accept this**; the workaround is to attach and press Enter yourself or pre-trust the worktree path.  
    Source: https://github.com/sethshoultes/claude-swarm
  - ClawTeam has matching bug reports around workspace trust timing and permissions confirmation races in tmux sessions.  
    Sources: https://github.com/HKUDS/ClawTeam/issues/70, https://github.com/HKUDS/ClawTeam/issues/77

- **Script-level monitors and restart loops.**
  - `claude-swarm` includes an “Advanced: Self-Healing Monitor” example that just loops forever, checks tmux panes, and restarts dead agents manually via tmux commands. This is a strong signal that operators still trust **simple shell watchdogs** over framework guarantees.  
    Source: https://github.com/sethshoultes/claude-swarm
  - ClawTeam users also route through `runtime watch --exec` and shell scripts, but one bug showed `inbox send` could lose content from subprocess/script contexts; the workaround was to bypass the normal command path (`python -m ...`) until fixed.  
    Source: https://github.com/HKUDS/ClawTeam/issues/130

- **Manual config/file edits when abstractions are missing.**
  - In one ClawTeam orchestration report, the team add flow was cumbersome enough that users **manually edited `config.json`** to add agents.  
    Source: https://github.com/HKUDS/ClawTeam/issues/98
  - `wt` asks users to edit a personal YAML config and even notes that `o new` hardcodes `pnpm install --frozen-lockfile` unless they patch the script. That is a polished helper, but still fundamentally a **local script you adapt by hand**.  
    Source: https://github.com/NazmievBulat/wt

# Pain Points With Current Solutions

- **The “autonomous swarm” layer is thinner than the marketing layer.**
  - ClawTeam issue #83 directly claims `launch hedge-fund` was effectively a **UI-only / empty-demo path** in that reported environment: no workspaces, no tmux sessions, no actual multi-agent execution. Even if some of this is fixed later, it is useful evidence that users immediately test whether the abstraction really creates workers and state, and lose trust fast when it does not.  
    Source: https://github.com/HKUDS/ClawTeam/issues/83

- **Worker lifecycle remains the hardest unsolved problem.**
  - ClawTeam issues #99, #107, and #148 all point to the same behavioral gap: workers often complete one turn and stop, while real operator expectations are “stay alive, keep watching, keep reporting, wait for the next command.”  
    Sources: https://github.com/HKUDS/ClawTeam/issues/99, https://github.com/HKUDS/ClawTeam/issues/107, https://github.com/HKUDS/ClawTeam/issues/148
  - Legio issue #8 shows that even more structured systems still struggle with completion/event delivery and fall back to polling.  
    Source: https://github.com/katyella/legio/issues/8

- **Interactive CLI realities keep leaking through the abstraction.**
  - Trust prompts, dangerous-permissions confirmations, shell PATH differences, memory spikes, and “wait until the prompt is ready” logic all show up as user-facing operational burdens.  
    Sources: https://github.com/sethshoultes/claude-swarm, https://github.com/HKUDS/ClawTeam/issues/70, https://github.com/HKUDS/ClawTeam/issues/77
  - `claude-swarm` explicitly documents RAM budgeting, staggered launches, PATH fixes inside tmux, and launch delays. This is evidence that operators still think in terms of **terminal/process management**, not only agent intent.  
    Source: https://github.com/sethshoultes/claude-swarm

- **Operators still need low-level command knowledge.**
  - ClawTeam issue #98 reports confusion over positional `spawn` syntax, missing `board update`, blocking join flows, no direct add-member command, and task flag inconsistencies. These are exactly the kinds of rough edges that push users back toward simpler shell-script mental models.  
    Source: https://github.com/HKUDS/ClawTeam/issues/98
  - ClawTeam issue #108 shows `board attach` UX confusion: users got stuck in the attached view and could only send messages from the bottom pane, then had to ask how to switch sessions. This suggests tmux-native interaction is still the real substrate, whether or not the product wraps it.  
    Source: https://github.com/HKUDS/ClawTeam/issues/108

- **Subprocess mode often trades away the abstractions people actually want.**
  - ClawTeam issue #52 notes that subprocess `claude -p` cannot use installed Claude Code skills, and even introduced encoding problems. In practice, this means the “headless” backend can undermine one of the strongest reasons users chose a CLI agent in the first place.  
    Source: https://github.com/HKUDS/ClawTeam/issues/52
  - Issue #146 further shows config/agent-definition features being parsed but not actually applied, reinforcing that users cannot assume higher-level declarations are honored at runtime.  
    Source: https://github.com/HKUDS/ClawTeam/issues/146

- **Recovery/cleanup still often needs manual git hygiene.**
  - ClawTeam issue #95 describes respawn failing because the worktree directory was deleted but the branch still existed; this is classic “the wrapper lost sync with git state” pain and exactly why operators keep knowing raw git worktree cleanup commands.  
    Source: https://github.com/HKUDS/ClawTeam/issues/95

# Sources

## Direct-source evidence used
- ClawTeam README: https://github.com/HKUDS/ClawTeam
- ClawTeam issue #83 (`launch` not working): https://github.com/HKUDS/ClawTeam/issues/83
- ClawTeam issue #98 (multi-agent orchestration usability issues): https://github.com/HKUDS/ClawTeam/issues/98
- ClawTeam issue #99 (Codex worker stops after initial task): https://github.com/HKUDS/ClawTeam/issues/99
- ClawTeam issue #107 (no automatic polling status): https://github.com/HKUDS/ClawTeam/issues/107
- ClawTeam issue #108 (`board attach` interaction confusion): https://github.com/HKUDS/ClawTeam/issues/108
- ClawTeam issue #130 (`inbox send` from subprocess/script context): https://github.com/HKUDS/ClawTeam/issues/130
- ClawTeam issue #148 (workers exit after first turn): https://github.com/HKUDS/ClawTeam/issues/148
- ClawTeam issue #146 (agent definitions parsed but not applied): https://github.com/HKUDS/ClawTeam/issues/146
- ClawTeam issue #77 (tmux permissions TUI confirmation race): https://github.com/HKUDS/ClawTeam/issues/77
- ClawTeam issue #70 (workspace trust prompt timeout): https://github.com/HKUDS/ClawTeam/issues/70
- ClawTeam issue #52 (subprocess mode cannot use Claude Code skills): https://github.com/HKUDS/ClawTeam/issues/52
- ClawTeam issue #95 (branch already exists during spawn recovery): https://github.com/HKUDS/ClawTeam/issues/95
- `claude-swarm` README: https://github.com/sethshoultes/claude-swarm
- `wt` README: https://github.com/NazmievBulat/wt
- `Legio` README: https://github.com/katyella/legio
- Legio issue #8 (push-based completion announce): https://github.com/katyella/legio/issues/8
- `Goblin Forge` README: https://github.com/astoreyai/goblin-forge

## Evidence quality note
This lane relied mainly on **direct-source GitHub READMEs and issue bodies** because web/social search was unavailable in this environment. No social/forum claims are included unless reflected in those repository sources.