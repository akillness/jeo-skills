---
name: openspace
description: >
  Install and route through OpenSpace, the skill management layer for AI agents, so a
  host agent can retrieve/rank/load the right SKILL.md out of this jeo-skills catalog
  (~150 installed skills), then evaluate skill quality from real execution evidence and
  evolve skills via FIX/DERIVED/CAPTURED updates. Covers install-as-skill-finder,
  retrieve-a-skill, evaluate-quality, evolve-skills, and local-first hub share/import.
  Triggers on: openspace, skill finder, skill retrieval, find the right skill, rank
  skills, skill discovery, skill quality, evolve skill, FIX DERIVED CAPTURED, skill hub,
  openspace-mcp, DiscoverSkills, skill-discovery, delegate-task.

allowed-tools: Bash Read Write Edit Glob Grep
compatibility: Requires Python 3.12+ and an MCP-capable host (Claude Code, Codex, Cursor, OpenClaw, nanobot). Local search, evaluation, and evolution work without cloud access; sharing to the cloud hub needs an OpenSpace cloud agent key.
license: MIT
metadata:
  tags: openspace, skill-management, skill-discovery, skill-retrieval, skill-evaluation, skill-evolution, mcp, agent-skills, quality-layer, cloud-hub
  version: "1.0"
  source: https://github.com/HKUDS/OpenSpace
---

# OpenSpace

Use this skill when the real question is **"how does this host agent find, trust, and
improve the right SKILL.md out of a large catalog?"** — not when the user just wants a
single skill executed.

OpenSpace's own README frames it as **"The Skill Management Layer for AI Agents"**: your
skills keep growing, and OpenSpace helps you *retrieve*, *evaluate*, and *evolve* with
every run. In this repo, that job is specifically: act as the **skill-finder /
skill-retrieval layer for jeo-skills** — a host agent installs OpenSpace once, then asks
it to search, rank, and load the right `SKILL.md` out of the ~150 skills already
installed under `.agent-skills/` (and copied into `$HOME/.agents/skills`), instead of an
agent guessing from a flat skill list or a human maintaining routing rules by hand.

## When to use this skill

- The user wants to **install OpenSpace** so a host agent can act as a skill-finder over an existing skill catalog
- The user (or an agent) needs to **retrieve/rank the best-fit skill** for a task out of many installed skills
- The user wants to know **which installed skills actually work** based on real execution outcomes, not just descriptions
- The user wants **controlled skill evolution** (FIX / DERIVED / CAPTURED) driven by evidence from real runs
- The user wants to **share or import skills** through a local-first hub (package browsing, explicit import, trust-gated upload)
- The user is choosing between OpenSpace and a plain catalog grep, a long-lived knowledge wiki, or per-repo agent memory

## When not to use this skill

- **The user only needs plain keyword/grep lookup across the existing skill catalog** → route to `codebase-search` or `semble`; do not stand up a full MCP skill-management layer for a one-off lookup
- **The user wants long-lived, synthesized markdown knowledge (concepts, indexes, research notes)** → route to `llm-wiki`
- **The user wants per-repo agent memory (handoff notes, decision logs, manifests) that is not about skill selection at all** → route to `opencontext`
- **The user just wants to run one specific, already-known skill** → load that skill's `SKILL.md` directly; OpenSpace is for *finding and judging* skills, not a replacement for using them

## Instructions

### Step 1: Classify the job into one routing mode

Pick exactly one primary mode before doing anything else:

1. **install-as-skill-finder** — wire OpenSpace into a host agent so it can search this catalog
2. **retrieve-a-skill** — given a task, find/rank/load the right `SKILL.md`
3. **evaluate-skill-quality** — judge whether an installed skill is trustworthy from execution records
4. **evolve-skills** — apply evidence-driven FIX / DERIVED / CAPTURED updates
5. **share-import-hub** — publish a trusted skill or pull one from the local-first cloud hub
6. **route-out** — the job really belongs to `codebase-search`/`semble`, `llm-wiki`, or `opencontext`

