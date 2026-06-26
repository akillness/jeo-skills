---
name: agentic-skills
description: "Use this skill when >"
license: MIT
compatibility: ">"
allowed-tools: Bash Read Write Edit Glob Grep WebFetch Agent
metadata:
  tags: agentic-skills, production-engineering, spec-driven, tdd, code-review, security, performance, git-workflow, ci-cd, google-practices
  version: 1.0
  source: "https://github.com/addyosmani/agent-skills"
  plugin: addyosmani/agent-skills
---












# agentic-skills — Production Engineering Framework for AI Agents

> **Keyword**: `agentic-skills` · `/spec` · `/plan` · `/build` · `/test` · `/review` · `/code-simplify` · `/ship`
>
> "Seems right is never sufficient." — ground every output in measurable verification.

`agentic-skills` is a production-grade engineering framework that encodes the workflows, quality gates, and best practices senior engineers use when building software. It draws from Google's engineering culture (*Software Engineering at Google*): trunk-based development, Shift Left testing, Hyrum's Law, Chesterton's Fence, and the code-as-liability mindset.

**Plugin install (Claude Code):**
```bash
/plugin marketplace add addyosmani/agent-skills
/plugin install agent-skills@addy-agent-skills
```

## When to use this skill

- The request needs a disciplined spec-before-code contract to prevent drift
- You need incremental implementation with thin vertical slices and frequent verification
- The task requires test-driven development (Red → Green → Refactor) before shipping
- Security hardening or OWASP Top 10 prevention is in scope
- The user wants source-driven development grounded in official docs
- Performance optimization with Core Web Vitals targets is needed
- A production git workflow (trunk-based, atomic commits, CI/CD quality gates) is required
- Code review against five quality axes before merging
- Shipping checklist and staged rollouts before a production launch

## Do not use this skill when

- The user needs multi-agent orchestration routing → route to `jeo`, `omc`, or `harness`
- The task is primarily pre-implementation landscape research → route to `survey`
- The user needs a one-shot quick fix with no quality gate → use direct execution
- The user wants agent team design → route to `harness`

## Installation

### Claude Code (recommended)
```bash
/plugin marketplace add addyosmani/agent-skills
/plugin install agent-skills@addy-agent-skills
# Or via HTTPS:
/plugin marketplace add https://github.com/addyosmani/agent-skills.git
```

### Gemini CLI
```bash
gemini skills install https://github.com/addyosmani/agent-skills.git --path skills
```

### Cursor / Windsurf
Copy the contents of each `skills/*.md` file into `.cursor/rules/` or the editor's rules configuration.

### OpenCode
Uses agent-driven execution via `AGENTS.md` in the repo root.

### Local clone
```bash
git clone https://github.com/addyosmani/agent-skills.git
# Reference skill files from the local path
```

## Development Lifecycle Phases

Choose the phase that matches the current work. Each phase maps to one or more slash commands.

### Phase 1 — Define `/spec`

**Skills**: `idea-refine`, `spec-driven-development`

Start here when the request is ambiguous or underspecified.

- `idea-refine`: Convert rough concepts into concrete, actionable proposals
- `spec-driven-development`: Create a full PRD (requirements, constraints, acceptance criteria) before any code is written

```text
/spec "build a user authentication flow"
```

Anti-rationalization: never skip spec because "the idea is obvious" — misaligned intent causes the most expensive rework.

### Phase 2 — Plan `/plan`

**Skill**: `planning-and-task-breakdown`

Decompose the spec into small, independently verifiable work units.

- Break stories into tasks that can be completed and tested in isolation
- Estimate blast radius before starting
- Identify dependencies and sequence them explicitly

```text
/plan  # after /spec is frozen
```

### Phase 3 — Build `/build`

**Skills**: `incremental-implementation`, `test-driven-development`, `context-engineering`, `source-driven-development`, `frontend-ui-engineering`, `api-and-interface-design`

Implement against the spec, not improvised chat context.

- **incremental-implementation**: Thin vertical slices; each slice must pass tests before the next begins
- **test-driven-development**: Red → Green → Refactor; never write implementation before a failing test
- **context-engineering**: Deliver the right information to the LLM at the right time
- **source-driven-development**: Ground every SDK/API/framework decision in official documentation
- **frontend-ui-engineering**: Component architecture, design tokens, accessibility, and performance budgets
- **api-and-interface-design**: Contract-first API design with validation before implementation

```text
/build  # slice-by-slice against the frozen spec
```

### Phase 4 — Verify `/test`

**Skills**: `browser-testing-with-devtools`, `debugging-and-error-recovery`

Verify before claiming success.

