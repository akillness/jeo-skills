# Core Principles Reference

Use this reference when the main `agent-principles` entrypoint is active and
the user needs concrete detail, examples, or a reusable checklist.

## 1. Divide and conquer

AI agents perform better on small, independently checkable units than on one
large ambiguous prompt.

Typical progression:

```text
Step 1: Design or validate the model/schema
Step 2: Implement the minimum viable logic
Step 3: Connect APIs or interfaces
Step 4: Write and run tests
Step 5: Integrate and refactor
```

Checks:

- Can each step be verified independently?
- If something fails, can you isolate the failed step?
- Is the scope narrow enough for the agent to stay precise?

## 2. Keep context fresh

Context hygiene matters as much as prompt quality.

Patterns:

- Use single-purpose sessions when possible
- Start a new session when the topic changes materially
- Write a handoff file when a session gets long

Minimal handoff template:

```markdown
# HANDOFF.md

## Completed work
- Implemented user authentication API
- Implemented JWT issuance logic

## Current status
- Working on token refresh logic

## Next steps
- Implement refresh tokens
- Add logout endpoint

## Notes
- Watch for conflicts with existing session-management code
```

## 3. Choose the right abstraction level

Different work needs different depth.

| Mode | Best for |
|------|----------|
| Overview / vibe | rapid prototyping, shape of a new feature, idea validation |
| Mixed depth | feature design plus review of one critical subsystem |
| Deep dive | bugs, security review, performance work, production incidents |

Adjustment rule:

- If the agent is hand-waving, go deeper
- If the agent is stuck in details too early, zoom out

## 4. Automate repeated work

When the same explanation, command, or review ritual repeats, encode it.

Escalation path:

1. Plain repeated prompt
2. Reusable command or template
3. Skill or instruction file
4. Hook, guardrail, or scheduled workflow

Use a simple threshold: if the same thing happens three or more times, check
whether it deserves packaging.

## 5. Balance plan mode and execute mode

Use plan-first for:

- first-time complex work
- multi-file refactors
- architecture changes
- migrations
- hard-to-undo actions

Use direct execution for:

- clear, low-risk tasks
- prototypes
- repetitive but safe work
- sandboxed or easy-to-revert environments

## 6. Verify outputs and reflect

Never stop at generated code or prose.

Verification options:

- tests
- diff review
- self-check prompts
- draft PR review
- targeted manual checks

Reflection prompts:

- What failed because the task was too broad?
- What information should have been moved into a handoff or skill?
- Which repeated task is now worth automating?
