# obsidian-second-brain — vault architecture & automation

## The AI-first vault rule (the core invariant)

Traditional vaults are filing cabinets — you put things in, they sit there. This
vault **rewrites itself with every input**. Honor these rules on every write,
regardless of model:

- **`## For future Claude` preamble** opens every note — what it is, why it
  matters, how to use it. Notes are for LLM retrieval, not human review.
- **Frontmatter for retrieval** — type, tags, recency markers, sources verbatim.
- **Rewrite, don't append** — when a source adds depth or contradicts a page,
  rewrite that page and document why.
- **Bi-temporal facts** — track when a fact was true AND when the vault learned
  it. Full audit trail: "You believed X on Tuesday. After ingesting Y on
  Wednesday, you shifted to Z."
- **Two-Output Rule** — every answer also updates the relevant pages.
- **`raw/` is immutable** — original sources are never edited.

## How this extends Karpathy's LLM-Wiki

| | Karpathy's LLM-Wiki | obsidian-second-brain |
|---|---|---|
| New sources | Append new pages, cross-reference | **Rewrite existing pages** — people updated, claims revised, stale facts replaced |
| Contradictions | Flagged, you resolve manually | `/obsidian-reconcile` resolves them automatically |
| Patterns | Surface when you ask | `/obsidian-synthesize` finds unnamed patterns and writes synthesis pages on its own |
| When it runs | On demand, when you prompt | 4 scheduled agents: nightly close, weekly review, contradiction sweep, vault-health check |
| Note format | Human-readable wiki pages | AI-first: `## For future Claude` preamble + frontmatter for LLM retrieval |

## Vault layout (wiki-style default — LLM-first)

Claude is the reader and writer; the vault is a database.

```
vault/
├── _CLAUDE.md          # Operating manual
├── index.md            # Page catalog (Claude reads FIRST)
├── log.md              # Activity timeline
├── SOUL.md             # Your identity
├── CRITICAL_FACTS.md   # ~120 tokens, always loaded (timezone, manager, location)
├── raw/                # IMMUTABLE source material
├── wiki/               # Claude's workspace
│   ├── entities/       #   People, companies, tools
│   ├── concepts/       #   Ideas, frameworks, synthesis
│   ├── projects/       #   Project notes
│   ├── daily/          #   Daily notes
│   ├── logs/           #   Work session logs
│   ├── reviews/        #   Weekly/monthly reviews
│   ├── tasks/          #   Task notes
│   └── decisions/      #   ADRs
├── boards/             # Kanban boards
└── templates/          # Note templates
```

## Role presets

Pick a role at bootstrap. Each preset creates tailored folder structures,
templates, and kanban boards.

| Preset | Who it's for | Kanban style |
|---|---|---|
| `executive` | Founders, operators, managers | OKRs / Quarterly / Weekly |
| `builder` | Developers, engineers, architects | Backlog / Sprint / Done |
| `creator` | Writers, YouTubers, marketers | Ideas / Drafts / Published |
| `researcher` | Academics, analysts, deep-divers | Reading / Processing / Synthesized |

```bash
python bootstrap_vault.py --path ~/my-vault --name "Your Name" --preset builder
```

No preset → a general-purpose vault that works for everyone.

## Background & scheduled agents (always on)

**Background:** fires after every context compaction. You keep working; the vault
updates itself.

```
PostCompact → obsidian-bg-agent.sh → claude -p (headless) → vault updated
```

**Scheduled:**

| Agent | When | What |
|---|---|---|
| `morning` | 8 AM | Daily note + overdue tasks |
| `nightly` | 10 PM | Sleeptime consolidation: close day + reconcile + synthesize + heal orphans + rebuild index |
| `weekly` | Fridays 6 PM | Weekly review |
| `health` | Sundays 9 PM | Vault health audit |

**Save reminders:** the agent nudges `/obsidian-save` after 10+ exchanges or when
you say "done" / "thanks" — no lost conversations.

## What `/obsidian-ingest` actually does

```
/obsidian-ingest https://youtube.com/watch?v=example
```

1. Saves the original to `raw/videos/` (immutable)
2. REWRITES entity pages with new context
3. REWRITES concept pages if the source adds depth or contradicts them
4. Creates synthesis pages when patterns emerge
5. Resolves contradictions and documents why
6. Updates `index.md`, `log.md`, daily note

One URL in. The vault rewrites itself.
