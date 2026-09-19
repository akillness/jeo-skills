# MCP and Multi-Agent Patterns

Use this reference when the workflow problem is mainly about choosing between
shell, MCP, browser, or multiple agents and keeping the coordination legible.

## MCP decision rule

Reach for MCP when the task needs:

- structured access to an external system
- a client-specific integration surface
- richer interaction than plain shell or file tools provide
- repeated use of the same external capability in one bounded lane

Stay direct when shell or local file inspection can already finish the task.

Do not turn MCP into the default answer for simple repo-local work.

## Tool-surface selection

Use the lightest surface that preserves quality:

- direct repo tools for local file and shell work
- MCP for connected services or specialized integrations
- browser automation for rendered or interactive behavior
- live browser reuse with `playwriter` when session continuity matters

When the user only asks for one narrow outcome, do not prescribe a heavy
multi-surface workflow around it.

## Multi-agent split rules

Split work across agents only when:

- independent lanes can run in parallel
- ownership can be kept clear
- the synthesis cost is lower than the time saved

Avoid splitting when:

- the next action depends on unresolved work on the critical path
- every lane would edit the same files
- the coordination overhead exceeds the actual task size

Good multi-agent ownership packets include:

- exact goal
- scope boundary
- expected artifact
- reporting checkpoint
- final synthesis owner

## Practical patterns

### Research -> implement -> verify

Use when the request mixes external discovery, code changes, and validation.

- researcher or web-capable lane gathers the non-local facts
- implementation lane applies the bounded change
- verification lane proves the claim with tests or runtime checks
- lead lane synthesizes outcome and next action

### Worktree-based parallel delivery

Use when two independent implementation or review lanes must run at once.

- one branch or worktree per lane
- no overlapping write ownership
- merge or close each lane independently

### Runtime-verification lane

Use when code is changed locally but the real proof lives in the app.

- implementation lane changes code
- verification lane checks runtime behavior
- use `playwriter` when existing browser state matters

## Coordination anti-patterns

- parallelizing before the task is decomposed
- assigning multiple agents to the same write set
- opening too many MCP or browser surfaces for one small job
- skipping the synthesis step after parallel work finishes
