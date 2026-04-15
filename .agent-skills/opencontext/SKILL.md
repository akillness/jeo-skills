---
name: opencontext
description: >
  Project/repo memory and cross-agent handoff using OpenContext. Use when an
  agent needs durable context across sessions, searchable decisions/lessons,
  manifests or stable links for what to read next, or a load → search → store
  workflow for active delivery work. Triggers on: persistent memory, project
  context, repo memory, handoff notes, agent continuity, context manifest,
  stable links, OpenContext setup.
allowed-tools: Read Write Bash Grep Glob
compatibility: >
  Best for active project/repo memory in CLI-centric agent workflows. Pair with
  `llm-wiki` for long-lived markdown knowledge bases, `graphify` for structural
  graph memory, and human-authored vault skills when the primary job is manual
  note-taking.
metadata:
  tags: opencontext, context-management, memory, project-memory, multi-agent, handoff, stable-links, manifests
  platforms: Claude, Gemini, ChatGPT, Codex, Cursor
  version: "2.0"
  source: OpenContext Multi-Agent Workflow Guide + upstream OpenContext README
---

# OpenContext

Use this skill when the real question is **"how do we keep the next agent from starting cold?"**

The job is not to dump commands from the `oc` CLI.
The job is to:
1. choose OpenContext when project/repo memory is the right layer,
2. load the minimum useful context before work starts,
3. search prior decisions or pitfalls when uncertainty appears,
4. store conclusions and handoff notes after meaningful work,
5. route wiki-style or graph-style requests to the right neighboring skill.

Read [references/memory-layer-decision-guide.md](references/memory-layer-decision-guide.md) before choosing the memory layer.
Read [references/load-search-store-playbook.md](references/load-search-store-playbook.md) before capturing or reusing project context.
Read [references/setup-and-integration.md](references/setup-and-integration.md) when the task is installing, initializing, or wiring OpenContext into an agent workflow.

## When to use this skill
- Preserve repo/project background so future sessions do not need the same explanation again
- Store decisions, constraints, pitfalls, or acceptance notes in a searchable project-memory layer
- Hand off context between planning, coding, testing, and review agents
- Generate a manifest or stable links that tell the next agent what to read first
- Initialize or integrate OpenContext into a repo that should support cross-session agent memory
- Decide whether a request belongs in OpenContext, a wiki, a graph layer, or a human-authored note vault

## When not to use this skill
- **The user wants a long-lived markdown knowledge base or research wiki** → use `llm-wiki`
- **The user wants a codebase/corpus relationship map, `graph.json`, or `GRAPH_REPORT.md`** → use `graphify`
- **The user wants to organize a human-authored vault or note-taking workflow** → use the relevant note/vault skill
- **The main task is repo automation, scripts, hooks, or recurring commands** → use `workflow-automation`
- **The main task is repo structure or folder boundaries** → use `file-organization`

## Core idea
OpenContext is the **lightweight project-memory layer** in a broader memory stack:

- **OpenContext** = active repo/project memory, handoff notes, searchable decisions, manifests, stable links
- **llm-wiki** = long-lived synthesized markdown knowledge base
- **graphify** = structural memory and relationship tracing
- **human note/vault tools** = human-first note-taking and editorial control

Think in this lifecycle:

```text
Load context → do the work → search when unsure → store conclusions
```

## Instructions

### Step 1: Classify the memory job first
Normalize the request into this intake before choosing a tool:

```yaml
opencontext_intake:
  primary_need: session-continuity | searchable-decisions | handoff-packet | setup-integration | memory-layer-choice | unknown
  horizon: one-run | active-project | multi-project | evergreen-knowledge | unknown
  artifact_shape: short-docs | manifests | stable-links | wiki-pages | graph-artifacts | mixed
  consumers: one-agent | many-agents | human-plus-agent | mixed
  current_pain:
    - repeated-background
    - lost-decisions
    - poor-handoff
    - hard-to-find-lessons
    - missing-context-before-work
    - unknown
```

Use OpenContext when the dominant need is **active project/repo memory for agents**.
If the request is really about deep narrative synthesis, graph structure, or human note curation, route out early.

### Step 2: Orient the existing memory store before creating anything new
If OpenContext is already in use:

```bash
oc folder ls --all
oc doc ls <folder>
oc search "<topic>" --mode keyword --format json
oc context manifest <folder> --limit 10
```

Look for:
- project folders that already exist
- decision logs, pitfalls, acceptance notes, or handoff docs that can be updated
- the minimum set of files the next agent should read first

Do not create duplicate documents until you check what is already there.

### Step 3: Choose the right workflow mode
Pick one primary mode for the run:

1. **load-context mode**
   - Use before coding, planning, debugging, or reviewing when background matters.
   - Goal: identify which docs or manifests the next agent should read.

2. **search-context mode**
   - Use during work when you need to confirm prior decisions, constraints, or lessons.
   - Goal: avoid re-deciding or re-explaining something already captured.

3. **store-conclusions mode**
   - Use after meaningful work to record decisions, outcomes, verification notes, and follow-ups.
   - Goal: leave the next session with less ambiguity than you started with.

