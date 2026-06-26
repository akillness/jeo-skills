# obsidian-second-brain — 45 commands

45 commands across 4 layers. The 4 Google Calendar commands (in Operations) are
**Claude Code only**, so the Codex / Gemini / OpenCode builds ship **40**.


LAYER 1: Operations (28)      Claude remembers everything
LAYER 2: Thinking Tools (7)   Claude thinks with you
LAYER 3: Context Engine (1)   Claude knows who you are
LAYER 4: Research Toolkit (7) Claude pulls knowledge in
ALWAYS ON                     background agent + 4 scheduled agents + save reminders


## Layer 1 — Operations (Claude remembers)

| Command | What it does |
|---|---|
| `/obsidian-save` | Saves everything from the conversation — decisions, tasks, people, ideas — each to the right note |
| `/obsidian-ingest` | Drop a URL, PDF, audio file, or screenshot. The vault REWRITES itself. 5–15 pages touched per source. |
| `/obsidian-synthesize` | Auto-finds patterns across sources and writes synthesis pages |
| `/obsidian-reconcile` | Finds contradictions and resolves them — the vault maintains its own truth |
| `/obsidian-export` | Clean JSON/markdown snapshot any AI tool can read |
| `/obsidian-daily` | Creates or updates today's daily note |
| `/obsidian-agenda` | *(Claude Code)* Reads Google Calendar → AI-first snapshot (conflicts, focus blocks, attendee links) |
| `/obsidian-schedule` | *(Claude Code)* Creates/moves a Google Calendar event from a task, links it back |
| `/obsidian-meeting` | *(Claude Code)* Generates a meeting note from a calendar event (attendees, time, link pre-filled) |
| `/obsidian-calendar` | *(Claude Code)* Reconciles vault against the calendar — flags unscheduled commitments (flag only) |
| `/obsidian-recurring` | Tracks a recurring obligation with a cadence and a computed next-due date |
| `/obsidian-log` | Logs a work session, links it everywhere |
| `/obsidian-task` | Adds a task to the right board with priority and due date |
| `/obsidian-person` | Creates or updates a person note |
| `/obsidian-decide` | Logs decisions to the right project note |
| `/obsidian-capture` | Zero-friction idea capture |
| `/obsidian-catchup` | Processes captures dumped from the Telegram bot (voice/text/image/PDF/link) into the vault |
| `/obsidian-find` | Smart search with context |
| `/obsidian-recap` | Summary of a day, week, or month |
| `/obsidian-review` | Structured weekly or monthly review |
| `/obsidian-board` | Kanban board view and updates |
| `/obsidian-project` | Project note with board and daily links |
| `/obsidian-projects` | Live project status from git + local docs — infers context from vault notes, no config |
| `/obsidian-health` | Vault audit — contradictions, gaps, stale claims, orphans |
| `/obsidian-adr` | Decision records — the vault knows why it's structured this way |
| `/obsidian-visualize` | Generates a visual canvas map of your second brain |
| `/obsidian-learn` | Reviews vault learnings, prunes stale ones, surfaces patterns to promote into rules |
| `/obsidian-init` | Generates `_CLAUDE.md`, `index.md`, `log.md` |
| `/obsidian-architect` | Scans a codebase and writes maintained architecture notes (overview, modules, decisions); re-run to refresh |
| `/create-command` | Interview flow that scaffolds a new command into `commands/<name>.md`, no markdown editing |

## Layer 2 — Thinking Tools (Claude thinks with you)

| Command | What it does |
|---|---|
| `/obsidian-challenge` | Your vault argues against your idea using your own history |
| `/obsidian-panel` | Convenes a panel of distinct perspectives on a decision — one verdict each + synthesis |
| `/obsidian-emerge` | Surfaces patterns from 30 days of notes you never named |
| `/obsidian-connect [A] [B]` | Bridges two unrelated domains to spark new ideas |
| `/vault-deep-synthesis [topic]` | Cross-references every note on a topic: agreements, contradictions, stale claims, gaps |
| `/idea-discovery` | Ranks 3–5 next-direction candidates from ideas, open questions, and orphan research |
| `/obsidian-graduate` | Turns an idea fragment into a full project with tasks |

## Layer 3 — Context Engine (Claude knows you)

| Command | What it does |
|---|---|
| `/obsidian-world` | Loads identity + state with progressive token budgets (L0–L3) |

## Layer 4 — Research Toolkit (Claude pulls knowledge in)

Powered by xAI Grok (live X access) + Perplexity Sonar (web) + Gemini File Search
+ YouTube. Findings save to `Research/` as AI-first notes (preamble, frontmatter,
recency markers, sources verbatim). Auto-opens in Obsidian (disable with
`RESEARCH_AUTOOPEN=0`).

| Command | What it does | Approx cost |
|---|---|---|
| `/x-read [url]` | Deep-read an X post: verbatim post + thread + TL;DR + claims + reply sentiment + voices | ~$0.05 |
| `/x-pulse [topic]` | Scan X for what's trending: themes, voices, hooks, post ideas | ~$0.13 |
| `/research [topic]` | Web research with citations and recency markers; Perplexity when keyed, free key-less sources otherwise | ~$0.05 / free |
| `/research-deep [topic]` | Vault-first synthesis: scan vault → find gaps → fill via Perplexity + Grok → propagate updates | ~$0.40 / free |
| `/notebooklm [topic]` | Vault-grounded synthesis via Gemini File Search (uploads top 12 notes, cites, deletes store) | ~$0.004–0.06 |
| `/youtube [url]` | Transcript + metadata + top comments → AI-first summary | ~$0.04 |
| `/podcast [url]` | Apple Podcasts or RSS → transcript (RSS tag / Whisper / show-notes) + AI-first summary | ~$0.04 + Whisper |

**Dual-track research:** run the open-web track (`/research-deep` via Perplexity +
Grok) and the source-grounded track (`/notebooklm` via Gemini File Search) on the
same high-stakes topic. **Contradictions across the two are where the insight is.**

**No keys?** `/research` and `/research-deep` fall back to free key-less sources
(Wikipedia, HackerNews, arXiv, Reddit, Lobsters, dev.to, OpenAlex, Semantic
Scholar, CrossRef, DuckDuckGo). Pass `--free` to force it even when keyed, or
`--academic` to restrict to scholarly sources. The other research commands
(`/x-read`, `/x-pulse`, `/notebooklm`, `/youtube`) still need their keys.
