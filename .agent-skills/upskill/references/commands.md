# upskill — Command Reference

All commands are Claude Code slash commands installed to `~/.claude/skills/upskill-*/SKILL.md`
by the installer. Backend logic lives in `~/.claude/hooks/*.sh`.

| Command | Function | Backend |
|---------|----------|---------|
| `/upskill-init` | Update UpSkill to latest; re-runs installer, migrates legacy config | `install.sh` (self-invoked) |
| `/upskill-configure` | Enable hooks (`claudeMd`, `SessionStart`, `SessionEnd`, `UserPromptSubmit`) in the current project | `configure-project.sh` |
| `/upskill-build [--category <c>] [--session <id>]` | Analyze a session (failure or success) and generate + Ralph-validate a skill | `upskill-build.sh` |
| `/upskill-run` | Interactive workflow: collect task → scan/match skills → display (★ = recommended) → select → optional model-switch prompt → load + execute | reads `upskill-store.sh list` + `skill_match.txt` |
| `/upskill-list [category]` | List installed skills, grouped by category | `upskill-store.sh list` |
| `/upskill-status` | View total skill count and active build status | `upskill-store.sh status` |
| `/upskill-mode [interactive\|auto]` | View or switch serve mode; rebuilds the global index on switch | edits `upskill.conf`, then `upskill-store.sh sync` |
| `/upskill-model [teacher\|student]` | View or switch Teacher/Student model presets | edits `upskill.conf` |
| `/upskill-remove [--category <c>] [--skill-id <id>]` | Delete one skill or an entire category (confirmation required for a category) | `upskill-store.sh remove` |
| `/upskill-uninstall` | Remove hooks, skills, and config entirely | `install.sh --uninstall` |

## `/upskill-build` — detail

Works on **both** failed and successful sessions; keeps the last 10 sessions
available. Flow:

1. Save the current session if one is active (so it appears in the list without exiting).
2. List recent sessions (skips UpSkill's own self-command sessions).
3. User picks a session (or accepts the most recent).
4. Read `metadata.txt` + `session.log`; generate a 2–3 sentence AI summary of
   what happened, the approach taken, and whether it passed.
5. Extract candidate tasks from `[USER]` messages in the log (filters out
   short confirmations, slash commands, JSON wrapper text); let the user pick
   which task to build if the session had more than one.
6. Run `bash ~/.claude/hooks/upskill-build.sh "<task-prompt>" "<session.log>" "<category>"`
   — this is the 5-phase pipeline described in
   [pipeline-and-ralph-loop.md](pipeline-and-ralph-loop.md).
7. Clear the pending-build flag.
8. Report PASS (stored + will be suggested for similar tasks) or FAIL
   (discarded after 3 rounds).

## `/upskill-run` — detail

Only meaningful in `interactive` serve mode (in `auto` mode, matching happens
automatically on every prompt instead).

1. Collect the task description (from the command args or by asking).
2. Run `bash ~/.claude/hooks/upskill-store.sh list` in parallel with reading
   `~/.claude/upskill-store/.building/skill_match.txt` (written by the
   `UserPromptSubmit` hook). If no match file exists yet, do keyword matching
   manually against each skill's description/trigger keywords.
3. Present a numbered list; ★ marks keyword matches, `✓`/`✗` shows whether
   the skill's `base_model` matches the model currently in use.
4. User selects (comma-separated numbers, or `none`).
5. For any selected skill validated on a **different** model, ask the user to
   confirm a switch — **never invoke `/model` programmatically**, it is a TUI
   command only the human can run; pause and wait for them to reply "done".
6. Read the selected `SKILL.md` (or, for the legacy format,
   `CLAUDE.md` + `.claude/skills/solve-task/SKILL.md`) and execute the
   original task with that guidance applied.

## `upskill-store.sh` CLI (backend for list/status/remove/sync)

```bash
upskill-store.sh list   [--store <s>] [--category <c>]
upskill-store.sh search <query> [--store <s>]
upskill-store.sh status [--store <s>]
upskill-store.sh add    --category <c> --skill-id <id> --prompt <p> --store <s> --skill-dir <d>
upskill-store.sh remove --category <c> --skill-id <id> [--store <s>]
upskill-store.sh sync   [--store <s>]
```

`sync` regenerates the global `~/.claude/upskill-store/CLAUDE.md` index —
run it any time `upskill.conf` changes (serve mode, models) outside a slash
command, since the slash commands already call it for you.

## Configuration file — `~/.claude/upskill.conf`

```bash
UPSKILL_TEACHER="deepseek-v4-pro[1m]"   # Strong model: analyzes failures, generates skills
UPSKILL_STUDENT="deepseek-v4-flash"     # Weak model: every skill is validated against it
UPSKILL_SERVE_MODE="interactive"        # interactive (default) | auto
```

The Daily model (whatever the user runs day to day) lives in Claude Code's
own `settings.json` and is completely independent — switching it never
affects Teacher/Student config, and vice versa.
