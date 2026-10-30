---
name: openspace
description: >
  Install OpenSpace, the skill management layer for AI agents, on its own and use it as
  the skill router for every host and model: a prompt-time hook ranks the installed
  catalog with OpenSpace's local BM25 (no LLM, no network) before the model runs and
  hands it the matching SKILL.md paths, then evaluate skill quality from execution
  evidence and evolve skills via FIX/DERIVED/CAPTURED. Covers install-as-skill-finder,
  prompt-time routing hooks, retrieve-a-skill, evaluate-quality, evolve-skills, and
  local-first hub share/import. Triggers on: openspace, skill finder, skill routing,
  routing hook, prompt hook, route skills, find the right skill, rank skills, skill
  discovery, skill quality, evolve skill, FIX DERIVED CAPTURED, skill hub,
  openspace-mcp, skill-discovery, delegate-task.

allowed-tools: Bash Read Write Edit Glob Grep
compatibility: Requires Python 3.12+ (uv recommended). Routing hooks support Claude Code, Codex, Gemini CLI/Antigravity, Kimi Code, jeopi, omp, pi, gjc, and OpenCode; the MCP server needs an MCP-capable host. Local search, routing, evaluation, and evolution work without cloud access; sharing to the cloud hub needs an OpenSpace cloud agent key.
license: MIT
metadata:
  tags: openspace, skill-management, skill-discovery, skill-routing, prompt-hook, skill-retrieval, skill-evaluation, skill-evolution, mcp, agent-skills, quality-layer, cloud-hub
  version: "2.0"
  source: https://github.com/HKUDS/OpenSpace
---

# OpenSpace

Use this skill when the real question is **"how does this host agent find, trust, and
improve the right SKILL.md out of a large catalog?"**, including making that choice
before the model runs so it does not depend on which model the host uses. It is not for
executing one already-known skill.

OpenSpace's own README frames it as **"The Skill Management Layer for AI Agents"**: your
skills keep growing, and OpenSpace helps you *retrieve*, *evaluate*, and *evolve* with
every run. In this repo it is the **skill router for jeo-skills**: installed once, on its
own (no other skill depends on it), it ranks the skills under `$HOME/.agents/skills` for
every prompt and lets the host agent load the right `SKILL.md` instead of guessing from a
flat skill list.

## When to use this skill

- The user wants to **install OpenSpace** so a host agent can act as a skill-finder over an existing skill catalog
- The user wants **skill routing that works with any model**: a prompt hook that picks skills before the model runs
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

1. **install-as-skill-finder** — install OpenSpace and wire it into host agents
2. **prompt-routing** — install, inspect, tune, or remove the prompt-time routing hooks
3. **retrieve-a-skill** — given a task, find/rank/load the right `SKILL.md`
4. **evaluate-skill-quality** — judge whether an installed skill is trustworthy from execution records
5. **evolve-skills** — apply evidence-driven FIX / DERIVED / CAPTURED updates
6. **share-import-hub** — publish a trusted skill or pull one from the local-first cloud hub
7. **route-out** — the job really belongs to `codebase-search`/`semble`, `llm-wiki`, or `opencontext`

Full mode detail and route-out reasoning: [references/skill-discovery-routing.md](references/skill-discovery-routing.md).

### Step 2: Install OpenSpace

Package downloads, writes to the user's installation, and host registration need
approval; preview first:

```bash
bash scripts/install-openspace.sh --dry-run --hooks   # plan, including every host the hooks would touch
bash scripts/install-openspace.sh                      # install + MCP registration
bash scripts/install-openspace.sh --hooks              # ...and prompt-time routing hooks (Step 4)
```

The installer clones HKUDS/OpenSpace into `~/.openspace/OpenSpace` at the commit the
router was verified against (`GIT_REF=main` follows upstream), builds
`~/.agents/venvs/openspace` with uv (Python 3.12), rebuilding it when its base
interpreter was removed by a Python upgrade, and installs OpenSpace with `rank-bm25`,
`PyYAML`, and `mcp>=1,<2`. The `mcp` pin matters: OpenSpace declares `mcp>=1.0.0`, but
`openspace-mcp` imports `mcp.server.fastmcp`, which MCP SDK 2 removed, so an unpinned
install produces an `openspace-mcp` that cannot start. It then verifies
`openspace-mcp --help` and the router contract (`scripts/route_prompt.py --check`,
offline), copies the `skill-discovery`/`delegate-task` host skills into
`~/.agents/skills`, and registers the MCP server. Its exit status is not proof that a
host exposes the tools; verify that in the host.

Manual equivalent: [references/install-and-mcp-wiring.md](references/install-and-mcp-wiring.md).

### Step 3: Wire the MCP server only for approved hosts

