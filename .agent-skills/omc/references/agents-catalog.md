# OMC Agent Catalog

Source: https://github.com/Yeachan-Heo/oh-my-claudecode

---

## Agent Tiers & Model Routing

| Tier | Model | Cost | Use When |
|------|-------|------|----------|
| LOW | Haiku | Cheapest | Quick lookups, simple exploration |
| MEDIUM | Sonnet | Balanced | Implementation, debugging, testing |
| HIGH | Opus | Most capable | Architecture, strategic analysis, review |

Smart routing saves 30–50% on token cost.

---

## Build / Analysis Lane

| Agent | Model | Core Job |
|-------|-------|---------|
| `explore` | haiku | Codebase discovery — file/symbol mapping, quick scans |
| `analyst` | opus | Requirements clarity, hidden constraints, pre-planning |
| `planner` | opus | Task sequencing, execution plans, dependency ordering |
| `architect` | opus | System design, component interfaces, tradeoff analysis |
| `debugger` | sonnet | Root-cause analysis, stack traces, error resolution |
| `executor` | sonnet | Code implementation, refactoring, feature work |
| `verifier` | sonnet | Completion evidence, test adequacy, acceptance check |
| `tracer` | sonnet | Evidence-driven causal analysis, competing hypotheses |

## Review Lane

| Agent | Model | Core Job |
|-------|-------|---------|
| `code-reviewer` | opus | Comprehensive code review — logic, SOLID, performance |
| `security-reviewer` | sonnet | Vulnerabilities, trust boundaries, OWASP Top 10 |
| `critic` | opus | Gap analysis, multi-perspective evaluation |
| `code-simplifier` | opus | Reduce complexity, improve clarity/maintainability |

## Domain Specialists

| Agent | Model | Core Job |
|-------|-------|---------|
| `test-engineer` | sonnet | Integration/e2e tests, TDD workflows, flaky test hardening |
| `designer` | sonnet | UI/UX architecture, component design |
| `writer` | haiku | Technical documentation, README, API docs, comments |
| `qa-tester` | sonnet | Runtime validation via tmux, interactive CLI testing |
| `scientist` | sonnet | Data analysis, research execution |
| `git-master` | sonnet | Atomic commits, rebasing, history management |
| `document-specialist` | sonnet | External documentation lookup, SDK references |

---

## Invocation

```bash
# Direct slash command
/oh-my-claudecode:executor
/oh-my-claudecode:code-reviewer

# Via Agent tool (in Claude Code)
Agent(subagent_type="oh-my-claudecode:executor", prompt="implement X")

# Team mode (multiple executors in parallel)
/oh-my-claudecode:team 3:executor "fix all TypeScript errors"
```

---

## Delegation Rules (from CLAUDE.md)

- Route complex code work → `executor` (use `model=opus` for hard tasks)
- Uncertain SDK usage → `document-specialist` (repo docs first)
- Multi-file changes, refactors, debugging → delegate
- Trivial ops, small clarifications, single commands → work directly
- Never self-approve: use `code-reviewer` or `verifier` for approval pass
- Keep authoring and review as separate passes
