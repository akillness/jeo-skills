# opik command and integration reference

Upstream: <https://github.com/comet-ml/opik> · Docs: <https://www.comet.com/docs/opik/>

## Server (self-hosted, Docker Compose)

| Command | Purpose |
|---------|---------|
| `git clone https://github.com/comet-ml/opik.git && cd opik` | Get the platform sources |
| `./opik.sh` | Start the full Opik suite (UI at <http://localhost:5173>) |
| `./opik.sh --infra` | Infrastructure services only (databases, caches) |
| `./opik.sh --backend` | Infrastructure + backend services |
| `./opik.sh --guardrails` | Enable guardrails with any profile |
| `./opik.sh --help` / `--info` | Troubleshooting and status |
| `powershell -ExecutionPolicy ByPass -c ".\opik.ps1"` | Windows equivalent |

Kubernetes/Helm for production scale: [Kubernetes Installation Guide](https://www.comet.com/docs/opik/self-host/kubernetes/#kubernetes-installation).
Containers run as non-root users. Check the [changelog](https://github.com/comet-ml/opik/blob/main/CHANGELOG.md) before upgrades (v1.7.0 had breaking changes).

## SDK (Python)

| Command / snippet | Purpose |
|-------------------|---------|
| `pip install opik` / `uv pip install opik` | Install the Python SDK |
| `opik configure` | Interactive config: server address (self-hosted) or API key + workspace (Comet.com) |
| `opik.configure(use_local=True)` | Configure in code for a local instance |
| `@opik.track` | Decorator-based trace logging (nest-aware, framework-agnostic) |
| `from opik.evaluation.metrics import Hallucination` | LLM-as-a-judge metric import |
| `metric.score(input=..., output=..., context=[...])` | Score one output |

TypeScript SDK and Ruby (OpenTelemetry) are also supported — see the
[client reference](https://www.comet.com/docs/opik/reference/overview).

## LLM-as-a-judge metrics (selected)

| Metric | Use |
|--------|-----|
| `Hallucination` | Output contradicts or invents beyond the given context |
| `Moderation` | Unsafe/inappropriate content detection |
| `AnswerRelevance` | RAG: answer addresses the question |
| `ContextPrecision` / `ContextRecall` | RAG: retrieved-context quality |
| Heuristic metrics + custom metrics | Deterministic checks and project-specific judges |

## Evaluation & CI

- **Datasets** + **Experiments** — versioned eval sets and comparison runs
- **PyTest integration** — run LLM evaluations as CI gates
- **Prompt Playground** — interactive prompt/model experimentation

## Production

- 40M+ traces/day ingestion scale
- Dashboard: feedback scores, trace counts, token usage over time
- **Online Evaluation Rules** — LLM-as-a-judge on live traffic
- **Opik Agent Optimizer** — dedicated SDK to improve prompts/agents
- **Opik Guardrails** — safe and responsible AI policies

## Framework integrations (selected, 50+ total)

`ADK` · `AG2` · `Agent Spec` · `AIsuite` · `Agno` · `Anthropic` · `Autogen` ·
`Bedrock` · `BeeAI (Py/TS)` · `BytePlus` · `Cloudflare Workers AI` · `Cohere` ·
`CrewAI` · `Cursor` · `DeepSeek` · `Dify` · `DSPy` · `Fireworks AI` ·
`Flowise AI` · `Gemini (Py/TS)` · `Groq` · `Guardrails AI` · `Haystack` ·
`Harbor` · `Instructor` · `LangChain (Py/JS)` · `LangGraph` · `Langflow` ·
`LiteLLM` · `LiveKit Agents` · `LlamaIndex` · `Mastra` ·
`Microsoft Agent Framework (Py/.NET)` · `Mistral AI` · `n8n` · `Novita AI` ·
`Ollama` · `OpenAI (Py/JS)` · `OpenAI Agents` · `OpenClaw` · `OpenRouter` ·
`OpenTelemetry` · `OpenWebUI` · `Pipecat` · `Predibase` · `Pydantic AI` ·
`Ragas` · `Semantic Kernel` · `Smolagents` · `Spring AI` · `Strands Agents` ·
`Together AI` · `Vercel AI SDK` · `VoltAgent` · `WatsonX` · `xAI Grok`

Full table with doc links: [Integrations overview](https://www.comet.com/docs/opik/integrations/overview/).
Unsupported framework → use `@opik.track` or open an upstream issue/PR.