Registration changes host configuration and is separate from package-install approval.
Preview the registrar's full target set first; it is not a per-host command:

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
`mcp` block with `type: local`. Gemini CLI and Qwen Code validate `mcpServers` strictly
and refuse to start on a `toolTimeout` key, so their entries carry only `command` and
`env` (their default MCP timeout is already 10 minutes) and an older entry with
`toolTimeout` is repaired without `--force`. Existing files keep their mode and are
replaced atomically; symlinks and non-regular configs are refused; a runtime whose config
directory does not exist is skipped. The absolute venv binary path is written.

The Claude-family entry is equivalent to:

```json
{
  "mcpServers": {
    "openspace": {
      "command": "$HOME/.agents/venvs/openspace/bin/openspace-mcp",
      "toolTimeout": 600,
      "env": {
        "OPENSPACE_HOST_SKILL_DIRS": "$HOME/.agents/skills",
        "OPENSPACE_WORKSPACE": "$HOME/.openspace/OpenSpace",
        "OPENSPACE_CLOUD_MODE": "local"
      }
    }
  }
}
```

OpenSpace supports three launch modes; prefer stdio for local use:

- **stdio** — keep `command: "openspace-mcp"` in the host config (simplest option)
- **SSE** — `openspace-mcp --transport sse --host 127.0.0.1 --port 8080` → endpoint `http://127.0.0.1:8080/sse`
- **streamable HTTP** — `openspace-mcp --transport streamable-http --host 127.0.0.1 --port 8081` → endpoint `http://127.0.0.1:8081/mcp`

`openspace-mcp --help` checks the executable, not host visibility. Long `execute_task`
calls need a host timeout of at least 600 seconds.

### Step 4: Route every prompt before the model runs

Hosts normally leave skill choice to the model, which reads a long skill list and may or
may not pick well; how well depends on the model. The routing hook moves that choice in
front of the model. On each user prompt the host runs `scripts/route_prompt.py`, which
ranks the installed skills with OpenSpace's `SkillRanker.bm25_only` (no LLM, no
embeddings, no network) and gives the model at most three matches as a short note: name,
`SKILL.md` path, description, and "read it and follow it if it fits". Every model then
receives the same suggestions.

```bash
python3 scripts/route-hooks.py install --dry-run   # preview per host
python3 scripts/route-hooks.py install             # or: install-openspace.sh --hooks
python3 scripts/route-hooks.py status
python3 scripts/route-hooks.py remove
```

| Host | Event | Config |
|---|---|---|
| Claude Code | `UserPromptSubmit` → `additionalContext` | `~/.claude/settings.json` |
| Codex CLI | `UserPromptSubmit` → `additionalContext` (trust it in `/hooks`) | `~/.codex/hooks.json` |
| Gemini CLI / Antigravity | `BeforeAgent` → `additionalContext` | `~/.gemini/settings.json` |
| Kimi Code | `UserPromptSubmit` → hook message | `~/.kimi-code/config.toml` |
| jeopi, omp, pi, gjc | `before_agent_start` → hidden custom message | `~/.<host>/agent/extensions/openspace-route.ts` |
| OpenCode 2 | `session.hook("prompt")` appends to the prompt (1.x: `chat.message` synthetic part) | `~/.config/opencode/plugins/openspace-route.js` |

All hooks call one wrapper, `~/.agents/hooks/openspace-route.sh`, which runs a copy of the
router with the OpenSpace venv. Without the venv, or on any router error, the hook prints
nothing and exits 0, so routing can never block a prompt. Slash commands and
`OPENSPACE_ROUTE=off` are skipped. Skill roots come from `OPENSPACE_HOST_SKILL_DIRS`
(default `~/.agents/skills`); the parsed catalog is cached in `~/.cache/openspace-route/`
and re-read only for changed `SKILL.md` files, so a prompt costs about 0.3 s.

The gate favors silence over noise. A skill is suggested only when the prompt names it
(every name term present) or when a rare prompt term appears in its name or description
and the skill covers at least half of the prompt's content terms. Intent words such as
"fix", "update", "개선", or "확인" never qualify a skill alone. Korean particles are
stripped and Latin/Hangul boundaries split ("openspace가" → "openspace"); rarity is judged
per script, because most of the catalog is English. Lexical routing cannot bridge
languages: a Korean prompt reaches an English-only skill only through a shared term such
as a product name ("react", "graphify"), and near-misses like "PPT" vs "pptx" do not match.

### Step 5: Retrieve or explain a ranking by hand

Use the same local ranker the hook uses; it never calls an LLM, an embedding API, the
registry, or the cloud:

```bash
~/.agents/venvs/openspace/bin/python scripts/route_prompt.py --explain "describe the request"
```

It prints the BM25 candidates with their gate evidence (`named`, coverage, anchors) and
the note a host would receive. Review candidates before choosing; no skill is guaranteed
to rank first. Do not use MCP `search_skills` for a privacy-sensitive lookup:
`OPENSPACE_CLOUD_MODE=local` alone does not stop embedding credential discovery or
transmission of the query and skill bodies, and registry sync may write IDs and a
database. Any search using embeddings, an LLM, a provider, registry sync, or the cloud
needs separate informed approval for the exact data and destination.

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

