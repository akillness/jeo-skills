# Vault Structure

Straight from the upstream README's "Vault Structure" section. Use this to
tell the agent exactly which folder a note belongs in instead of a vague
"save it somewhere."

```
Home.md                Vault entry point — embedded Base views, quick links
CLAUDE.md               Operating manual — read by your agent every session
AGENTS.md               Multi-agent guide — Codex, Cursor, Windsurf, etc.
GEMINI.md               Multi-agent guide — Gemini CLI
vault-manifest.json      Template metadata — version, structure, schemas
.shardmindignore         Files excluded from `shardmind install` (CONTRIBUTING, translations, marketing media)
CHANGELOG.md             Version history
CONTRIBUTING.md          Template development checklist
README.md                Product documentation
LICENSE                  MIT license
bases/                   Dynamic database views (Work Dashboard, Incidents, People, etc.)
work/
  active/                Current projects (1–3 files at a time)
  archive/YYYY/          Completed work, organized by year
  incidents/             Incident docs (main note + RCA + deep dive)
  1-1/                   1:1 meeting notes — named YYYY-MM-DD.md
  Index.md               Map of Content for all work
org/
  people/                One note per person — role, team, relationship, key moments
  teams/                 One note per team — members, scope, interactions
  People & Context.md    MOC for organizational knowledge
perf/
  Brag Doc.md            Running log of wins, linked to evidence
  brag/                  Quarterly brag notes (one per quarter)
  competencies/          One note per competency (link targets)
  evidence/              PR deep scans, data extracts for reviews
  <cycle>/                Review cycle briefs and artifacts
brain/
  North Star.md          Goals and focus areas — read every session
  Memories.md             Index of memory topics
  Key Decisions.md        Significant decisions and their reasoning
  Patterns.md             Recurring patterns observed across work
  Gotchas.md               Things that have gone wrong and why
  Skills.md                Custom workflows and slash commands
reference/               Codebase knowledge, architecture maps, flow docs
thinking/                 Scratchpad for drafts — promote findings, then delete
templates/                Obsidian templates with YAML frontmatter
.claude/
  commands/                18 slash commands
  agents/                  9 subagents
  scripts/                 Hook scripts + charcount.ts utility
  skills/                  Obsidian + QMD skills
  settings.json            5 hooks configuration
.scripts/                 Vault-level tooling — QMD bootstrap (run once on a fresh clone)
.shardmind/                ShardMind sidecar — only used if installed via `shardmind install`
  shard.yaml                Manifest (name, version, modules, hooks)
  shard-schema.yaml          Wizard values + module gating
  hooks/                     bootstrap (git init + QMD), personalize (North Star), post-update
```

`.shardmind/` is **additive, not load-bearing** — a clone-and-open vault
never reads it; only the `shardmind` CLI does. Deleting it leaves the vault
working. See the v6 layout contract in
[shardmind/docs/SHARD-LAYOUT.md](https://github.com/breferrari/shardmind/blob/main/docs/SHARD-LAYOUT.md).

## Templates

Templates ship with YAML frontmatter, each including a `description` field
for progressive disclosure:

- **Work Note** — date, description, project, status, quarter, tags
- **Decision Record** — date, description, status (proposed/accepted/deprecated), owner, context
- **Thinking Note** — date, description, context, tags (scratchpad — delete after promoting)
- **Competency Note** — date, description, current-level, target-level, proficiency table
- **1:1 Note** — date, person, key takeaways, action items, quotes
- **Incident Note** — date, ticket, severity, role, timeline, root cause, impact

## What's included out of the box

### Obsidian Skills
[kepano/obsidian-skills](https://github.com/kepano/obsidian-skills)
pre-installed in `.claude/skills/`:
- **obsidian-markdown** — Obsidian-flavored markdown (wikilinks, embeds, callouts, properties)
- **obsidian-cli** — CLI commands for vault operations
- **obsidian-bases** — Database-style `.base` files
- **json-canvas** — Visual `.canvas` file creation
- **defuddle** — Web page to markdown extraction

### QMD Skill
A custom skill in `.claude/skills/qmd/` that teaches the agent to use
[QMD](https://github.com/tobi/qmd) semantic search proactively — before
reading files, before creating notes (to check for duplicates), and after
creating notes (to find related content that should link to it).

## Customization points

| What | Where |
|------|-------|
| Your goals | `brain/North Star.md` — grounds every session |
| Your org | `org/` — add your manager, team, key collaborators |
| Your competencies | `perf/competencies/` — match your org's framework |
| Your tools | `.claude/commands/` — edit for your GitHub org, Slack workspace |
| Your conventions | `CLAUDE.md` — the operating manual, evolve it as you go |
| Your domain | Add folders, subagents in `.claude/agents/`, or classification rules in `.claude/scripts/` |

`CLAUDE.md` is the operating manual — when conventions change, update it,
since the agent reads it every session.
