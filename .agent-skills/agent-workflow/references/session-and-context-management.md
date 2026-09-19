# Session and Context Management

Use this reference when the workflow problem is mainly about keeping the active
agent session clean, resumable, and cheap to recover.

## Session startup loop

Start each meaningful task with the smallest grounding packet:

1. confirm the active repo or workspace
2. inspect current state before proposing action
3. load only the files or context needed for the next bounded step
4. decide whether this session should stay local or become a handoff

Good startup habits:

- check usage or context pressure early when the client exposes it
- keep a short explicit task statement for the current lane
- separate unrelated tasks instead of stacking them into one long thread
- preserve only reusable conclusions, not every transient detail

## When to reset instead of continue

Reset or hand off when:

- the session contains stale assumptions from an older task
- context pressure is causing shallow or repetitive answers
- the next task has a different scope, repo area, or execution surface
- the active thread is spending more effort remembering than solving

Do not keep adding corrective prompts to a polluted session if a clean restart
would be cheaper.

## Resume and handoff patterns

Use resume when:

- the next step depends on detailed work already done in the same lane
- the session history still matches the current task
- the cost of re-grounding is higher than the cost of continuing

Use a handoff when:

- another agent or later run will own the next bounded step
- the current work produced a stable artifact, status, or queue state
- the next lane needs a narrower specialist or different runtime surface

Good handoff contents:

- current goal
- verified state
- blocker, if any
- next owner
- exact artifact or branch to continue from

## Context hygiene rules

- prefer summary plus file references over replaying long transcripts
- keep repo facts separate from temporary hypotheses
- restate the active task after a major pivot
- avoid loading every tool or MCP server "just in case"
- treat browser/runtime validation as its own explicit lane when needed

## Recovery checklist

When the session is dragging:

1. stop broad exploration
2. summarize what is verified
3. drop irrelevant branches of work
4. restart or hand off with the minimum surviving context
5. re-ground the next task from current repo or runtime state