Full mode detail and route-out reasoning: [references/skill-discovery-routing.md](references/skill-discovery-routing.md).

### Step 2: Install OpenSpace (Path A quick start)

Grounded in the upstream Quick Start:

```bash
git clone --filter=blob:none --sparse https://github.com/HKUDS/OpenSpace.git ~/.openspace/OpenSpace
cd ~/.openspace/OpenSpace
git sparse-checkout set --no-cone '/*' '!/assets/'   # skips the ~50 MB assets/ folder

# A dedicated venv, not the system Python: `pip install -e .` against a Homebrew or
# distro Python fails with PEP 668 "externally-managed-environment", which is how
# openspace-mcp ends up missing on a machine that "installed successfully".
python3 -m venv ~/.agents/venvs/openspace          # or: uv venv --python 3.12 ~/.agents/venvs/openspace
~/.agents/venvs/openspace/bin/python -m pip install -e .
~/.agents/venvs/openspace/bin/openspace-mcp --help  # verify installation
ln -sf ~/.agents/venvs/openspace/bin/openspace-mcp ~/.local/bin/openspace-mcp
```

Requires **Python 3.12+**.

Or run the bundled installer, which performs the same steps non-interactively, copies the
two host skills (Step 4), and registers the MCP server (Step 3):

```bash
bash scripts/install-openspace.sh --help
bash scripts/install-openspace.sh --dry-run
bash scripts/install-openspace.sh
```

Full per-host wiring detail: [references/install-and-mcp-wiring.md](references/install-and-mcp-wiring.md).

### Step 3: Wire the MCP server, with `OPENSPACE_HOST_SKILL_DIRS` pointed at this repo's skill root

Register the `openspace` MCP server in **every AI runtime installed on the machine** —
Claude Code and its Anthropic-compatible forks (kimi, glm/zai, deepseek, grok, qwen),
Codex, Gemini CLI, Cursor, OpenCode, and the pi / gjc / jeopi agent runtimes. **For
jeo-skills, `OPENSPACE_HOST_SKILL_DIRS` must point at `$HOME/.agents/skills`** — that is
where this repo's installers copy skills for host agents to load, so that is the
directory OpenSpace should scan and rank against.

Use the bundled registrar instead of hand-editing each config:

```bash
bash scripts/register-openspace-mcp.sh --dry-run   # preview every runtime it would touch
bash scripts/register-openspace-mcp.sh             # merge in place
bash scripts/register-openspace-mcp.sh --force     # overwrite an existing openspace entry
```

It writes `mcpServers` JSON (`~/.claude.json`, `~/.claude/claude_desktop_config.json`,
`~/.gemini/settings.json`, `~/.qwen/settings.json`, `~/.cursor/mcp.json`,
`~/.kimi/mcp.json`, `~/.glm/mcp.json`, `~/.zai/mcp.json`, `~/.deepseek/mcp.json`,
`~/.pi/agent/mcp.json`, `~/.gjc/agent/mcp.json`, `~/.jeopi/agent/mcp.json`), TOML
`[mcp_servers.openspace]` (`~/.codex/config.toml`, `~/.grok/config.toml`), and OpenCode's
`mcp` block with `type: local` (`~/.config/opencode/opencode.json`). Existing files keep
their mode and are replaced atomically; symlinks and non-regular configs are refused; a
runtime whose config directory does not exist is skipped rather than invented. The
absolute venv binary path is written, so registration does not depend on `~/.local/bin`
being on the agent's PATH (resolution order: `$OPENSPACE_VENV/bin/openspace-mcp`,
`~/.local/bin/openspace-mcp`, PATH, legacy `~/.openspace/venv/bin/openspace-mcp`).

The entry it writes is equivalent to:

```json
{
  "mcpServers": {
    "openspace": {
      "command": "$HOME/.agents/venvs/openspace/bin/openspace-mcp",
      "toolTimeout": 600,
      "env": {
        "OPENSPACE_HOST_SKILL_DIRS": "$HOME/.agents/skills",
        "OPENSPACE_WORKSPACE": "$HOME/.openspace/OpenSpace",
        "OPENSPACE_CLOUD_MODE": "local",
        "OPENSPACE_CLOUD_API_KEY": "sk-xxx (optional, for cloud)"
      }
    }
  }
}
```

