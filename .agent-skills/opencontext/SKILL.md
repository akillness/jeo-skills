---
name: opencontext
description: >
  Route active project/repo memory requests into one honest packet: memory-layer
  choice, load-context, search-context, store-conclusions, setup-integration, or
  repo-packer route-out. Use when agents need searchable decisions, manifests,
  stable links, handoff notes, and small “read this first” packets across
  sessions. Route long-lived markdown knowledge bases to `llm-wiki`, structural
  graph memory to `graphify`, human-authored vault organization to note/vault
  skills, and one-shot repo packing to tools like Repomix, Gitingest, or
  Code2Prompt.
allowed-tools: Read Write Bash Grep Glob
compatibility: >
  Best for CLI-centric project/repo workflows where the main job is preserving,
  finding, or handing off active delivery context. Not for long-form wiki
  maintenance, graph construction, human-first note curation, or one-shot repo
  prompt packing.
metadata:
  tags: opencontext, context-management, memory, project-memory, multi-agent, handoff, stable-links, manifests
  platforms: Claude, Gemini, ChatGPT, Codex, Cursor
  version: "2.1"
  source: OpenContext Multi-Agent Workflow Guide + upstream OpenContext README
---

# OpenContext

Use this skill when the real question is **"what project-memory packet should the next agent load, search, or leave behind?"**

The job is not to dump the whole `oc` CLI.
The job is to:
1. classify the memory need honestly,
2. choose one primary packet,
3. load the minimum useful context,
4. search old decisions only when needed,
5. store reusable conclusions after meaningful work,
6. route wiki / graph / vault / repo-packer requests away immediately.

Read [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md) before handling an unfamiliar memory request.
Read [references/memory-layer-decision-guide.md](references/memory-layer-decision-guide.md) when the first question is which memory layer should own the job.
Read [references/load-search-store-playbook.md](references/load-search-store-playbook.md) when the task is active project-memory operation.
Read [references/trust-precedence-and-freshness.md](references/trust-precedence-and-freshness.md) when multiple memory artifacts disagree or branch freshness is unclear.
Read [references/setup-and-integration.md](references/setup-and-integration.md) when the real task is installing or wiring OpenContext.

## When to use this skill
- The next agent should not start cold and needs a compact project-memory packet first
- Repo or project decisions, pitfalls, acceptance notes, or constraints should be searchable across sessions
- A team needs a durable cross-agent handoff that points to the right docs instead of pasting giant transcripts
- The work needs manifests or stable links that say what to read now
- OpenContext itself needs setup, repo initialization, or integration guidance
- The user is choosing between OpenContext, a wiki, a graph layer, a vault, or a repo-packer workflow

## When not to use this skill
- **The main task is building a long-lived markdown knowledge base or research wiki** → use `llm-wiki`
- **The main task is mapping code/docs/media structure, generating `GRAPH_REPORT.md`, or tracing relationships** → use `graphify`
- **The main task is organizing human-authored notes or vault workflows** → use the relevant note/vault skill
- **The main task is flattening a repo into a single prompt/digest for one-shot model context** → use the repo-packer tool or skill that owns that flow
- **The main task is repo automation, scripts, hooks, or recurring commands** → use `workflow-automation`

## Instructions

### Step 1: Start from the packet already in hand
Use [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md).

Normalize the request into one of these packet shapes:
- `memory-layer-choice-packet` — the user is deciding between OpenContext, wiki, graph, vault, or repo-packer layers
- `load-context-packet` — the next agent needs the smallest truthful read-first context before work starts
- `search-context-packet` — the current task needs prior decisions, constraints, pitfalls, or acceptance notes
- `store-conclusions-packet` — meaningful work finished and reusable outcomes should be saved
- `setup-integration-packet` — OpenContext itself needs install/init/integration guidance
- `repo-packer-route-out-packet` — the request is really about one-shot repo-to-prompt packing, not ongoing project memory

Capture the minimum useful frame:

```markdown
Packet: load-context-packet
Project scope: active repo
Goal: prepare the next coding agent
Current pain: repeated background + cold starts
Artifact preference: manifest + stable links
```

Rule: start with the packet the user already has. Do not force every request through a full memory-taxonomy lecture.