Cloud bootstrap is not needed for the explicit BM25-only path; other capabilities
may depend on configuration or external services and require their own approval.

### Step 9: Route out honestly when OpenSpace is not the right layer

- **Plain grep/keyword catalog lookup** (no ranking/quality/evolution needed) → `codebase-search` or `semble`
- **Long-lived synthesized markdown knowledge** (not skill selection) → `llm-wiki`
- **Per-repo agent memory / handoff notes / decision logs** (not skill selection) → `opencontext`

## Examples

### Example 1: Install OpenSpace as the skill-finder for this repo

**Input**
> Wire up OpenSpace so my coding agent can find the right skill out of our installed skills instead of me pointing it at one by hand.

**Output sketch**
- Mode: `install-as-skill-finder`
- Review `bash scripts/install-openspace.sh --dry-run` and approve its package and write effects before installation.
- Approve host registration separately; inspect the full registrar target set first.
- Verify the intended host can see the tools; report missing registration explicitly.

### Example 2: Find the right skill for a task

**Input**
> I need to scrape a JS-rendered page — which of our installed skills should I use?

**Output sketch**
- Mode: `retrieve-a-skill`
- Run `route_prompt.py --explain "scrape a JS-rendered page"` with the OpenSpace venv against the intended skill root.
- Review the ranked candidates and their gate evidence; no particular skill is guaranteed to rank first.

### Example 3: Make skill routing work on every model

**Input**
> 스킬 라우팅이 Claude 말고 GPT나 Gemini, 작은 모델에서도 똑같이 동작하게 해줘.

**Output sketch**
- Mode: `prompt-routing`
- Preview `python3 scripts/route-hooks.py install --dry-run`, get approval for the listed host configs, then install.
- Explain that the choice is made by OpenSpace's local BM25 before the model runs, so every model receives the same suggestions; Codex needs the hook trusted in `/hooks`.
- Verify with `route-hooks.py status` and one live prompt per host, comparing against `OPENSPACE_ROUTE=off`.

### Example 4: Judge whether a skill is still reliable

**Input**
> We've used the `deployment-automation` skill a dozen times. Is it actually working?

**Output sketch**
- Mode: `evaluate-skill-quality`
- Pull execution records: selected / applied / completed / fell-back counts, tool reliability signals
- Report trust status (provisional vs trusted) instead of trusting the skill's own description

### Example 5: Should NOT trigger — plain catalog search

**Input**
> Just grep the repo for which skill mentions "playwright".

**Output sketch**
- Mode: `route-out`
- This is a plain keyword lookup, not skill ranking/quality/evolution — route to `codebase-search`/`semble` instead of installing/invoking OpenSpace

## Best practices

1. Position OpenSpace as the **skill-finder layer**, not a replacement for the skills themselves — it selects and judges, agents still execute.
2. Point `OPENSPACE_HOST_SKILL_DIRS` at `$HOME/.agents/skills` for this repo so ranking and prompt routing run against the actual installed catalog.
3. Prefer **stdio** for local MCP wiring; only use SSE/streamable HTTP when the host cannot use stdio or needs a standalone/remote server.
4. Trust skills by evidence (selected/applied/completed/fell-back), not by how good their description reads.
5. Keep evolution controlled — FIX/DERIVED/CAPTURED with provisional-then-trusted promotion, never silent auto-rewrite.
6. Treat the cloud hub as discovery-only; execution and trust decisions stay local, and upload requires `trusted` status.
7. Route out honestly to `codebase-search`/`semble`, `llm-wiki`, or `opencontext` when the job is not actually skill retrieval/quality/evolution.
8. Do not report install success until `openspace-mcp --help` works and the MCP client can see OpenSpace's tools.
9. Prove routing per host with a live prompt and an `OPENSPACE_ROUTE=off` control; a hook entry in a config file is not proof that the host runs it.

## References

- [Install and MCP Wiring](references/install-and-mcp-wiring.md)
- [Skill Discovery and Routing](references/skill-discovery-routing.md)
- [Quality and Evolution](references/quality-and-evolution.md)
- [scripts/install-openspace.sh](scripts/install-openspace.sh) — installer (pinned checkout, dead-venv rebuild, router check), host-skill copy, MCP registration, and `--hooks`
- [scripts/register-openspace-mcp.sh](scripts/register-openspace-mcp.sh) — merge the `openspace` MCP entry into every installed runtime config (claude / codex / gemini / cursor / opencode / kimi / glm / zai / deepseek / grok / qwen / pi / gjc / jeopi)
- [scripts/route_prompt.py](scripts/route_prompt.py) — prompt-time router: OpenSpace BM25, gate, per-host output, `--explain`, `--check`
- [scripts/route-hooks.py](scripts/route-hooks.py) — install, remove, or inspect the routing hooks per host
- [OpenSpace GitHub Repository](https://github.com/HKUDS/OpenSpace)