OpenSpace supports three launch modes; prefer stdio for local use:

- **stdio** — keep `command: "openspace-mcp"` in the host config (simplest option)
- **SSE** — `openspace-mcp --transport sse --host 127.0.0.1 --port 8080` → endpoint `http://127.0.0.1:8080/sse`
- **streamable HTTP** — `openspace-mcp --transport streamable-http --host 127.0.0.1 --port 8081` → endpoint `http://127.0.0.1:8081/mcp`

Do not report installation success until `openspace-mcp --help` works and the MCP
client can see OpenSpace's tools; long `execute_task` calls need a `toolTimeout` of at
least 600 seconds.

### Step 4: Copy the two host skills that teach the agent when/how to call OpenSpace

```bash
cp -r OpenSpace/openspace/host_skills/delegate-task/ /path/to/your/agent/skills/
cp -r OpenSpace/openspace/host_skills/skill-discovery/ /path/to/your/agent/skills/
```

`skill-discovery/SKILL.md` teaches the host agent to search/discover skills;
`delegate-task/SKILL.md` teaches it to execute, fix, and upload. For jeo-skills, copy
both into `$HOME/.agents/skills/` (this is exactly what `scripts/install-openspace.sh`
automates). No additional prompting is needed after that — the host agent now knows
when to reach for OpenSpace instead of guessing.

### Step 5: Retrieve/discover the right skill for a task

Once installed, ask the host agent (via the `openspace` MCP tools, or `skill-discovery`)
to search and rank skills for the task at hand instead of scanning the catalog by hand.
OpenSpace discovers skills from `OPENSPACE_HOST_SKILL_DIRS`, configured
`skills.skill_dirs`, project roots such as `.openspace/skills`, user roots such as
`~/.openspace/skills`, and finally its own bundled `openspace/skills` — in that
precedence order. Every discovered skill passes `check_skill_safety` before it can be
loaded; skills with dangerous patterns (prompt injection, credential exfiltration) are
blocked and logged.

Ranking detail and route-out reasoning: [references/skill-discovery-routing.md](references/skill-discovery-routing.md).

### Step 6: Evaluate skill quality from real execution evidence

Do not trust a skill because its description reads well. OpenSpace's quality layer
tracks whether a skill was **selected, applied, completed, or fell back**, and whether
its underlying tools became unreliable, slow, or risky — using actual task behavior as
evidence instead of self-reported claims.

### Step 7: Evolve skills only when evidence demands it

OpenSpace evolves skills through three controlled triggers:

- **FIX** — repair a broken or outdated skill
- **DERIVED** — create a better or more specialized version from an existing skill
- **CAPTURED** — save one reusable subworkflow, but only when the source trace shows
  both its execution and a separate validation of the claimed postcondition

New/evolved skills are **provisional by default**; independent successful use promotes
a skill to **trusted**, while an attributable failure demotes it. `enabled` controls
reuse independently from that trust lifecycle. Blocked or uncertain proposals stay as
audit-only candidates — recurrence never auto-promotes them.

Full detail: [references/quality-and-evolution.md](references/quality-and-evolution.md).

### Step 8: Share or import skills through the local-first hub

Skills run and are evolved **locally**; the cloud is for discovery and review, not
execution:

```bash
openspace-download-skill  # download a skill from the cloud
openspace-upload-skill --skill-dir /path/to/skill/dir  # upload a trusted skill
```

Cloud upload requires the matching local SkillStore record to be `trusted` — both
public and private uploads fail closed for provisional or unknown records. The local
trust state itself is never sent to the cloud. Optional cloud bootstrap:

```bash
openspace-cloud-auth bootstrap-agent-key --email you@example.com --agent-name openspace-local-agent
```

Without cloud bootstrap, all local capabilities (task execution, evolution, local skill
search) still work normally.

### Step 9: Route out honestly when OpenSpace is not the right layer

