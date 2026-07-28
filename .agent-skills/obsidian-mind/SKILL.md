---
name: obsidian-mind
description: >
  Route obsidian-mind work into the right mode: install/bootstrap the vault
  (ShardMind vs git clone), the daily standup/dump/wrap-up session loop,
  capture routes for decisions, incidents, 1:1s, and wins, the performance-graph
  review flow (/om-review-brief, /om-self-review, /om-peer-scan), vault
  maintenance and /om-vault-upgrade migration, multi-agent wiring across
  Claude Code, Codex CLI, and Gemini CLI, and optional QMD semantic search.
  obsidian-mind is a specific ready-made Obsidian vault template giving coding
  agents persistent, session-spanning memory through five lifecycle hooks,
  /om-* commands, subagents, and a competency graph — not a generic
  vault-building or wiki-authoring workflow. Triggers on: obsidian-mind,
  om-standup, om-dump, om-wrap-up, om-review-brief, om-self-review,
  om-peer-scan, om-vault-upgrade, brag doc, North Star.md, performance graph,
  competency notes, session lifecycle hooks, shardmind install obsidian-mind.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Claude Code has full support (hooks, commands, subagents, memory system
  out of the box). Codex CLI and Gemini CLI get the same hooks and commands
  via .codex/hooks.json / .gemini/settings.json and read AGENTS.md / GEMINI.md
  natively; other agents (Cursor, Windsurf, GitHub Copilot, JetBrains AI) read
  AGENTS.md for vault conventions with hook support varying by agent. Requires
  Obsidian 1.12+ (for CLI support), Node 22+ LTS (hook scripts use
  --experimental-strip-types), and Git. QMD semantic search is optional.
license: MIT
metadata:
  tags: obsidian-mind, obsidian, agent-memory, persistent-memory, session-hooks, performance-review, brag-doc, shardmind, claude-code, codex-cli, gemini-cli, qmd
  version: "1.0"
  source: https://github.com/breferrari/obsidian-mind
---

# obsidian-mind

Use this skill when the real question is **"which obsidian-mind mode does this request need — install, daily session loop, capture, review, maintenance, multi-agent wiring, or semantic search?"**

