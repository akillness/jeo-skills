# Install, Requirements, Upgrading, and Agent Wiring

All facts below are grounded in the scraped upstream README
(`.jeo/scrape/obsidian-mind-readme.md`). Re-verify against
`https://raw.githubusercontent.com/breferrari/obsidian-mind/main/README.md`
if you need detail this file does not cover.

## Install path 1: ShardMind (recommended)

```bash
npm install -g shardmind
mkdir my-vault && cd my-vault
shardmind install github:breferrari/obsidian-mind
```

`shardmind install` writes into the **current directory** — always create and
enter a fresh folder first. The wizard collects your name, organization,
vault purpose, agents to include, and whether to enable QMD; it then
initializes git, optionally bootstraps QMD, and personalizes
`brain/North Star.md` with your answers.

[ShardMind](https://github.com/breferrari/shardmind) is the package manager
for Obsidian vault templates. Installing adds a `.shardmind/` sidecar that
powers the wizard, optional modules (skip what you don't use), and
three-way-merge upgrades. With every value at its default, the install is
**byte-equivalent to `git clone`** — clone-UX is preserved exactly. Deleting
`.shardmind/` and `shard-values.yaml` from the installed vault leaves it
working: ShardMind is additive, not load-bearing.

## Install path 2: direct clone

```bash
git clone https://github.com/breferrari/obsidian-mind.git
```

Or use it as a **GitHub template** — skip the wizard, get the bare template,
then fill in `brain/North Star.md` with your own goals by hand (the ShardMind
wizard does this step for you automatically).

## Post-install steps (same for either path)

1. Open the installed folder as an **Obsidian vault**
2. Enable the **Obsidian CLI** in Settings → General (requires Obsidian 1.12+)
3. Run your agent in the vault directory: `claude`, `codex`, or `gemini`
4. Start talking about work

## Requirements (state these exactly)

- [Obsidian](https://obsidian.md) 1.12+ (for CLI support)
- An AI coding agent: [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
  (full support), [Codex CLI](https://github.com/openai/codex), or
  [Gemini CLI](https://github.com/google-gemini/gemini-cli)
- [Node 22+ LTS](https://nodejs.org) (for hook scripts — typically already
  installed alongside Claude Code / Codex / Gemini CLI)
- Git (for version history)
- [QMD](https://github.com/tobi/qmd) (optional, for semantic search)

Node flag note: hook scripts execute TypeScript directly via Node's
`--experimental-strip-types` flag, stable since Node 22.6+ (Aug 2024) and
default behavior in Node 23.6+. If a future Node release retires or renames
the flag, the hook commands in `.claude/settings.json`, `.codex/hooks.json`,
and `.gemini/settings.json` need a one-line update.

## Optional: QMD semantic search bootstrap

```bash
npm install -g @tobilu/qmd
node --experimental-strip-types .scripts/qmd-bootstrap.ts
```

The bootstrap is idempotent — safe to re-run. It resolves the vault's index
name (the `qmd_index` field from `vault-manifest.json` when set, otherwise the
vault folder name slugified), reads `qmd_context`, registers the collection,
attaches the context, and builds the index + embeddings. To use a different
index name (e.g. one vault per engineer on a shared workstation), edit
`qmd_index` in `vault-manifest.json` before bootstrapping. Once populated,
always pass `--index`:

```bash
qmd --index obsidian-mind query "what did we decide about caching"
qmd --index obsidian-mind update   # after bulk edits
qmd --index obsidian-mind embed    # after many new notes
```

Under the hood QMD runs three small local models — no API key, no per-query
cost, works offline:

| model | size | job |
|---|---|---|
| `embeddinggemma-300M` | ~328MB | turns notes and queries into vectors |
| `qmd-query-expansion-1.7B` | ~1.28GB | rewrites the query into better search terms |
| `Qwen3-Reranker-0.6B` | ~640MB | reorders the shortlist by actual relevance |

Three CLI verbs, cheapest first: `qmd search` (BM25 keywords, no model),
`qmd vsearch` (vector-only), `qmd query` (full hybrid). Without QMD installed,
everything still works — the agent falls back to grep and the Obsidian CLI,
and the MCP server entry is skipped with a harmless warning.

## Upgrading an existing install

### Ask your agent (easiest)
```
Update this vault to the latest obsidian-mind from https://github.com/breferrari/obsidian-mind
```
The agent pulls the latest changes, resolves conflicts, and updates
infrastructure files. Works with Claude Code, Codex CLI, or Gemini CLI.

### Updating a direct clone
```bash
cd your-vault
git pull origin main
```
New files (`AGENTS.md`, `GEMINI.md`, `.codex/`, `.gemini/`) appear
automatically; hook scripts update in place.

### Updating a fork
```bash
git remote add upstream https://github.com/breferrari/obsidian-mind.git
git fetch upstream
git merge upstream/main
```
Resolve conflicts in customized files (typically `CLAUDE.md`, `brain/`
notes); infrastructure files (`.claude/scripts/`, `.codex/`, `.gemini/`)
should merge cleanly.

### Adopting an existing clone into ShardMind (v5.x → v6)
```bash
npm install -g shardmind
shardmind adopt github:breferrari/obsidian-mind
```
`shardmind adopt` reconciles an existing vault into a managed v6 install —
keeping every byte of customization and only adding the `.shardmind/`
sidecar + `shard-values.yaml`. A 2-way diff UI walks through local changes,
asks per-file what to keep, then writes engine metadata. Result: a
v6-managed vault ready for `shardmind update` going forward — no re-cloning.

### Migrating from an older or different vault: `/om-vault-upgrade`
```bash
# 1. Clone the latest obsidian-mind
git clone https://github.com/breferrari/obsidian-mind.git ~/new-vault
# 2. Open it in your agent
cd ~/new-vault && claude   # or codex, or gemini
# 3. Run the upgrade pointing to your old vault
/om-vault-upgrade ~/my-old-vault
```
The agent will:
1. **Detect** the vault version (v1–v3.x, or identify a non-obsidian-mind vault)
2. **Inventory** every file — user content, scaffold, infrastructure, or uncategorized
3. **Present a migration plan** — exactly what will be copied, transformed, skipped
4. **Execute** after approval — transforms frontmatter, fixes wikilinks, rebuilds indexes
5. **Validate** — checks for orphans, broken links, missing frontmatter

The old vault is never modified. Use `--dry-run` to preview without
executing. Works with any Obsidian vault, not just obsidian-mind — for
non-obsidian-mind vaults, the agent classifies content semantically and
routes work notes, people, incidents, 1:1s, and decisions to the right
folders.

## Multi-agent wiring detail

The vault conventions in `CLAUDE.md`, the hook scripts in
`.claude/scripts/`, and the commands in `.claude/commands/` are all
agent-agnostic — pure Markdown, TypeScript, and shell with no SDK
dependencies.

- **Claude Code** — full support. Hooks, commands, subagents, and the memory
  system all work out of the box.
- **Codex CLI** — reads `AGENTS.md` natively. Hook config at
  `.codex/hooks.json` wires the same hook scripts Claude Code uses — session
  context, message classification, and write validation work automatically.
  Commands work as regular prompts (type `om-standup` without the `/` prefix).
- **Gemini CLI** — reads `GEMINI.md` natively. Hook config at
  `.gemini/settings.json` maps Gemini's event names to the shared hook
  scripts.
- **Other agents** (Cursor, Windsurf, GitHub Copilot, JetBrains AI) — read
  `AGENTS.md` for vault conventions; hook support varies by agent.

Only the `~/.claude/` auto-memory loader is Claude Code-specific. Hooks,
commands, subagent prompts, and vault memory (`brain/`) are all
agent-agnostic.

## Reaching the vault from another repo: the `om` MCP server

```json
{
  "mcpServers": {
    "om": {
      "command": "node",
      "args": ["/path/to/your-vault/.claude/scripts/om-mcp.mjs"]
    }
  }
}
```

This goes in the **consuming project's** `.mcp.json`. Add a short section to
that project's own `CLAUDE.md` pointing at the vault too — both steps are
required; a prohibition in the MCP `instructions` field propagates into the
calling session reliably, but a positive "go consult the vault" instruction
is only advisory and gets skipped when a nearer source exists.

What the session gets: `search` (semantic + keyword), `expand` (a note's
links and backlinks), `recall` (durable lessons scoped to that repo),
`remember` (record a lesson), `record_work` (file what happened), `reason`
(judgement across several notes using a second Claude session — never
recorded as memory on its own, marked `confidence: inferred`), and `health`
(is the wiring intact?).

Repos are identified by folder name by default; drop a `.om-project` file
with a distinct name at the repo root to disambiguate two repos with the
same folder name. Reach for cross-repo memories is declared at write time,
never guessed at read time — everything recorded carries
`confidence: verified | inferred | unverified`, dated volatile facts, and
server-derived provenance. `mcp_exposed_roots` in `vault-manifest.json`
narrows what a vault serves to other repos; a note tagged `private` is never
served.
