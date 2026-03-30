# OMX Agent Catalog

Source: https://github.com/Yeachan-Heo/oh-my-codex

---

## How to invoke agents

Inside Codex (after `omx --madmax --high`):
```text
/prompts:architect "analyze the authentication flow"
/prompts:executor "implement input validation in login"
/prompts:security-reviewer "audit OAuth token storage"
```

---

## Core Development Lane

| Agent | Use For |
|-------|---------|
| `architect` | System analysis, boundaries, tradeoffs, design decisions |
| `planner` | Task sequencing, execution plans, dependency ordering |
| `executor` | Code implementation, feature work, refactoring |
| `debugger` | Root-cause analysis, error resolution, stack traces |
| `verifier` | Completion evidence, test adequacy, acceptance criteria |
| `explore` | Codebase discovery, file/symbol mapping (also: `omx explore`) |

## Quality Assurance Lane

| Agent | Use For |
|-------|---------|
| `style-reviewer` | Code style, consistency, naming conventions |
| `quality-reviewer` | Logic correctness, edge cases, maintainability |
| `api-reviewer` | API contract correctness, versioning, compatibility |
| `security-reviewer` | Vulnerabilities, trust boundaries, OWASP risks |
| `performance-reviewer` | Speed, memory, algorithmic complexity |

## Domain Experts

| Agent | Use For |
|-------|---------|
| `dependency-expert` | Package management, version conflicts, upgrades |
| `test-engineer` | Test strategy, coverage, flaky test hardening |
| `build-fixer` | Build errors, type errors, toolchain failures |
| `designer` | UI/UX architecture, component design |
| `writer` | Documentation, README, API docs, comments |
| `qa-tester` | Runtime validation, interactive test execution |

## Product Strategy

| Agent | Use For |
|-------|---------|
| `product-manager` | Feature prioritization, requirements, roadmap |
| `ux-researcher` | User needs, flows, interaction patterns |
| `product-analyst` | Metrics, KPIs, data-driven decisions |
| `information-architect` | Information hierarchy, navigation, taxonomy |

---

## AGENTS.md Injection

OMX automatically injects project-level `AGENTS.md` into Codex:
```bash
-c model_instructions_file="<cwd>/AGENTS.md"
```

Control:
```bash
# Disable injection
OMX_BYPASS_DEFAULT_SYSTEM_PROMPT=0 omx

# Custom instructions file
OMX_MODEL_INSTRUCTIONS_FILE=/path/to/guide.md omx
```
