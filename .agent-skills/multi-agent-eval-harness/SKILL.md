---
name: multi-agent-eval-harness
description: Role-level metrics, coordination-failure tests, and transcript grading for multi-agent systems. Use when single-agent eval misses bugs that only appear when agents collaborate — handoff drops, role drift, blame loops, deadlocks.
---

# Multi-Agent Eval Harness

## Overview

Eval that works for a single agent does not catch *coordination* failures: dropped handoffs, role confusion, blame loops, partial state transfer. This harness adds role-level metrics, coordination-failure scenarios, and full transcript grading.

## When to use

- ≥2 agents collaborating (orchestrator + workers, peer agents, A2A)
- Bugs that only appear in production multi-agent runs
- Need to compare orchestration patterns (hierarchical vs peer vs blackboard)
- A2A protocol integration (see `a2a-protocol`)

## What to measure

| Layer | Metric | Why |
|-------|--------|-----|
| Per-role | task completion rate | Did each role do its job? |
| Per-role | tool-call validity | Did each role use tools correctly? |
| Handoff | state-transfer completeness | Did receiver get what it needs? |
| Handoff | handoff latency | Coordination overhead |
| System | end-to-end success | Did the whole thing work? |
| System | total cost / latency | Production viability |
| Failure | blame loop detection | Are agents finger-pointing? |
| Failure | deadlock detection | Waiting on each other? |

## Coordination-failure test suite

Inject these scenarios deliberately:

1. **Drop a message** — verify receiver detects, retries
2. **Stale state** — receiver gets outdated context, must refresh
3. **Conflicting instructions** — two agents send opposing orders, who wins?
4. **Silent peer failure** — peer agent times out without error
5. **Role bleed** — orchestrator tries to do worker's job
6. **Authority confusion** — worker overrides orchestrator decision
7. **Budget exhaustion mid-handoff** — graceful or stuck?

## Transcript grading

```python
RUBRIC = {
    "role_adherence": "Did each agent stay in its declared role?",
    "handoff_quality": "Did handoffs include needed context?",
    "termination": "Did the system stop cleanly when done?",
    "blame_loop": "Score 0 if any blame loop detected.",
    "user_facing_quality": "Final answer quality vs golden.",
}

def grade_transcript(transcript, golden):
    return judge_llm.score(transcript, rubric=RUBRIC, golden=golden)
```

LLM-as-judge prompt must see the full transcript with role labels, not just final output.

## Harness layout

```
multi_agent_eval/
  scenarios/
    drop_message.yaml
    stale_state.yaml
    ...
  runs/
    <ts>/
      transcript.jsonl
      scores.json
  grader.py
  reporter.py
```

## Quick start

```python
from harness import Scenario, run_scenario, grade

scenarios = Scenario.load_all("scenarios/")
results = [run_scenario(s, agents=my_system) for s in scenarios]
scores = [grade(r, rubric=RUBRIC) for r in results]
report(scores)
```

## CI gate

- Block merge if `role_adherence` < 0.9 on regression set
- Block if any new `blame_loop` detected
- Block if end-to-end success drops > 5pp vs baseline

## Further reading

- LangGraph Studio evaluation
- AutoGen / CrewAI — orchestration patterns (hierarchical, peer, blackboard)
- Pair with: `agent-evaluation`, `agent-observability`
