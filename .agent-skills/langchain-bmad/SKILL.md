---
name: langchain-bmad
description: >
  Use when the user needs BMAD-style phased delivery for a LangChain,
  LangGraph, or Deep Agents project and wants the right framework skill at the
  right BMAD phase. Triggers on: langchain bmad, bmad langchain, langgraph
  bmad, deep agents bmad, structured agent development, phase-gated langchain
  workflow, framework-aware bmad, and BMAD for agent frameworks.
allowed-tools: Read Write Bash Grep Glob
metadata:
  tags: langchain, langgraph, deep-agents, bmad, workflow, structured-development, framework-selection
  platforms: Claude, Gemini, Codex, OpenCode
  keyword: langchain-bmad
  version: 1.1.0
  source: akillness/oh-my-gods
---

# langchain-bmad

Use `langchain-bmad` when the job is combining BMAD phase discipline with the
LangChain ecosystem, not when the user only needs a single framework skill in
isolation. Keep the entrypoint focused on routing: choose the BMAD phase,
choose the framework lane, then load the narrowest downstream skill or support
file that fits.

## When to use this skill

- Start a new agent project and choose between LangChain, LangGraph, and Deep
  Agents inside a BMAD workflow
- Route a BMAD artifact or phase gate for a LangChain ecosystem project
- Decide which framework-specific skill should be loaded next after a BMAD
  planning or architecture step
- Install the BMAD and LangChain skill sets together for one project
- Keep framework choice, persistence, and HITL decisions aligned with BMAD
  phase boundaries

Use a narrower skill instead when:

- the user already knows the exact framework problem and does not need BMAD
  phase routing: use `langgraph-workflow`, `deepagents`, or the specific
  LangChain skill directly
- the user mainly needs BMAD phase routing without framework-specific guidance:
  use `bmad`
- the user is still shaping the idea before structured delivery: use
  `bmad-idea`

## Instructions

### Step 1: Classify both dimensions before naming commands

Identify:

- BMAD lane: bootstrap, phase-status, artifact-routing, phase-gate, or
  implementation handoff
- Framework lane: LangChain, LangGraph, Deep Agents, or framework-selection

Do not dump every BMAD phase and every LangChain skill in one response before
these two lanes are clear.

### Step 2: Choose the BMAD phase and the next framework decision together

Use `references/phase-map.md` to map the current BMAD phase to the narrowest
next skill:

- Analysis: `framework-selection`
- Planning: `langchain-dependencies`
- Solutioning:
  - LangChain -> `langchain-fundamentals`
  - LangGraph -> `langgraph-fundamentals` plus `langgraph-persistence`
  - Deep Agents -> `deep-agents-core`
- Implementation:
  - LangChain -> `langchain-middleware`, optional `langchain-rag`
  - LangGraph -> `langgraph-human-in-the-loop`, `langgraph-persistence`
  - Deep Agents -> `deep-agents-memory`, `deep-agents-orchestration`

If the user has not chosen a framework yet, stop at `framework-selection`
instead of pretending all three lanes should run.

### Step 3: Load only the support file that matches the current gap

Use progressive disclosure:

- `references/phase-map.md` for the BMAD-phase to framework-skill routing table
- `references/setup-and-handoff.md` for install commands, package bundles, and
  handoff rules between BMAD and framework skills

Keep the main skill compact instead of leaving the entire phase map, setup
guide, and implementation catalog inline.

### Step 4: Preserve BMAD gates while delegating framework detail

Use `bmad` to keep artifact progression and review gates honest:

- use BMAD to decide which artifact is next
- use the framework skill to shape the technical content of that artifact
- use `plannotator` or the existing BMAD review gate before advancing major
  phase documents

Do not let framework implementation detail bypass the BMAD artifact gate.

### Step 5: Verify that the route is specific and minimal

Before claiming success, prove that:

- the chosen BMAD phase matches the user's immediate job
- the chosen framework lane is explicit
- the response names the next skill or command, not the whole catalog
- the answer makes clear when to return to `bmad` versus stay inside a
  framework-specific skill

## Examples

### Example 1: Choose a framework before architecture

Input:

```text
We want to use BMAD for an AI support agent, but we still need to decide between LangGraph and Deep Agents.
```

Expected shape:

- treats this as BMAD analysis or planning plus framework selection
- routes first to `framework-selection`
- avoids listing implementation-only skills before the framework decision is
  made

### Example 2: Route a LangGraph architecture phase

Input:

```text
Our PRD is approved. We need the next BMAD step for a LangGraph workflow with durable execution.
```

Expected shape:

- recognizes this as BMAD solutioning after a reviewed PRD
- routes to architecture work plus `langgraph-fundamentals` and
  `langgraph-persistence`
- keeps BMAD phase gating explicit

### Example 3: Keep ideation out of the framework bridge

Input:

```text
Brainstorm three agent product ideas before we choose any framework.
```

Expected shape:

- routes to `bmad-idea`
- avoids forcing a LangChain ecosystem decision too early
- returns to `langchain-bmad` only after the idea is ready for structured
  delivery

### Example 4: Hand off implementation to the right framework skill

Input:

```text
The architecture is done. We need HITL approval and persistence in our LangGraph app.
```

Expected shape:

- treats this as implementation handoff, not fresh BMAD setup
- routes to `langgraph-human-in-the-loop` and `langgraph-persistence`
- keeps `bmad` as the artifact-tracking layer rather than repeating all BMAD
  phase detail

## Best practices

1. Decide the BMAD lane and framework lane before suggesting commands.
2. Stop at `framework-selection` when the stack choice is still open.
3. Keep BMAD responsible for artifact progression and review gates.
4. Push phase maps and install detail into references instead of bloating the
   entrypoint.
5. Prefer one narrow framework skill over a full LangChain catalog dump.
6. Add evals before considering a mutation loop for this bridge skill.
7. Return to `bmad` when the question becomes artifact progression rather than
   framework implementation.

## References

- `references/phase-map.md`
- `references/setup-and-handoff.md`
- [LangChain Skills launch](https://www.langchain.com/blog/langchain-skills)
- [Deep Agents skills docs](https://docs.langchain.com/oss/javascript/deepagents/skills)
- [BMAD Method docs](https://docs.bmad-method.org/)
- [Creative Intelligence docs](https://docs.bmad-method.org/explanation/creative-intelligence/)
