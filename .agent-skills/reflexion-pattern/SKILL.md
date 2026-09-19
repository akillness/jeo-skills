---
name: reflexion-pattern
description: Critic node with verbal-memory of past failures, stable rubric scoring, and bounded retry budget. Use when an agent loop fails repeatedly on the same task and naive retry gives no improvement — Reflexion turns failure into actionable verbal feedback.
---

# Reflexion Pattern

## Overview

When an agent fails, retrying with the same prompt produces the same failure. Reflexion adds a **critic** that reads the failed trajectory, writes a short verbal lesson, and stores it in episodic memory. The actor reads the lesson on next attempt. Bounded by a retry budget so it can't loop forever.

## When to use

- Same task fails 2+ times with the same prompt
- You have a clear success signal (tests, golden, judge)
- Failure modes are recognizable in the trajectory (wrong tool, wrong arg, wrong plan)

## Don't use when

- One-shot tasks with no retry capacity
- Failure signal is noisy (judge LLM disagrees with itself)
- Budget too tight for 2+ attempts

## The loop

```
Actor → Trajectory → Evaluator → success? ─── yes ──→ done
                          │
                          no
                          ↓
                       Critic ──→ verbal lesson ──→ Episodic Memory
                                                          │
                                                          ↓
                                                    next Actor attempt
```

## Components

| Component | Job | Output |
|-----------|-----|--------|
| **Actor** | Execute the task | Trajectory (actions, observations) |
| **Evaluator** | Score the trajectory | `success: bool`, `score: float`, `reasons: list` |
| **Critic** | Diagnose failure, propose fix | Short verbal lesson (≤ 200 tokens) |
| **Memory** | Hold lessons across attempts | Append-only `lessons[]` |

## Stable rubric (essential)

Reflexion fails if the evaluator is unstable. Lock the rubric:

```yaml
rubric:
  - test_suite_passes: 0.4
  - acceptance_criteria_met: 0.3
  - no_forbidden_actions: 0.2
  - efficiency: 0.1
success_threshold: 0.85
```

Same rubric, same weights, every attempt. Don't tune mid-experiment.

## Critic prompt template

```
You are a critic. The actor attempted a task and failed.

Task: {task}
Acceptance: {criteria}
Trajectory: {trajectory}
Evaluator score: {score} / 1.0
Evaluator reasons: {reasons}

Write a single short lesson (≤ 200 tokens) that the actor should read before
trying again. Focus on the specific action or decision that caused failure.
Do NOT restate the task. Do NOT speculate beyond the trajectory.
```

## Retry budget

```python
@dataclass
class ReflexionBudget:
    max_attempts: int = 4
    max_cost_usd: float = 1.0
    min_score_improvement: float = 0.05  # stop if no progress
```

Stop conditions:
1. `success == True`
2. `attempts >= max_attempts`
3. `cost >= max_cost_usd`
4. `score[-1] - score[-2] < min_score_improvement` (plateau)

## Quick start (LangGraph)

```python
def actor(state):
    lessons = state["memory"]
    prompt = f"{base_prompt}\n\nLessons from past attempts:\n" + "\n".join(lessons)
    trajectory = run_actor(prompt, state["task"])
    return {"trajectory": trajectory}

def evaluator(state):
    return {"score": grade(state["trajectory"], rubric=RUBRIC)}

def critic(state):
    lesson = critic_llm.invoke(CRITIC_PROMPT.format(**state))
    return {"memory": state["memory"] + [lesson]}

graph.add_conditional_edges("evaluator", lambda s: "done" if s["score"] > 0.85 else "critic")
```

## Anti-patterns

- Critic that just says "try harder" → constrain to actionable lessons
- Unbounded lessons list → keep last N or cluster
- Mixing rubric across attempts → freeze before run
- Critic sees only final answer, not trajectory → useless

## Further reading

- Shinn et al. — original Reflexion paper (NeurIPS 2023)
- LangGraph reflection examples
- Pair with: `multi-agent-eval-harness`
