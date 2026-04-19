# Solution Landscape: jeo structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| LangGraph | Durable workflow graph with interrupts and human-in-the-loop | Clear pause/resume semantics, review/edit-state patterns, strong fit for phase machines | Lower-level framework, not a drop-in CLI runtime | Best external analog for `.jeo` ledger + machine state split |
| CrewAI Flows | Event-driven multi-step orchestration with state/checkpointing | Explicit state, hooks, checkpointing, HITL patterns | Less obviously cross-runtime CLI-focused | Good model for packetized orchestration lanes |
| Gemini CLI | Native runtime with Plan Mode, checkpointing, hooks, `GEMINI.md` | Strong plan-gate and lifecycle surfaces | Runtime-specific semantics | Best native comparison for planning approval lane |
| Codex CLI | Native runtime with resume, sandbox, approval policy, `AGENTS.md` | Strong approval/config/runtime handoff story | Hook parity less obvious in public operator docs | Strong example for runtime-specific route-outs |
| Claude Code | Native runtime with subagents, hooks, permissions, MCP scoping | Rich lifecycle hooks and subagent specialization | Runtime-specific implementation details | Strong example for routing Claude behavior out of `jeo` |
| Mastra Workflows | Workflow state plus suspend/resume and human approval/input | Good human approval / saved snapshot model | Different product shape from repo skills | Useful pattern for durable orchestration state |
| AutoGen | Multi-agent handoffs and human-agent participation | Strong delegation / handoff ideas | Weaker resumable-state story in blocking HITL path | Better as a routing reference than as ledger model |

## Categories
- **Native runtime control planes:** Claude Code, Codex CLI, Gemini CLI
- **Durable workflow engines:** LangGraph, CrewAI Flows, Mastra
- **Multi-agent routing / handoff frameworks:** AutoGen, Claude subagents, CrewAI / LangGraph team patterns

## What People Actually Use
Developers still mostly use simpler copilots and single-agent helpers, not fully autonomous orchestration stacks. Stack Overflow’s 2025 AI survey says 52% either do not use agents or stick to simpler tools, and only 17% report improved team collaboration from agents. Planning, deployment, and code review remain areas where practitioners still prefer explicit human oversight.

## Frequency Ranking
1. LangGraph — clearest fit for orchestration + durable execution + interrupts
2. CrewAI Flows — strong event/state/checkpointing fit
3. Gemini CLI — strongest native plan-gate and hook example
4. Codex CLI — strongest native approval/runtime routing example
5. Mastra — strong workflow state and suspend/resume pattern
6. Claude Code — rich subagent/hook surface, but less ledger-centric
7. AutoGen — best for handoffs, weaker for durable resumable workflow state

## Key Gaps
- Most real usage still favors predictable workflows with explicit handoffs, not giant autonomous mega-skills.
- Native runtimes expose different approval, resume, and hook surfaces, so a truthful cross-platform front door should normalize only the shared contract.
- Browser verification and annotation review need to stay route-outs, not core orchestration logic.
- Durable human ledger state and runtime machine state need a cleaner boundary than the current `jeo` body provides.

## Contradictions
- Marketed story: autonomous multi-agent collaboration across planning, execution, QA, and review.
- User reality: practitioners still rely on human approvals, explicit route-outs, and code-adjacent artifacts for prompts, state, and verification.
- Marketed story: one orchestration surface can cover everything uniformly.
- User reality: Claude, Codex, and Gemini expose materially different settings, rule surfaces, and lifecycle hooks.

## Key Insight
The strongest pattern across current runtimes and workflow engines is not “make the front door bigger.” It is “keep the front door thin, keep the workflow contract explicit, keep durable state resumable, and route runtime-specific behavior to the runtime that actually owns it.” For `jeo`, that means a packet-first router plus shared ledger/rule contract is more transferable than another all-in-one orchestration explainer.

## Curated Sources
- https://docs.langchain.com/oss/python/langgraph/human-in-the-loop
- https://docs.langchain.com/oss/python/langgraph/durable-execution
- https://docs.crewai.com/en/concepts/flows
- https://docs.crewai.com/en/learn/human-input-on-execution
- https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/human-in-the-loop.html
- https://microsoft.github.io/autogen/stable/user-guide/core-user-guide/design-patterns/handoffs.html
- https://docs.anthropic.com/en/docs/claude-code/sub-agents
- https://docs.anthropic.com/en/docs/claude-code/hooks
- https://github.com/google-gemini/gemini-cli
- https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/checkpointing.md
- https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/plan-mode.md
- https://developers.openai.com/codex/noninteractive
- https://developers.openai.com/codex/guides/agents-md
- https://github.com/openai/codex/blob/main/docs/config.md
- https://mastra.ai/docs/workflows/overview
- https://mastra.ai/docs/workflows/suspend-and-resume
- https://survey.stackoverflow.co/2025/ai/
- https://www.anthropic.com/engineering/building-effective-agents
- https://humanloop.com/blog/prompt-management
- https://humanloop.com/blog/prompt-files
- https://humanloop.com/blog/mcp
