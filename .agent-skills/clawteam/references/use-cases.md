# Use Cases & Templates

## 1. Autonomous ML Research

Run hundreds of experiments in parallel across GPU workers.

```bash
# 8 agents, each testing different hyperparameter config
clawteam template ml-research \
  --agents 8 \
  --task "Optimize transformer: target val_bpb < 0.97, modify train.py only" \
  --team ml-exp

# Monitor all 8 GPU experiments live
clawteam monitor --team ml-exp
```

**Proven result**: 2,430+ experiments, 6.4% improvement (1.044 → 0.977 val_bpb)

Each worker:
1. Receives a unique config slice to explore
2. Runs `train.py` with modifications
3. Evaluates with `val_bpb`
4. Reports improvement; leader ratchets best configs via git

## 2. Full-Stack Development

Specialized agents build different layers simultaneously.

```bash
clawteam template fullstack \
  --agents 4 \
  --task "Build e-commerce product catalog REST API with PostgreSQL" \
  --team shop

# Manual equivalent:
clawteam spawn claude "Design API contracts and OpenAPI spec"   --team shop --name architect
clawteam spawn claude "Implement FastAPI endpoints"             --team shop --name backend
clawteam spawn claude "Build React frontend components"        --team shop --name frontend
clawteam spawn claude "Write pytest integration tests"         --team shop --name qa

# Set dependency: backend starts after architect completes spec
clawteam task block --id backend-impl --blocked-by api-spec
```

## 3. Investment Analysis (AI Hedge Fund)

7 specialist analysts converge on a recommendation.

```bash
clawteam template hedge-fund \
  --ticker AAPL \
  --team aapl-2026

# Spawns 7 agents:
# growth-analyst    — revenue trends, market expansion
# technical-analyst — price patterns, momentum indicators
# fundamental-analyst — P/E, DCF, balance sheet
# sentiment-analyst  — news, social media, analyst ratings
# risk-analyst       — volatility, downside scenarios
# macro-analyst      — interest rates, sector trends
# synthesizer        — aggregates all reports → final recommendation
```

## 4. Code Review Team

Parallel specialized reviewers with synthesis.

```bash
clawteam spawn claude "Security review: OWASP Top 10, injection, auth bypass" \
  --team review --name security-reviewer
clawteam spawn claude "Performance review: N+1 queries, caching, complexity" \
  --team review --name perf-reviewer
clawteam spawn claude "Architecture review: SOLID, coupling, testability" \
  --team review --name arch-reviewer
clawteam spawn claude "Synthesize all review findings into PR comment" \
  --team review --name synthesizer

# Synthesizer blocked until all reviewers complete
clawteam task block --id synthesis --blocked-by security-review,perf-review,arch-review
```

## 5. Custom TOML Template

Define reusable team compositions:

```toml
# ~/.clawteam/templates/my-api-team.toml
[team]
name = "api-team"
description = "Standard API development team"

[[agents]]
name = "architect"
agent = "claude"
task = "Design API contracts and write OpenAPI spec"
role = "planner"

[[agents]]
name = "backend"
agent = "claude"
task = "Implement all endpoints following the spec"
blocked_by = ["architect"]

[[agents]]
name = "tester"
agent = "codex"
task = "Write comprehensive test suite"
blocked_by = ["backend"]
```

```bash
clawteam template --file ~/.clawteam/templates/my-api-team.toml \
  --var TASK="Build user authentication API"
```