4. **setup-integration mode**
   - Use when OpenContext itself needs installation, repo initialization, slash-command setup, MCP wiring, or search configuration.
   - Goal: make the memory layer available and predictable.

Return the chosen mode explicitly before continuing.

### Step 4: Apply the load → search → store loop

#### A. Load before work
Good commands:
```bash
oc folder ls --all
oc context manifest <folder> --limit 10
oc search "<topic>" --mode keyword --format json
```

Questions to answer:
- Which folder is the project-memory home?
- Which 3-10 docs should be read first?
- Are there known pitfalls or constraints already recorded?

#### B. Search during work
Search when a task would otherwise rely on memory or guesswork.

Typical search targets:
- prior decisions
- architectural constraints
- environment quirks
- acceptance criteria
- incident or release notes

#### C. Store after meaningful work
Capture reusable outcomes, not every keystroke.

Strong document shapes:
- `decision-log.md`
- `pitfalls.md`
- `acceptance-criteria.md`
- `release-notes.md`
- `handoff-YYYY-MM-DD.md`

A useful stored note usually contains:
- what changed
- why that choice was made
- what to verify next
- source links or evidence

### Step 5: Initialize or wire OpenContext when setup is the real task
Core commands:

```bash
npm install -g @aicontextlab/cli
# or
npx @aicontextlab/cli <command>

cd your-project
oc init

oc folder ls --all
oc doc create <folder> <doc>.md -d "Description"
oc search "query" --mode keyword --format json
oc context manifest <folder> --limit 10
oc doc link <doc_path>
```

Use `oc init` when the repo should gain OpenContext-aware setup, command surfaces, or MCP integration.

### Step 6: Escalate search depth only when needed
Default to keyword search and manifests first.

Only escalate to semantic search / embeddings when:
- keyword search misses obviously relevant documents,
- the doc set is large enough that semantic retrieval materially helps,
- there is a clear reason to pay the indexing/setup cost.

Typical semantic-search setup:
```bash
oc config set EMBEDDING_API_KEY "<key>"
oc config set EMBEDDING_API_BASE "https://api.openai.com/v1"
oc config set EMBEDDING_MODEL "text-embedding-3-small"
oc index build
```

Do not treat `oc index build` as mandatory for every repo.

### Step 7: Use stable links and manifests for handoff
If another agent needs context, prefer:
- a compact manifest of what to read first, and/or
- stable links for durable references.

Examples:
```bash
oc context manifest <folder> --limit 10
oc doc link <doc_path>
```

This keeps handoffs smaller and more deterministic than dumping entire folders blindly.

### Step 8: Route out honestly
- If the request becomes **"build and maintain a compounding wiki"** → move to `llm-wiki`
- If the request becomes **"map relationships across code/docs/media"** → move to `graphify`
- If the request becomes **"organize my notes/vault"** → move to a vault/note skill

## Examples

### Example 1: Repo continuity before implementation
**Input:** "We keep losing project background between agent sessions. I need the next agent to load the right docs before touching this repo."

**Output shape:**
- select OpenContext as the project-memory layer
- identify the folder/docs to load first
- use manifest/search to gather the minimum relevant context
- leave a post-run handoff note after implementation

### Example 2: Memory-layer choice
**Input:** "Should we use OpenContext, a markdown wiki, or a graph tool for our ongoing product work?"

**Output shape:**
- distinguish project-memory vs wiki vs graph responsibilities
- recommend OpenContext for active delivery memory if that is the actual need
- route long-lived narrative synthesis to `llm-wiki`
- route structure mapping to `graphify`

### Example 3: Setup and search-depth choice
**Input:** "Set up OpenContext in this repo and tell me when embeddings are worth it."

**Output shape:**
- install/init guidance
- core commands for folders, docs, search, manifests, and links
- a conditional rule for escalating from keyword search to embeddings/index builds

## Best practices
1. Pick OpenContext because the workflow needs **active project memory**, not because it is the newest tool in the stack.
2. Prefer updating existing docs over creating duplicates.
3. Load the minimum useful context first; manifests beat giant indiscriminate reads.
4. Store decisions after meaningful work so the next session starts with better context.
5. Keep document shapes predictable (`decision-log`, `pitfalls`, `handoff`, `acceptance-criteria`, etc.).
6. Route deep knowledge-base building to `llm-wiki` instead of forcing OpenContext to do everything.
7. Route structural graph questions to `graphify` instead of flattening them into note storage.
8. Treat embeddings/index builds as an escalation, not the default first step.

## References
- [Memory Layer Decision Guide](references/memory-layer-decision-guide.md)
- [Load/Search/Store Playbook](references/load-search-store-playbook.md)
- [Setup and Integration Notes](references/setup-and-integration.md)
- [OpenContext README](https://raw.githubusercontent.com/0xranx/OpenContext/main/README.md)
- [Karpathy LLM Wiki gist](https://gist.githubusercontent.com/karpathy/442a6bf555914893e9891c11519de94f/raw)
- [Graphify README](https://raw.githubusercontent.com/safishamsi/graphify/main/README.md)
