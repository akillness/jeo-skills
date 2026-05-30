# Agentation Watch Loop and Self-Driving Patterns

## Watch-loop pattern
Use the watch loop when new annotations should enter the agent workflow automatically instead of being pasted manually.

Typical shape:
1. Human annotates the rendered page.
2. `agentation-mcp` exposes the pending queue.
3. Agent loop reads pending annotations.
4. Agent fixes the issue.
5. Queue item is ACKed / resolved.
6. Browser is re-checked.

Before trusting the loop, run:

```bash
bash .agent-skills/agentation/scripts/verify-loop.sh
```

## Self-driving critique pattern
Use this when the browser-review system is iterative and structured feedback needs to survive across cycles.

Typical shape:
- choose the browser runtime first (`browser-harness` or `playwriter`)
- capture rendered state
- turn the issue into an `agentation` packet
- hand the packet to the coding agent
- re-run the browser check
- repeat only while the same failure class persists

## When not to use a loop
Do not default to a watch loop when:
- one human review round is enough
- the team has not verified queue visibility yet
- the actual blocker is browser setup, not annotation flow
- the task is really plan approval or pure automation verification

## Good outputs from this skill
- one precise UI feedback packet
- one verified watch-loop setup checklist
- one explicit route-out to the correct browser or review neighbor

## Common mistakes
- treating `agentation` as the browser runtime
- mixing plan review, browser runtime choice, and annotation capture in one answer
- skipping post-fix verification
- assuming self-driving critique means no human or browser evidence is needed
