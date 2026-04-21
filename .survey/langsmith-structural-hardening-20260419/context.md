# Context: langsmith structural hardening

## Workflow Context
LangSmith shows up when teams need to answer one of a few recurring questions: what happened inside this LLM app, how do we gate a prompt/model change before shipping, how do humans review production traces, whether prompt registry should move into LangSmith, and how to keep trace lineage intact across jobs or agents. LangSmith's own docs split the product into observability, evaluation, prompt engineering, deployment, and platform setup, which reinforces that the operator's first job is choosing the right workflow rather than jumping straight into SDK trivia. The current repo skill already understands that, but the front door is still longer than the repo's newer packet-first pattern.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| AI app engineer | Add tracing or eval gates around chat/RAG/agent systems | Intermediate |
| Platform / infra engineer | Preserve trace IDs, metadata, and cross-service visibility | Intermediate to advanced |
| Prompt / product owner | Compare prompt versions and decide whether Prompt Hub should own prompt lifecycle | Intermediate |
| Support or QA lead | Set up feedback rubrics and annotation queues for production review | Intermediate |
| Agent operator | Understand whether a LangSmith request is really observability, eval, prompt, or deployment work | Mixed |

## Current Workarounds
1. Teams start from wrappers or decorators (`wrap_openai`, `traceable`) before deciding whether the real job is debugging traces, offline evals, review queues, prompt work, or propagation.
2. Human-review workflows still require manual rubric design, reviewer assignment, and run/trace ID preservation even when annotation queues exist.
3. Prompt-management requests often blur Git-owned prompts, public Prompt Hub browsing, and managed prompt versioning, so teams add an extra decision layer outside the docs.
4. Generic observability or deployment questions still get routed through LangSmith because the user mentioned traces, even when the real owner should be `monitoring-observability` or `deployment-automation`.

## Adjacent Problems
- Generic telemetry / alerting ownership can get incorrectly collapsed into LangSmith.
- Root-cause debugging, API contract work, and prompt governance often arrive in the same request and need route-outs.
- Multi-service agent systems need a clean split between LangSmith lineage tracking and broader system observability.
- Compact discovery surfaces regress easily if the main skill gets smaller but README/setup summaries stay flat.

## User Voices
- "Public prompt hub. LangSmith's public prompt hub is a collection of prompts that have been created by the LangChain community that you can use for reference." — LangChain docs via Yahoo Japan indexed snippet, `Manage prompts - Docs by LangChain` (`https://docs.langchain.com/langsmith/manage-prompts`) [browser-rendered indexed snippet, high confidence]
- "It would be GREAT if we can organize our prompts in the langsmith hub. Our project uses alot of templates, and multiple templates for one chain." — GitHub discussion snippet surfaced by Yahoo Japan for `langsmith-sdk` discussions (`https://github.com/langchain-ai/langsmith-sdk/discussions/943`) [Yahoo Japan indexed snippet, medium confidence]
- "Annotation queues help organize human review workflows. Queue runs for review, assign them to reviewers, and track annotation progress." — LangChain reference snippet surfaced by Yahoo Japan (`https://reference.langchain.com/java/langsmith/annotation-queues`) [browser-rendered indexed snippet, high confidence]
- "The process involves routing model outputs into these queues, where reviewers evaluate the work, and their feedback ultimately feeds back into ..." — community tutorial snippet from Yahoo Japan (`https://community.latenode.com/t/how-to-use-langsmith-annotation-queues-for-beginners/37643`) [Yahoo Japan indexed snippet, medium confidence]

## Sources
- `graphify-out/GRAPH_REPORT.md`
- `https://docs.langchain.com/langsmith/home` (browser-rendered primary page evidence)
- `https://docs.langchain.com/langsmith/evaluation` (browser-rendered primary page evidence)
- `https://docs.langchain.com/langsmith/annotation-queues` (browser-rendered primary page evidence)
- `https://docs.langchain.com/langsmith/prompt-engineering` (browser-rendered primary page evidence)
- `https://search.yahoo.co.jp/search?p=LangSmith+annotation+queue+review+workflow` (Yahoo Japan indexed snippets)
- `https://search.yahoo.co.jp/search?p=LangSmith+prompt+hub+Git+compare` (Yahoo Japan indexed snippets)
