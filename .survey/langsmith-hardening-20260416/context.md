# Context: langsmith hardening

## Workflow Context
LangSmith shows up when teams need an LLM-specific evidence layer on top of app logs: trace trees for prompt/tool/retrieval runs, offline evals on datasets, online feedback on production traces, and prompt/version review. In practice the work is less “turn on monitoring” and more “choose the right instrumentation packet” for debugging, regression testing, review queues, or prompt rollout. The current repo skill already covers Python/TypeScript wrappers, `@traceable`, datasets, feedback, and Prompt Hub, but its body still behaves like a long feature tour instead of a bounded operator workflow.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| AI/full-stack engineer | Instrument chat/RAG/agent backends and debug failing runs | Intermediate–advanced |
| Prompt/AI engineer | Compare prompts/models and run eval loops | Intermediate |
| Product/ops owner | Review traces, human-feedback queues, and launch confidence | Intermediate |
| Data/analytics partner | Export experiment results and explain KPI shifts | Intermediate |
| Marketing/content operator | Monitor prompt regressions and subjective-quality review | Intermediate |
| Agent-orchestration builder | Correlate multi-step or multi-service agent runs | Advanced |
| Game/interactive AI team | Review generated-content / agent behavior evidence packets | Intermediate–advanced |

## Current Workarounds
1. Wrap provider clients and set env vars for partial coverage instead of instrumenting the whole runtime at once.
2. Use selective tracing contexts around suspicious blocks to limit noise and cost.
3. Export traces / runs / datasets to files or spreadsheets for downstream analysis outside the UI.
4. Attach human feedback after the fact with saved `run_id` / `trace_id` rather than using a clean review-ops workflow.
5. Keep prompt versioning, dataset curation, and production debugging split across different tools.
6. Hand-carry trace headers across services for multi-agent or multi-service runs.

## Adjacent Problems
- Teams still need generic observability, cost attribution, alerting, and deployment policy outside LangSmith.
- Human-review operations need rubric, queue, and ownership guidance rather than only SDK calls.
- Prompt/versioning workflows are often still Git- or config-based, so Prompt Hub cannot be assumed as the default home.
- Short-lived jobs and CLIs need explicit trace flushing, which is easy to miss.
- Multi-agent and cross-service workflows remain glue-heavy even when trace APIs exist.

## User Voices
> “Distributed tracing, cost tracking, and performance benchmarking for multi-agent systems are completely uncovered.”
- Local repo research note: `/Users/jang_jennie/Documents/JYJ/jeoclaws_inspect_20260320/reports/oh-my-skills-survey.md`

> “Current problem: there is no measurement standard for Council generation quality.”
- Local repo research note: `/Users/jang_jennie/Documents/JYJ/jeoclaws_inspect_20260320/reports/ssulore-survey.md`

> “Local LLM quality variance is high; keep continuous quality monitoring with LangSmith and maintain an OpenAI fallback.”
- Local repo research note: `/Users/jang_jennie/Documents/JYJ/jeoclaws_inspect_20260320/reports/ssulore-survey.md`

Sources:
- https://docs.langchain.com/langsmith
- https://github.com/langchain-ai/langsmith-sdk
- https://github.com/langchain-ai/openevals
- Repo-local references under `.agent-skills/langsmith/references/`