- **Plain grep/keyword catalog lookup** (no ranking/quality/evolution needed) → `codebase-search` or `semble`
- **Long-lived synthesized markdown knowledge** (not skill selection) → `llm-wiki`
- **Per-repo agent memory / handoff notes / decision logs** (not skill selection) → `opencontext`

## Examples

### Example 1: Install OpenSpace as the skill-finder for this repo

**Input**
> Wire up OpenSpace so my coding agent can find the right skill out of our 150 installed skills instead of me pointing it at one by hand.

**Output sketch**
- Mode: `install-as-skill-finder`
- Run `bash scripts/install-openspace.sh` (clone + `pip install -e .` + verify `openspace-mcp --help`)
- Register the `openspace` MCP server in every installed runtime with `bash scripts/register-openspace-mcp.sh` (`OPENSPACE_HOST_SKILL_DIRS=$HOME/.agents/skills`, `OPENSPACE_WORKSPACE=$HOME/.openspace/OpenSpace`)
- Copy `skill-discovery/` and `delegate-task/` into `$HOME/.agents/skills/`
- Verify tools are visible and a lightweight local skill search works

### Example 2: Find the right skill for a task

**Input**
> I need to scrape a JS-rendered page — which of our installed skills should I use?

**Output sketch**
- Mode: `retrieve-a-skill`
- Ask OpenSpace to search/rank skills for "JS-rendered page scraping" across `OPENSPACE_HOST_SKILL_DIRS`
- Expect it to surface `scrapling` (or an equivalent) ranked above generic candidates, using BM25 + embedding hybrid ranking, then load that skill's `SKILL.md`

### Example 3: Judge whether a skill is still reliable

**Input**
> We've used the `deployment-automation` skill a dozen times. Is it actually working?

**Output sketch**
- Mode: `evaluate-skill-quality`
- Pull execution records: selected / applied / completed / fell-back counts, tool reliability signals
- Report trust status (provisional vs trusted) instead of trusting the skill's own description

### Example 4: Should NOT trigger — plain catalog search

**Input**
> Just grep the repo for which skill mentions "playwright".

**Output sketch**
- Mode: `route-out`
- This is a plain keyword lookup, not skill ranking/quality/evolution — route to `codebase-search`/`semble` instead of installing/invoking OpenSpace

## Best practices

1. Position OpenSpace as the **skill-finder layer**, not a replacement for the skills themselves — it selects and judges, agents still execute.
2. Point `OPENSPACE_HOST_SKILL_DIRS` at `$HOME/.agents/skills` for this repo so ranking runs against the actual installed catalog.
3. Prefer **stdio** for local MCP wiring; only use SSE/streamable HTTP when the host cannot use stdio or needs a standalone/remote server.
4. Trust skills by evidence (selected/applied/completed/fell-back), not by how good their description reads.
5. Keep evolution controlled — FIX/DERIVED/CAPTURED with provisional-then-trusted promotion, never silent auto-rewrite.
6. Treat the cloud hub as discovery-only; execution and trust decisions stay local, and upload requires `trusted` status.
7. Route out honestly to `codebase-search`/`semble`, `llm-wiki`, or `opencontext` when the job is not actually skill retrieval/quality/evolution.
8. Do not report install success until `openspace-mcp --help` works and the MCP client can see OpenSpace's tools.

## References

- [Install and MCP Wiring](references/install-and-mcp-wiring.md)
- [Skill Discovery and Routing](references/skill-discovery-routing.md)
- [Quality and Evolution](references/quality-and-evolution.md)
- [scripts/install-openspace.sh](scripts/install-openspace.sh) — non-interactive installer, host-skill copy, and MCP registration
- [scripts/register-openspace-mcp.sh](scripts/register-openspace-mcp.sh) — merge the `openspace` MCP entry into every installed runtime config (claude / codex / gemini / cursor / opencode / kimi / glm / zai / deepseek / grok / qwen / pi / gjc / jeopi)
- [OpenSpace GitHub Repository](https://github.com/HKUDS/OpenSpace)