### Step 2: Choose one primary mode
Pick exactly one primary mode for the run:
- `memory-layer-choice`
- `load-context`
- `search-context`
- `store-conclusions`
- `setup-integration`
- `route-out`

Optional: name one secondary mode, but do not flatten load/search/store/setup into one giant answer.

### Step 3: Decide whether OpenContext should own the job at all
Use this quick ownership test:
- **OpenContext owns it** when the dominant need is active project/repo memory for agents: small read-first packets, searchable decisions, handoff notes, manifests, stable links
- **`llm-wiki` owns it** when the dominant need is long-lived synthesized markdown knowledge
- **`graphify` owns it** when the dominant need is structure graphs, relationship tracing, or graph artifacts
- **Vault / note tools own it** when the dominant workflow is human-authored notes and editorial control
- **Repo packers own it** when the real request is “turn this repo into one prompt/digest right now”

If OpenContext is not the right owner, route out immediately instead of describing it as the universal memory layer.

### Step 4: Load before you create
If OpenContext already exists, orient first:

```bash
oc folder ls --all
oc doc ls <folder>
oc search "<topic>" --mode keyword --format json
oc context manifest <folder> --limit 10
```

Look for:
- the folder that already owns the project/topic memory
- existing decision logs, pitfalls, acceptance notes, or handoff docs
- the smallest useful set of files the next agent should read first
- the most trustworthy source if several notes overlap

Run one fast trust check before you load or search further:
- **precedence:** prefer canonical repo docs and current decision logs over stale summaries
- **provenance:** say whether a note came from a human-maintained doc, a current handoff, a previous agent summary, or an inferred heuristic
- **freshness:** check whether branch, release, migration, or incident state may have invalidated the note

Default rule: update existing memory docs before creating a parallel doc with the same purpose.

### Step 5: Run the load → search → store loop
Use [references/load-search-store-playbook.md](references/load-search-store-playbook.md).

#### A. `load-context`
Use when the next agent needs the smallest truthful startup packet.

Typical outputs:
- one manifest command or read-first packet
- one folder recommendation
- one short list of docs to read first
- one trust note naming the highest-confidence source and any stale-risk warning

Questions to answer:
- Which folder is the project-memory home?
- Which 3–10 docs should be read first?
- Which constraints or pitfalls already exist?
- Which source currently wins if docs disagree?
- Does branch or release state make any saved note risky?

#### B. `search-context`
Use when current work would otherwise rely on guesswork.

Typical search targets:
- prior decisions
- acceptance criteria
- environment quirks
- architecture constraints
- release notes or incident learnings

Default: try keyword search and manifests first. Do not jump straight to embeddings/index builds unless the corpus and failure mode justify it.

#### C. `store-conclusions`
Use after meaningful work, not after every tiny edit.

Good document shapes:
- `decision-log.md`
- `pitfalls.md`
- `acceptance-criteria.md`
- `release-notes.md`
- `handoff-YYYY-MM-DD.md`

A useful stored note usually contains:
- what changed
- why that choice was made
- what to verify next
- the smallest evidence links/citations needed later
- which source won if artifacts conflicted, plus any branch/freshness warning for the next session

### Step 6: Handle setup and integration cleanly
Use [references/setup-and-integration.md](references/setup-and-integration.md).

Core commands worth surfacing:

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

Escalate to embeddings/indexing only when keyword search and manifests are not enough and the indexing cost is justified.

### Step 7: Route out honestly
Typical route-outs:
- **`llm-wiki`** — narrative synthesis, entity/concept pages, index/log/schema discipline
- **`graphify`** — graph artifacts, structural repo/corpus mapping, relationship tracing
- **Vault/note skills** — human-first note organization and editing
- **Repo packers (Repomix / Gitingest / Code2Prompt-style workflows)** — one-shot repo-to-prompt context packing
- **`workflow-automation`** — recurring scripts, repo hooks, and automation that are not really about memory ownership

If the user says “package this repo for one model prompt,” that is not an `opencontext` job.
If they say “make sure the next agent knows what to load, what we already decided, and what to store after the task,” that is.

### Step 8: Return one concise project-memory brief
Preferred format:

