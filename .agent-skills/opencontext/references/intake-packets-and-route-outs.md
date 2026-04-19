# Intake Packets and Route-outs

Start from the project-memory packet already in hand. Do not turn every request into a giant memory taxonomy or CLI command dump.

## `memory-layer-choice-packet`
Use when the user is deciding whether the job belongs in OpenContext, a wiki, a graph layer, a vault, or a repo-packer workflow.

Capture:
- the dominant need: active project memory, narrative knowledge base, structure graph, human-authored notes, or one-shot repo packing
- project horizon: current project, multi-project, or evergreen knowledge
- who consumes the artifact: one agent, many agents, or humans first

Good outcome:
- one explicit owner (`opencontext`, `llm-wiki`, `graphify`, a vault skill, or a repo packer)
- one sentence explaining why the neighboring lanes do not own this request

Route out when:
- the real job is long-form wiki maintenance → `llm-wiki`
- the real job is graph structure mapping → `graphify`
- the real job is human note/vault organization → vault skill
- the real job is one-shot repo prompt packing → Repomix / Gitingest / Code2Prompt-style workflow

## `load-context-packet`
Use when the next agent should not start cold and needs the smallest truthful read-first packet.

Capture:
- current project or folder scope
- what the next agent is about to do
- the strongest current pain: repeated background, missing constraints, unclear read order
- preferred artifact: manifest, stable links, short read-first list, or mixed

Good outcome:
- one folder to start from
- one manifest command or equivalent read-first packet
- one list of 3–10 docs to read first

Route out when:
- the task is actually flattening a repo into one prompt → repo packer
- the task is really repo structure design, not memory loading → `file-organization`

## `search-context-packet`
Use when the current task needs prior decisions, constraints, acceptance notes, incidents, or pitfalls.

Capture:
- the exact topic or decision you need to recover
- whether the target is likely a decision log, pitfall note, acceptance criteria, release note, or handoff
- whether keyword search has already been tried

Good outcome:
- one targeted search query or small query set
- one likely folder/document family
- one recommendation about whether manifests are enough or indexing should remain out of scope

Route out when:
- the user is really asking for broad wiki synthesis → `llm-wiki`
- the user needs structure/relationship tracing instead of note retrieval → `graphify`

## `store-conclusions-packet`
Use when meaningful work finished and reusable outcomes should survive the next session.

Capture:
- what changed
- why the decision was made
- what still needs verification
- the smallest evidence links or citations to keep

Good outcome:
- one updated existing doc, or one new doc with a predictable shape
- explicit avoidance of transcript dumps when a compact note is enough

Route out when:
- the output should become a durable wiki page rather than active project memory → `llm-wiki`
- the result is primarily a human note or editorial artifact → vault skill

## `setup-integration-packet`
Use when OpenContext itself needs install, repo initialization, manifests, stable-link usage, or search/index setup.

Capture:
- current environment
- whether OpenContext is installed already
- whether the user needs CLI-only setup, repo init, or integration guidance
- whether keyword search is enough or semantic search/indexing is being considered

Good outcome:
- one bounded install/init sequence
- one list of core commands worth remembering
- one explicit rule for when *not* to build an index yet

Route out when:
- the main task is runtime automation or hooks instead of memory setup → `workflow-automation`

## `repo-packer-route-out-packet`
Use when the request is really “package this repo for a model right now” rather than ongoing memory.

Signals:
- one prompt/digest for a single chat/model
- snapshot packaging of a repo
- no need for persistent decisions, handoff notes, or later search

Good outcome:
- route to Repomix / Gitingest / Code2Prompt-style tooling
- explain briefly that this is a snapshot context-loading problem, not a project-memory problem

## Quick route-out table
| If the real question is... | Route to |
|---|---|
| Which memory layer owns this job? | `opencontext` first, then choose |
| Build a long-lived markdown knowledge base | `llm-wiki` |
| Map relationships across code/docs/media | `graphify` |
| Organize human-authored notes or a vault | note/vault skill |
| Turn the repo into one prompt right now | Repomix / Gitingest / Code2Prompt-style workflow |
| Automate recurring scripts/hooks around the repo | `workflow-automation` |

## Rule of thumb
A good packet is the smallest artifact set that lets the next agent load, search, or store project context honestly. If the packet cannot answer that need, route to the neighboring layer instead of pretending OpenContext covers everything.
