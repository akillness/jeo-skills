---
name: agent-system-design
description: Production agent SLA discipline — MAX_LOOPS, MAX_TOKENS, MAX_COST, MAX_LATENCY, MAX_TOOL_CALLS, circuit breakers, sovereignty boundaries, degradation modes. Use before deploying any autonomous loop to production.
---

# Agent System Design

## Overview

Demos run forever; production cannot. This skill defines the **five budgets** every production agent must enforce, the circuit breakers that stop runaway loops, and the sovereignty rules that keep agents from straying outside their domain.

## When to use

- Moving an agent from prototype to production
- An agent looped, spent $200, and produced nothing useful
- You can't answer "what is this agent allowed to do?" in one sentence
- Need to set SLO/SLA with stakeholders
- Multi-agent system where one agent can call another

## The five budgets

| Budget | Default cap | When exceeded |
|--------|-------------|---------------|
| `MAX_LOOPS` | 25 iterations | Stop, hand to human |
| `MAX_TOKENS` | 200k per run | Summarize state, restart |
| `MAX_COST_USD` | $2 per run | Hard stop, page operator |
| `MAX_LATENCY_S` | 300s wall clock | Return partial, log incomplete |
| `MAX_TOOL_CALLS` | 50 per run | Stop, suspicious behavior |

Caps are **per run**, enforced by the harness, not by prompting the LLM.

## Loop termination rules

Stop when ANY of these is true:
1. Goal verified (tests pass / acceptance criteria met)
2. Budget cap hit
3. Same tool+args repeated 3× → loop detector
4. Guardrail block (see `agent-guardrails`)
5. HITL approval denied
6. Operator kill signal

## Circuit breaker pattern

```python
class AgentCircuitBreaker:
    def __init__(self, max_failures=3, window_s=60, cooldown_s=300):
        self.failures = deque()
        self.tripped_until = 0

    def call(self, fn, *args):
        now = time.time()
        if now < self.tripped_until:
            raise CircuitOpen()
        try:
            return fn(*args)
        except Exception:
            self.failures.append(now)
            self._prune(now)
            if len(self.failures) >= self.max_failures:
                self.tripped_until = now + self.cooldown_s
            raise
```

Apply per tool, per downstream service, per agent.

## Sovereignty boundaries

Every agent has a **domain card**:

```yaml
agent: billing-assistant
owns:
  - invoice CRUD
  - refund initiation (HITL required > $100)
borrows:
  - customer lookup (read-only, via customer-agent)
forbidden:
  - user account deletion
  - sending external emails
escalates_to: ops-on-call
```

Rule: an agent never silently calls outside its `owns` set. Cross-domain calls go through explicit routing (see `a2a-protocol`).

## Degradation modes

When upstream fails, degrade rather than crash:

| Failure | Degradation |
|---------|-------------|
| LLM API down | Cached answer + "stale" flag |
| Tool service down | Skip optional tools, mark partial |
| Budget hit mid-run | Summarize progress, queue resume |
| Guardrail uncertain | Default-deny + HITL |

## Retry policy

- Exponential backoff with jitter, max 3 attempts
- Idempotency keys on all state-changing tools (see `mcp-server-design`)
- Never retry guardrail blocks (they're decisions, not failures)

## Reference dataclass

```python
@dataclass
class AgentSLA:
    max_loops: int = 25
    max_tokens: int = 200_000
    max_cost_usd: float = 2.0
    max_latency_s: int = 300
    max_tool_calls: int = 50
    require_hitl_above_usd: float = 100.0
    circuit_breaker: AgentCircuitBreaker = field(default_factory=AgentCircuitBreaker)
    on_cap_hit: Literal["stop", "summarize_restart", "escalate"] = "stop"
```

## Further reading

- SRE for agents — SLO, error budget, postmortems
- Circuit breaker patterns (Hystrix, resilience4j)
- LLM cost-control playbooks (2026)
- Pair with: `agent-guardrails`, `agent-observability`
