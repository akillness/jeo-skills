# langchain-bmad phase map

Use this file when the user needs the exact BMAD-to-framework routing table.
The main skill should stay short and only pull in the row that matches the
current phase and framework lane.

## BMAD x LangChain routing

| BMAD phase | Question to answer now | Primary downstream skill | Add these only if needed |
|---|---|---|---|
| Analysis | Which framework should we use? | `framework-selection` | `bmad-idea` if the user is still shaping the concept |
| Planning | Which packages, model providers, and persistence defaults belong in the PRD? | `langchain-dependencies` | `bmad` for artifact path and review state |
| Solutioning: LangChain | Do we need a classic tool-calling agent, LCEL, or simple chains? | `langchain-fundamentals` | `langchain-middleware`, `langchain-rag` later |
| Solutioning: LangGraph | Do we need explicit state, routing, retries, or human approval? | `langgraph-fundamentals` | `langgraph-persistence` for checkpointers |
| Solutioning: Deep Agents | Do we need a file-aware, skill-aware agent shell? | `deep-agents-core` | `deep-agents-memory`, `deep-agents-orchestration` later |
| Implementation: LangChain | Which middleware, tool, or RAG additions are next? | `langchain-middleware` | `langchain-rag` when retrieval is required |
| Implementation: LangGraph | Which persistence and HITL controls are next? | `langgraph-persistence` | `langgraph-human-in-the-loop` |
| Implementation: Deep Agents | Which memory, filesystem, or subagent middleware is next? | `deep-agents-memory` | `deep-agents-orchestration` |

## Handoff rules

- If the user has no settled framework, stop at `framework-selection`.
- If the user is choosing the next BMAD artifact, load `bmad` first and then
  return to the matching framework skill.
- If the user only wants framework implementation detail, hand off directly to
  the narrower framework skill instead of restating BMAD.
- If the user is still ideating, route to `bmad-idea` before any framework
  choice.

## Common mistakes to avoid

- Do not suggest LangGraph just because the project is multi-step; the user may
  still fit Deep Agents or plain LangChain.
- Do not route to implementation skills before the BMAD artifact or phase is
  actually ready.
- Do not combine every LangChain ecosystem skill in one response. Pick the
  smallest next move.