```markdown
# Project Memory Brief

## Packet
- Packet:
- Primary mode:
- Project horizon:
- Why OpenContext owns this (or route-out):

## Do now
1. ...
2. ...
3. ...

## Read / search / store targets
- Folder:
- Docs to read first:
- Search terms:
- Note to update or create:

## Trust check
- Highest-confidence source:
- Provenance:
- Freshness / branch warning:

## Route-outs
- ...
```

Short, deterministic packets beat giant CLI encyclopedias.

## Output format
Always return a **project-memory brief**, **memory-layer choice memo**, or **OpenContext setup note**.

Required qualities:
- identify the packet already in hand
- choose one primary mode
- explain whether OpenContext owns the job or should route out
- keep the answer focused on the smallest truthful manifest/search/store packet
- state the highest-confidence source when overlapping notes exist
- mention freshness / branch risk when it could invalidate saved memory
- mention embeddings/index builds only as an escalation path
- name the next owner when another memory or tooling layer is a better fit

## Examples

### Example 1: Load project memory before coding
**Input**
> We keep losing repo background between agent sessions. I need the next coding agent to load the right docs before touching this repo.

**Output sketch**
- Packet: `load-context-packet`
- Primary mode: `load-context`
- OpenContext owns the job because the need is an active repo-memory startup packet
- Action: identify folder, generate manifest, list the 3–10 docs to read first, and leave a handoff note after the task

### Example 2: Memory-layer choice
**Input**
> Should we use OpenContext, a wiki, Obsidian, or a graph tool for this product work?

**Output sketch**
- Packet: `memory-layer-choice-packet`
- Primary mode: `memory-layer-choice`
- Distinguish project-memory vs wiki vs graph vs human-vault roles
- Keep OpenContext only for active project/repo memory and handoff packets

### Example 3: Search old decisions during work
**Input**
> Before we change this release flow, search whether we already recorded deployment constraints or rollback notes.

**Output sketch**
- Packet: `search-context-packet`
- Primary mode: `search-context`
- Search existing decision logs / release notes first
- Prefer keyword search + manifest before any indexing escalation

### Example 4: One-shot repo packing is the real task
**Input**
> Turn this repo into a single prompt I can paste into a model right now.

**Output sketch**
- Packet: `repo-packer-route-out-packet`
- Primary mode: `route-out`
- Route to Repomix / Gitingest / Code2Prompt-style workflow instead of pretending OpenContext is the right tool

### Example 5: Conflicting memory artifacts on a release branch
**Input**
> `README.md` says one deploy step, `CLAUDE.md` says another, and we just switched to a release branch. What should the next agent trust?

**Output sketch**
- Packet: `load-context-packet` or `search-context-packet`
- Name the highest-confidence source instead of flattening both notes together
- Explain provenance and note that branch/release state may invalidate the older instruction
- Store a compact handoff note describing which source won and what still needs verification

## Best practices
1. Pick OpenContext because the workflow needs **active project/repo memory**, not because the word “memory” appeared.
2. Prefer updating existing docs over creating duplicates.
3. Load the minimum useful context first; manifests beat giant indiscriminate reads.
4. State which source currently wins when memory artifacts overlap, and why.
5. Treat branch/release/incident state as a freshness check, not background trivia.
6. Store decisions after meaningful work so the next session starts with less ambiguity.
7. Keep document shapes predictable (`decision-log`, `pitfalls`, `handoff`, `acceptance-criteria`, `release-notes`).
8. Treat embeddings/index builds as an escalation, not the default.
9. Route wiki, graph, vault, and repo-packer requests out early instead of flattening them into one skill.

## References
- [Intake Packets and Route-outs](references/intake-packets-and-route-outs.md)
- [Memory Layer Decision Guide](references/memory-layer-decision-guide.md)
- [Load/Search/Store Playbook](references/load-search-store-playbook.md)
- [Trust, Precedence, and Freshness](references/trust-precedence-and-freshness.md)
- [Setup and Integration Notes](references/setup-and-integration.md)
- [OpenContext README](https://raw.githubusercontent.com/0xranx/OpenContext/main/README.md)
- [OpenContext usage docs](https://0xranx.github.io/OpenContext/en/usage/)
- [Karpathy LLM Wiki gist](https://gist.githubusercontent.com/karpathy/442a6bf555914893e9891c11519de94f/raw)
- [Graphify README](https://raw.githubusercontent.com/safishamsi/graphify/main/README.md)
