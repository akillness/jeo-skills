# Mex Commands Reference

Curated command reference by workflow stage. For the full CLI, run `mex
--help`.

## Installation and Setup

### Install globally

```bash
npm install -g mex-agent
mex --version
```

### Initialize a project

```bash
cd /path/to/project
mex setup
```

Scaffolds `.mex/` directory with `index.md`, `ROUTER.md`, `graphs/`, and
`wiki/`.

### Check environment (read-only)

```bash
bash .agent-skills/mex/scripts/mex.sh doctor
```

Reports Node.js version, `mex` binary, Git repo status. Does not modify
anything.

## Code Graph Operations

### Update the code graph

```bash
mex update
```

Parses all source files (TypeScript, JavaScript, Python, Rust) and generates
symbol fingerprints. Creates `.mex/graphs/` checksums for drift detection.

### Force a full rebuild

```bash
mex update --force
```

Discards cached state and re-parses everything.

### View graph metadata

```bash
mex whoami
```

Shows project name, Git commit, graph stats, and symbol count.

## Drift Detection and Repair

### Check for drift (read-only)

```bash
mex check
```

Validates:
- All file paths (detects moved/deleted files)
- All wiki links (detects broken references)
- Symbol fingerprints (detects code changes)
- Grounding references (detects missing code nodes)

Does not modify anything.

### Sync drift repairs

```bash
mex sync
```

After `mex check` reports issues, this command:
1. Removes stale paths from the wiki
2. Updates broken links to new locations
3. Recomputes fingerprints for changed symbols
4. Suggests grounding fixes

Can be paired with agent review:

```bash
mex check && mex sync && git diff .mex/
```

## Context Routing

### Edit the router

```bash
# Open in your editor
$EDITOR .mex/ROUTER.md
```

Map task types to relevant wiki pages:

```markdown
## Task: add API endpoint

Load:
- architecture/api-layers.md
- conventions/naming.md

Don't load:
- ui/components.md
```

### Query the router

```bash
mex route --task "add a database migration"
```

Shows which wiki pages the router would load for that task.

## Wiki Operations

### List all wiki pages

```bash
ls -la .mex/wiki/
find .mex/wiki -name "*.md" -type f
```

### View the anchor

```bash
cat .mex/index.md
```

This file is always loaded first; it points agents to the ROUTER.md and high-level project state.

### Edit a wiki page

```bash
$EDITOR .mex/wiki/architecture/api-layers.md
```

Wiki pages are plain Markdown. Add frontmatter to ground claims:

```yaml
---
grounds_to:
  - node: "function:a3f8...c21"
    fingerprint: "mh:64:9f2a..."
---
```

## MCP Server (optional)

### Start the MCP server

```bash
mex mcp serve --port 3000
```

Exposes project memory to agents over the Model Context Protocol.

### Register with Claude Code

```bash
claude mcp add mex -- mex mcp serve
```

### Register with other agents

```bash
# Cursor, jeo, gjc, jeopi, OpenCode
<agent_name> mcp add mex -- mex mcp serve
```

### Stop the server

```bash
# Press Ctrl+C in the terminal running `mex mcp serve`
```

## Debugging and Inspection

### View the graph JSON

```bash
find .mex/graphs -name "*.json" | head -3
cat .mex/graphs/graph.json | jq '.nodes | length'
```

### Inspect a symbol

```bash
mex whoami
# Then look up the symbol hash in .mex/graphs/
```

### Dry-run a drift check

```bash
mex check --dry-run
```

(If supported; check `mex check --help`.)

### Clear cache and restart

```bash
rm -rf .mex/graphs/*.json
mex update
```

## Integrating with Git

### Commit the scaffold

```bash
git add .mex/
git commit -m "feat: add mex project memory scaffold"
```

### Ignore generated graphs (optional)

```bash
echo ".mex/graphs/" >> .gitignore
```

(Graphs can be regenerated; you may prefer to version only the wiki and
ROUTER.md.)

### Diff after a sync

```bash
mex check && mex sync
git diff .mex/wiki/
git diff .mex/ROUTER.md
```

Review the changes before committing.

## Workflow Recipes

### Prep a project for agent work

```bash
mex setup
# Edit .mex/ROUTER.md
mex update
mex check
```

### End-of-session cleanup

```bash
mex check      # detect drift
mex sync       # auto-repair
git add .mex/wiki .mex/ROUTER.md
git commit -m "chore: sync mex project memory"
```

### Multi-agent handoff

```bash
# Agent 1 finishes
mex sync

# Agent 2 starts
mex route --task "<agent2's task>"
# Agent 2 loads only relevant pages
```

## Troubleshooting

### "Node.js version mismatch"

```bash
node --version  # Should be >= 22.5
npm install -g mex-agent@latest
```

### "Git repository not found"

```bash
cd /path/to/project
git init  # or: ensure you're in a Git repo
```

### "Symbol fingerprint mismatch"

```bash
mex update --force
mex check
```

### ".mex/ directory is corrupted"

```bash
rm -rf .mex/
mex setup
mex update
```