- **browser-testing-with-devtools**: Runtime inspection, network tracing, performance profiling, accessibility audits
- **debugging-and-error-recovery**: Five-step triage (observe → reproduce → hypothesize → test → fix)

```text
/test  # mechanical + semantic + browser verification
```

Drift thresholds:
- `0.00–0.15` — excellent, proceed
- `0.15–0.30` — watch closely
- `0.30+` — stop and correct before continuing

### Phase 5 — Review `/review` and `/code-simplify`

**Skills**: `code-review-and-quality`, `code-simplification`, `security-and-hardening`, `performance-optimization`

Review along five axes before merging.

- **code-review-and-quality**: Correctness, readability, maintainability, performance, security
- **code-simplification**: Preserve behavior while reducing cognitive load
- **security-and-hardening**: OWASP Top 10 prevention, secrets scanning, input validation
- **performance-optimization**: Measure first; Core Web Vitals targets before optimizing

```text
/review        # five-axis quality gates
/code-simplify # behavior-preserving clarity pass
```

Change sizing standards:
- Small: < 200 lines, single concern
- Medium: 200–500 lines, related concerns
- Large: > 500 lines → split or justify in PR description

### Phase 6 — Ship `/ship`

**Skills**: `git-workflow-and-versioning`, `ci-cd-and-automation`, `deprecation-and-migration`, `documentation-and-adrs`, `shipping-and-launch`

Ship with discipline.

- **git-workflow-and-versioning**: Trunk-based development, atomic commits, semantic versioning
- **ci-cd-and-automation**: Quality gate pipelines, test automation, deployment safety
- **deprecation-and-migration**: Systematic legacy code removal with migration guides
- **documentation-and-adrs**: Architecture Decision Records for non-obvious choices
- **shipping-and-launch**: Pre-launch checklist, staged rollout (1% → 10% → 50% → 100%), rollback plan

```text
/ship  # pre-launch checklist + staged rollout
```

## Specialist Personas

Three specialist personas for review work:

| Persona | Focus |
|---------|-------|
| `code-reviewer` | Correctness, architecture, readability, test coverage |
| `test-engineer` | Test strategy, edge cases, coverage gaps |
| `security-auditor` | OWASP Top 10, secrets, auth flows, input validation |

## Reference Checklists

| Checklist | Purpose |
|-----------|---------|
| `testing-patterns` | Test types, isolation, coverage targets |
| `security-checklist` | OWASP alignment, auth, secrets, headers |
| `performance-checklist` | CWV targets, bundle budget, render paths |
| `accessibility-checklist` | WCAG 2.1 AA, keyboard, ARIA, focus |

## Philosophical Foundations

| Principle | Application |
|-----------|-------------|
| **Code as Liability** | Every line is a maintenance burden; justify its existence |
| **Hyrum's Law** | Every observable behavior will be depended on — be explicit about contracts |
| **Chesterton's Fence** | Understand why something exists before removing it |
| **The Beyonce Rule** | "If you liked it, you should have put a test on it" |
| **Shift Left** | Catch problems early (spec) rather than late (prod) |
| **Trunk-Based Development** | Short-lived branches, frequent integration, feature flags for risky work |

## Quick Command Reference

| Command | Phase | Purpose |
|---------|-------|---------|
| `/spec` | Define | Write spec / PRD before coding |
| `/plan` | Plan | Break spec into verifiable tasks |
| `/build` | Build | Incremental implementation against spec |
| `/test` | Verify | Browser + runtime + acceptance verification |
| `/review` | Review | Five-axis quality gate |
| `/code-simplify` | Review | Behavior-preserving clarity pass |
| `/ship` | Ship | Pre-launch checklist + staged rollout |

## Operating Rules

1. **Spec before code** — never start implementation without a frozen spec
2. **Tests before implementation** — TDD; a failing test must exist before any feature code
3. **Source before assumption** — check official docs before using any SDK/API
4. **Measure before optimizing** — performance work requires a baseline measurement artifact
5. **Verify before done** — "seems right" is not sufficient; all outputs need measurable proof
6. **Ship incrementally** — staged rollouts with rollback plans; never full-fleet deploys for risky changes

Source: [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) — MIT License

## Instructions
1. Identify the task trigger and expected output.
2. Follow the workflow steps in this skill from top to bottom.
3. Validate outputs before moving to the next step.
4. Capture blockers and fallback path if any step fails.

## Examples
- Example: Apply this skill to a small scope first, then scale to full scope after validation passes.

## Best practices
- Keep outputs deterministic and auditable.
- Prefer small reversible changes over broad risky edits.
- Record assumptions explicitly.

## References
- Project standards: `.agent-skills/skill-standardization/SKILL.md`
- Validator script: `.agent-skills/skill-standardization/scripts/validate_skill.sh`
