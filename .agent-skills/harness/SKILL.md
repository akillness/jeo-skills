---
name: harness
description: >
  Design domain-specific agent teams, define specialized agents, and generate the skills they use.
  Use when you need to decompose a complex project into coordinated multi-agent teams, choose
  the right architecture pattern (pipeline, fan-out/fan-in, expert pool, producer-reviewer,
  supervisor, hierarchical delegation), generate .claude/agents/ and .claude/skills/ files,
  or validate and iterate on generated harnesses. Triggers on: harness, build a harness,
  design agent team, agent team architecture, multi-agent skill generation, set up harness,
  harness engineering, domain agent team, harness for this project.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch Agent
compatibility: Requires Claude Code with CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 for agent team execution. Works with Codex CLI and Gemini CLI for skill generation only.
license: Apache-2.0
metadata:
  tags: harness, agent-team, multi-agent, skill-generation, orchestration, meta-skill, claude-code
  version: "1.0"
  source: https://github.com/revfactory/harness
---

# harness - Agent Team & Skill Architect

> **Keyword**: `harness` · `build a harness` · `design agent team` · `harness engineering`
>
> Meta-skill: harness designs the teams and skills that run your domain work.

Harness decomposes complex tasks into coordinated teams of specialized agents. It analyzes your domain, selects the right architecture pattern, generates agent definition files and skills, then validates the harness end-to-end.

**Agent Teams require**: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`

## When to use this skill

- Decompose a complex project into a coordinated multi-agent team
- Choose the right architecture: pipeline, fan-out/fan-in, expert pool, producer-reviewer, supervisor, or hierarchical delegation
- Generate `.claude/agents/{name}.md` agent definition files
- Generate `.claude/skills/{name}/SKILL.md` skill files with bundled resources
- Validate trigger conditions, dry-run teams, and compare with/without harness quality
- Build harnesses for: research, coding, content creation, code review, data pipelines, marketing

## Instructions

### Step 1: Domain Analysis

Analyze the task and project context:

1. Read the codebase or user request to identify the domain, sub-tasks, and outputs
2. Detect user expertise level (beginner → detailed scaffolding; expert → lean definitions)
3. List the distinct task types — these map to agent roles
4. Decide execution mode:
   - **Agent Team** (default): 2+ agents need to communicate or cross-validate → use `TeamCreate` + `SendMessage`
   - **Sub-agents** (lightweight): tasks are independent and results only return to orchestrator → use `Agent` tool

### Step 2: Team Architecture Design

Choose a pattern based on task structure (see [references/agent-design-patterns.md](references/agent-design-patterns.md)):

| Pattern | When to use | Example |
|---------|-------------|---------|
| Pipeline | Sequential dependent stages | Design → Code → Review → Deploy |
| Fan-out/Fan-in | Parallel independent work merged at the end | 4 researchers → synthesizer |
| Expert Pool | Dynamic routing by input type | Route to security, perf, or style expert |
| Producer-Reviewer | Generation + validation cycle | Writer + Editor loop |
| Supervisor | Central coordinator with dynamic assignment | Supervisor + migrators |
| Hierarchical Delegation | Recursive decomposition (max 2 levels) | PM → Tech Lead → Engineers |

Key rules:
- Agent teams are the **default**; choose sub-agents only when no inter-agent communication is needed
- All agents must be **file-based** (`.claude/agents/{name}.md`) — never embed roles inline in `Agent` tool prompts
- Avoid nesting teams (team members cannot themselves create teams)
- Maximum 2 levels for hierarchical delegation

### Step 3: Generate Agent Definition Files

Create `.claude/agents/{agent-name}.md` for each agent. Use this template:

```markdown
---
name: {agent-name}
description: {role and activation conditions}
model: opus
allowed-tools: {tool list}
---

# {Agent Name}

## Core Responsibilities
- {primary responsibility 1}
- {primary responsibility 2}

## Operational Principles
1. {principle 1}
2. {principle 2}

## Input Protocol
- Receives: {what inputs this agent consumes}
- Format: {expected format}

## Output Protocol
- Produces: {what outputs this agent delivers}
- Format: {output format and location}

## Error Handling
- On failure: {recovery behavior}
- Escalation: {when to notify orchestrator}