obsidian-mind ([breferrari/obsidian-mind](https://github.com/breferrari/obsidian-mind)) is **one specific, ready-made Obsidian vault** — not a generic pattern you build from scratch. Cloning or `shardmind install`-ing it gives a coding agent persistent, session-spanning memory through five lifecycle hooks, `/om-*` slash commands, subagents that run in isolated context windows, and a career/performance graph (competency notes, brag docs, review briefs). "Procedural code owns the environment; the agent owns content" — hooks classify, validate, and inject context deterministically, while the agent decides what to write and where.

The job is not to dump the whole command/hook/subagent surface every time. The job is to:
1. classify the request into one mode,
2. point at the exact command, hook, folder, or install step the README documents,
3. route out honestly when the request actually belongs to a neighboring skill.

## When to use this skill

- Installing or bootstrapping the obsidian-mind vault (ShardMind wizard vs `git clone` vs GitHub template)
- Running the daily loop: morning `/om-standup`, in-the-moment capture, end-of-day `/om-wrap-up`
- Filing a decision, incident, 1:1, or win into the right vault note via the classification hooks or `/om-dump`, `/om-capture-1on1`, `/om-incident-capture`
- Prepping for a review cycle: `/om-self-review`, `/om-review-peer`, `/om-review-brief`, `/om-peer-scan`, or reading the competency/backlink graph
- Auditing or migrating a vault: `/om-vault-audit`, `/om-tidy`, `/om-vault-upgrade`, `shardmind adopt`
- Wiring obsidian-mind into Claude Code, Codex CLI, Gemini CLI, or another `AGENTS.md`-reading agent
- Setting up or explaining the optional QMD semantic-search layer (`qmd` CLI, `.mcp.json`, the `om` MCP server)

## When not to use this skill

- **The user wants a generic Obsidian vault, plugin work, CLI automation, JSON Canvas, or Bases patterns with no obsidian-mind-specific machinery** → route to `obsidian-second-brain`'s note that this repo's obsidian-related skills are template-specific, or handle as a plain Obsidian question outside any skill
- **The user wants a self-rewriting vault built on Karpathy's LLM-Wiki pattern (rewrite-not-append pages, contradiction reconciliation, research toolkit, thinking-tools panel) without obsidian-mind's career/performance-graph focus** → use `obsidian-second-brain` (a different upstream project, [akillness/obsidian-second-brain](https://github.com/akillness/obsidian-second-brain)) — do not conflate the two vault templates
- **The user wants a bare `raw/` + `wiki/` markdown knowledge base with `index.md`/`log.md`, no Obsidian vault template, hooks, or slash commands** → use `llm-wiki`
- **The user wants CLI-centric active project/repo memory (decision logs, manifests, handoff notes) scoped to a single codebase, not a personal/career Obsidian vault** → use `opencontext`
- **The user is asking about Lapian Notes / shot-by-shot film analysis** → that is `lapian-notes`, an unrelated video-analysis tool, not an agent-memory system

Read [references/vault-structure.md](references/vault-structure.md) if you need the full folder layout before routing.

## Instructions

### Step 1: Classify the request into one mode

Pick exactly one primary mode before answering:

| Mode | Pick when the user wants to... |
|------|--------------------------------|
| `install` | Get the vault installed/bootstrapped for the first time, or upgraded/adopted |
| `daily-session` | Run standup → work → wrap-up, or understand the lifecycle hooks |
| `capture` | File a decision, incident, 1:1, win, or freeform brain dump |
| `review` | Prep a self-review, peer review, or review brief off the performance graph |
| `maintenance` | Audit, tidy, or migrate vault content |
| `multi-agent` | Wire obsidian-mind into Claude Code, Codex CLI, Gemini CLI, or another agent |
| `qmd` | Set up or explain optional semantic search |

State the mode explicitly, e.g. *"install → ShardMind wizard"* or *"capture → `/om-dump`"*.

### Step 2: Install / bootstrap (mode `install`)

Two supported paths, same resulting vault:

```bash
# Recommended: ShardMind wizard
npm install -g shardmind
mkdir my-vault && cd my-vault
shardmind install github:breferrari/obsidian-mind
```

`shardmind install` writes into the **current directory** — always `mkdir` and `cd` into a fresh folder first. The wizard collects name, organization, vault purpose, agents to include, and QMD opt-in, then personalizes `brain/North Star.md`.

```bash
# Direct clone (no wizard, no .shardmind/ sidecar)
git clone https://github.com/breferrari/obsidian-mind.git
```

Either way, finish with the same four steps:
1. Open the installed folder as an **Obsidian vault**
2. Enable the **Obsidian CLI** in Settings → General (requires Obsidian 1.12+)
3. Run the agent in the vault directory: `claude`, `codex`, or `gemini`
4. Start talking about work

Requirements (state these exactly when asked): Obsidian 1.12+, an AI coding agent (Claude Code full support; Codex CLI or Gemini CLI), Node 22+ LTS for hook scripts, Git, and optionally QMD.

Full install detail, upgrading (`git pull`, fork merge, `shardmind adopt`), and `/om-vault-upgrade` migration live in [references/install-and-agent-wiring.md](references/install-and-agent-wiring.md).

### Step 3: Run the daily session loop (mode `daily-session`)

```
Morning:      /om-standup   → North Star, active projects, open tasks, recent changes
Throughout:   talk naturally; UserPromptSubmit hook classifies + routes each message
Big dumps:    /om-dump      → narrate everything at once, agent files it all
End of day:   "wrap up"     → runs /om-wrap-up: verifies notes, updates indexes, spots wins
Weekly:       /om-weekly    → cross-session synthesis + North Star alignment
```

Five lifecycle hooks make this automatic: **SessionStart** (context injection), **UserPromptSubmit** (classification + routing hints), **PostToolUse** (frontmatter/wikilink validation after `.md` writes), **PreCompact** (session-transcript backup), **Stop** (hygiene checklist). Full hook table and the token-budget tiering live in [references/session-lifecycle-and-commands.md](references/session-lifecycle-and-commands.md), along with the complete `/om-*` command table.

### Step 4: Route a capture (mode `capture`)

Do not force a manual folder choice — name the command and let the classification hook confirm the destination:

| What happened | Command / route |
|---|---|
| Freeform recap of a meeting, decisions, wins | `/om-dump` |
| A specific 1:1 transcript | `/om-capture-1on1` → `work/1-1/<Person> YYYY-MM-DD.md` |
| An incident (often from a Slack link) | `/om-incident-capture` → `slack-archaeologist` + `people-profiler` subagents, timeline + RCA + `perf/Brag Doc.md` entry |
| A decision worth recording on its own | Decision Record template in the relevant `work/` note |
| A win you want on record for review season | `perf/Brag Doc.md` (the `brag-spotter` subagent also finds uncaptured ones) |

Full subagent table and the performance-graph mechanics live in [references/capture-and-review-routes.md](references/capture-and-review-routes.md).

### Step 5: Route a review-cycle request (mode `review`)

```
/om-self-review    → self-assessment: projects, competencies, principles
/om-review-peer     → peer review: projects, principles, performance summary
/om-review-brief     → full review brief (manager or peer), evidence pre-linked
/om-peer-scan       → deep-scans a colleague's GitHub PRs into perf/evidence/
```

These read the **performance graph**: competency notes in `perf/competencies/` are link targets; work notes link to them under `## Related`; backlinks accumulate as evidence automatically; `review-prep` and `review-fact-checker` subagents aggregate and verify. Detail in [references/capture-and-review-routes.md](references/capture-and-review-routes.md).

### Step 6: Route maintenance / migration (mode `maintenance`)

```
/om-tidy          → acts on every hygiene flag: archive, group, split — never deletes, never commits
/om-vault-audit    → orphan notes, broken links, stale content
/om-vault-upgrade  → migrate an older/other vault into the current template (supports --dry-run)
shardmind adopt github:breferrari/obsidian-mind   → adopt an existing v5.x clone into managed v6, no re-clone
```

`/om-vault-upgrade` works on **any** Obsidian vault, not just obsidian-mind — it detects version, inventories files, presents a migration plan, and only executes after approval; the source vault is never modified. Full sequence in [references/install-and-agent-wiring.md](references/install-and-agent-wiring.md).

### Step 7: Wire in the target agent (mode `multi-agent`)

| Agent | Support |
|---|---|
| **Claude Code** | Full support — hooks, commands, subagents, memory system work out of the box |
| **Codex CLI** | Reads `AGENTS.md` natively; hook config at `.codex/hooks.json` wires the same hook scripts; commands run as regular prompts without the `/` prefix (e.g. `om-standup`) |
| **Gemini CLI** | Reads `GEMINI.md` natively; hook config at `.gemini/settings.json` maps Gemini's event names to the shared hook scripts |
| **Other agents** (Cursor, Windsurf, GitHub Copilot, JetBrains AI) | Read `AGENTS.md` for vault conventions; hook support varies |

Only the `~/.claude/` auto-memory loader (`MEMORY.md`) is Claude Code-specific — it is an index pointing at vault locations, never the storage itself. Hooks, commands, subagent prompts, and `brain/` memory are agent-agnostic Markdown/TypeScript/shell with no SDK dependency. Cross-repo access via the `om` MCP server (`search`, `expand`, `recall`, `remember`, `record_work`, `reason`, `health`) is covered in [references/install-and-agent-wiring.md](references/install-and-agent-wiring.md).

### Step 8: Explain optional QMD semantic search (mode `qmd`)

```bash
npm install -g @tobilu/qmd
node --experimental-strip-types .scripts/qmd-bootstrap.ts
qmd --index obsidian-mind query "what did we decide about caching"
qmd --index obsidian-mind update   # after bulk edits
qmd --index obsidian-mind embed    # after many new notes
```

QMD is optional in the strict sense — without it the vault falls back to grep + the Obsidian CLI — but subagents (`context-loader`, `review-prep`, `brag-spotter`) consult it first for sharper context, and it registers as an MCP server so `mcp__qmd__query`/`get`/`multi_get` appear as native agent tools. It runs three small local models (`embeddinggemma-300M`, `qmd-query-expansion-1.7B`, `Qwen3-Reranker-0.6B`) with no API key and no per-query cost.

## Examples

### Example 1: First-time install
**Input:** "Set me up with obsidian-mind so my coding agent remembers our work."
**Output sketch:** Mode `install`; recommend `npm install -g shardmind` → fresh `mkdir`/`cd` → `shardmind install github:breferrari/obsidian-mind`; note the wizard personalizes `North Star.md`; finish with the 4-step open-vault/enable-CLI/run-agent/start-talking sequence; mention `git clone` as the no-wizard alternative.

### Example 2: Daily loop
**Input:** "What should I run in the morning and at the end of the day?"
**Output sketch:** Mode `daily-session`; `/om-standup` in the morning, talk naturally through the day (classification hook routes it), `/om-dump` for big recaps, say "wrap up" to trigger `/om-wrap-up`, `/om-weekly` on a cadence.

### Example 3: Review season
**Input:** "My performance review is next week and I need my self-assessment plus evidence for a peer I'm reviewing."
**Output sketch:** Mode `review`; `/om-self-review` for the self-assessment, `/om-peer-scan` to pull the peer's GitHub PR evidence into `perf/evidence/`, `/om-review-brief` (manager or peer variant) to assemble the full brief off competency backlinks.

### Example 4: Should NOT trigger — generic self-rewriting wiki
**Input:** "I want a vault where every new source rewrites the relevant pages and reconciles contradictions automatically — I don't care about career tracking."
**Output sketch:** Recognize this is `obsidian-second-brain`'s rewrite-not-append/LLM-Wiki-evolution model, not obsidian-mind's session-hook + performance-graph model; route there instead of forcing this skill.

## Best practices

1. Name one mode (`install`, `daily-session`, `capture`, `review`, `maintenance`, `multi-agent`, `qmd`) before answering — do not dump the whole command table for every question.
2. Never invent a command, hook, folder, or subagent name that is not in the scraped README or its linked pages — verify against source material, not memory.
3. Treat obsidian-mind as one specific vault template, not a generic "Obsidian + AI memory" pattern; keep it distinct from `obsidian-second-brain`.
4. Point at the exact folder a note belongs in (`work/active/`, `org/people/`, `perf/competencies/`, `brain/`) instead of a vague "save it somewhere."
5. Remember QMD is optional — the vault degrades gracefully to grep + Obsidian CLI without it.
6. Route out early and honestly when the request is generic vault work, a Karpathy-style wiki, repo-scoped project memory, or something unrelated like Lapian Notes.

## References

- [references/install-and-agent-wiring.md](references/install-and-agent-wiring.md) — ShardMind vs git clone install, requirements, upgrading/adoption, `/om-vault-upgrade`, multi-agent wiring, `om` MCP server
- [references/session-lifecycle-and-commands.md](references/session-lifecycle-and-commands.md) — the five lifecycle hooks, full `/om-*` command table, token-efficiency tiers
- [references/capture-and-review-routes.md](references/capture-and-review-routes.md) — subagent table, performance-graph mechanics, Bases
- [references/vault-structure.md](references/vault-structure.md) — full vault folder layout, templates, customization points
- [obsidian-mind README](https://github.com/breferrari/obsidian-mind) (scraped source of truth for this skill)
