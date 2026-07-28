# Session Lifecycle, Hooks, and the `/om-*` Command Table

## Five lifecycle hooks

| Hook | When | What |
|------|------|------|
| 🚀 SessionStart | On startup/resume | QMD re-index + self-heal, inject North Star focus, active work, recent changes, tasks, file listing, vault-hygiene drift flags — held under a byte budget, ending with an injection-size meter |
| 💬 UserPromptSubmit | Every message | Classifies content (decision, incident, win, 1:1, architecture, person, project update) and injects routing hints |
| ✍️ PostToolUse | After writing `.md` | Validates frontmatter + wikilinks, blocks misplaced memory files, flags oversized notes (split, don't trim) and write-time topic clusters |
| 💾 PreCompact | Before context compaction | Backs up session transcript to `thinking/session-logs/` |
| 🏁 Stop | End of session | Checklist + concrete drift findings (same hygiene scan as SessionStart) |

You just talk; the hooks handle the routing.

## Token efficiency: tiered loading

obsidian-mind does **not** dump the entire vault into context.

| Tier | What | When | Cost |
|------|------|------|------|
| Always | `CLAUDE.md` + SessionStart context (North Star excerpt, git summary, tasks, vault file listing) | Session start | Capped by the manifest budget; the meter reports the real size every session |
| On-demand | QMD semantic search results | When the agent needs specific context | Targeted |
| Triggered | Classification routing hints | Every message | ~100 tokens |
| Triggered | PostToolUse validation | After `.md` writes | ~200 tokens |
| Rare | Full file reads | Only when explicitly needed | Variable |

Five mechanisms keep the eager layer honest as the vault grows: source-aware
injection (resume/compact re-inject only volatile sections), an
injection-size meter on every injection, an injection budget that degrades
the cheapest-to-lose sections to pointers over the ceiling (and names every
one it dropped), a single hook spawn per write (QMD refresh rides the
validation hook), and listing collapse (a folder past a note-count threshold
folds to one count line). Both the budget and the threshold are tunable in
`vault-manifest.json`.

## Full `/om-*` command table

Defined in `.claude/commands/`. Run them in Claude Code, Codex CLI, or
Gemini CLI (Codex/Gemini: type the name without the `/` prefix, e.g.
`om-standup`).

| Command | What it does |
|---------|-------------|
| `/om-standup` | Morning kickoff — loads context, reviews yesterday, surfaces tasks, suggests priorities |
| `/om-dump` | Freeform capture — talk naturally about anything, routes it all to the right notes |
| `/om-wrap-up` | Full session review — verify notes, indexes, links, suggest improvements |
| `/om-humanize` | Voice-calibrated editing — makes Claude-drafted text sound like you wrote it |
| `/om-weekly` | Weekly synthesis — cross-session patterns, North Star alignment, uncaptured wins |
| `/om-capture-1on1` | Capture a 1:1 meeting transcript into a structured vault note |
| `/om-incident-capture` | Capture an incident from Slack/channels into structured notes |
| `/om-slack-scan` | Deep scan Slack channels/DMs for evidence |
| `/om-peer-scan` | Deep scan a peer's GitHub PRs for review prep |
| `/om-review-brief` | Generate a review brief (manager or peer version) |
| `/om-self-review` | Write your self-assessment for review season — projects, competencies, principles |
| `/om-review-peer` | Write a peer review — projects, principles, performance summary |
| `/om-tidy` | Self-maintenance — acts on every hygiene flag: archive, group, split. Never deletes, never commits |
| `/om-vault-audit` | Audit indexes, links, orphans, stale context |
| `/om-vault-upgrade` | Import content from an existing vault — version detection, classification, migration |
| `/om-prep-1on1` | Prep for an upcoming 1:1 — load person context, open items, suggested agenda |
| `/om-meeting` | Prep for any meeting by topic — subject-forward briefing with open items and considerations |
| `/om-intake` | Process meeting notes inbox — classify and route to the right vault notes |
| `/om-project-archive` | Move a completed project from `active/` to `archive/`, update indexes |

## Daily workflow (as the README describes it)

- **Morning**: `/om-standup` — loads North Star, active projects, open tasks,
  recent changes; returns a structured summary and suggested priorities.
- **Throughout the day**: talk naturally. Mention a decision, an incident, a
  1:1, a win — the classification hook nudges the agent to file each piece
  correctly. For bigger brain dumps, use `/om-dump` and narrate everything at
  once.
- **End of day**: say "wrap up" and the agent invokes `/om-wrap-up` —
  verifies notes, updates indexes, checks links, spots uncaptured wins.
- **Weekly**: `/om-weekly` for cross-session synthesis — North Star
  alignment, patterns, uncaptured wins, next-week priorities. `/om-vault-audit`
  to catch orphan notes, broken links, and stale content.
- **Review season**: `/om-review-brief manager` for a structured review-prep
  document with evidence already linked.