## Team Communication
- Reports to: {orchestrator or peer}
- Communicates with: {peer agents via SendMessage}
- Completion signal: {how to signal done}
```

Use `model: opus` for all agents by default unless speed is critical.

### Step 4: Generate Skill Files

For each skill the team needs, create `.claude/skills/{skill-name}/SKILL.md` following the Agent Skills spec:

1. Write a **"pushy" description** — actively invites triggering with specific conditions and synonyms
2. Explain **why** (context), not just what (commands)
3. Keep `SKILL.md` under 500 lines — move detailed docs to `references/`
4. Bundle reusable logic in `scripts/`
5. Apply progressive disclosure: metadata → body → references

For the orchestrator skill template, see [references/orchestrator-template.md](references/orchestrator-template.md).
For team architecture examples, see [references/team-examples.md](references/team-examples.md).

### Step 5: Integration & Orchestration

Define the full workflow in the orchestrator skill or agent:

> **Before running**: ensure `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is set in your environment for agent team mode.

1. Specify phase dependencies (which agents must complete before the next phase starts)
2. Define data passing: use absolute paths anchored to `_workspace/` for intermediate artifacts
3. Add error handling for agent failures, timeouts, and data conflicts
4. Preserve intermediate artifacts for post-execution verification — do not delete them

### Step 6: Validation & Testing

Run validation to verify the harness before use:

```bash
bash scripts/validate-harness.sh .claude/agents/ .claude/skills/
```

Validation checks:
- **Structure**: required sections present in agent definition files
- **Trigger conditions**: 20 eval queries (10 should-trigger + 10 should-NOT-trigger)
- **Dry run**: simulate team execution without running real tasks
- **Comparative**: quality with harness vs without (baseline) — target +50% score improvement

For testing methodology, see [references/skill-testing-guide.md](references/skill-testing-guide.md).

## Examples

### Example 1: Research Harness (Fan-out/Fan-in)

```
Prompt: "Build a harness for deep technology research"

Generated agents:
  .claude/agents/official-researcher.md    — documentation & official sources
  .claude/agents/media-researcher.md       — investment trends & news
  .claude/agents/community-researcher.md   — social response & forums
  .claude/agents/background-researcher.md  — competitive landscape
  .claude/agents/research-orchestrator.md  — synthesizes findings

Pattern: Fan-out/Fan-in (4 parallel researchers → orchestrator)
```

### Example 2: Code Review Harness (Expert Pool)

```
Prompt: "Design an agent team for thorough code review"

Generated agents:
  .claude/agents/security-reviewer.md      — OWASP, injection, secrets
  .claude/agents/performance-reviewer.md   — complexity, memory, latency
  .claude/agents/testing-reviewer.md       — coverage, assertions, mocks
  .claude/agents/review-orchestrator.md    — consolidates findings

Key feature: reviewers communicate directly (cross-domain issue detection)
```

### Example 3: Content Production Harness (Pipeline + Parallel)

```
Prompt: "Build a harness for webtoon production"

Phase 1 (parallel): worldbuilder + character-designer + plot-architect
Phase 2 (sequential): prose-stylist writes based on Phase 1
Phase 3 (parallel): science-consultant + continuity-manager review
Phase 4 (sequential): prose-stylist incorporates feedback
```

## Best practices

1. **File-based agents always** — embedding roles inline in `Agent` tool prompts prevents reuse across sessions
2. **Agent teams by default** — prefer `TeamCreate` + `SendMessage` over sub-agents for any work requiring coordination
3. **"Pushy" descriptions** — passive descriptions mean skills never activate; write active invitations
4. **Explain why, not just what** — agents follow reasoning better than rigid commands
5. **Preserve intermediate artifacts** — `_workspace/` files enable post-run verification and debugging
6. **Validate before deploy** — run trigger eval (20 queries) and dry-run before using the harness in production
7. **Max 2 hierarchy levels** — deeper nesting creates coordination overhead without quality gains

## References

- [Agent Design Patterns](references/agent-design-patterns.md)
- [Orchestrator Template](references/orchestrator-template.md)
- [Team Examples](references/team-examples.md)
- [Skill Writing Guide](references/skill-writing-guide.md)
- [Skill Testing Guide](references/skill-testing-guide.md)
- [harness GitHub](https://github.com/revfactory/harness)
- [Agent Skills Specification](https://agentskills.io/specification)
