---
name: freellm-router
description: >
  Deploy and operate jaredfreellm/FREELLM_INSTALL, a self-hosted OpenAI-compatible gateway combining multiple free-tier LLM providers into a resilient /v1 endpoint with automated health checks, intelligent rate-limit failover, and per-key quota tracking. Use when aggregating free model tiers across Gemini, Groq, Cerebras, Mistral, and HuggingFace, routing agent prompts with automatic fallback, managing encrypted API keys at rest, or configuring local proxy ports. Do not use for enterprise multi-cloud cost billing or Kubernetes LLM clusters (route to cloud-data). Triggers on: freellm, freellm-router, free llm tier gateway, openai-compatible router, rate limit failover, jaredfreellm.
allowed-tools: Read Glob Grep Bash
compatibility: Python 3.10+, uv or docker, local network port. Preflight runs offline in Python 3.10+.
license: MIT
metadata:
  version: "1.0.0"
  source: https://github.com/jaredfreellm/FREELLM_INSTALL
  upstream_commit: 30471459fb792d45362bf3f2396cc83cddf333a2
  pinned_at: "2026-11-22"
---
# FreeLLM Router (`jaredfreellm/FREELLM_INSTALL`)

Source-pinned operator guide for `jaredfreellm/FREELLM_INSTALL` (MIT), providing verified instructions and offline preflight validation.

## When to use this skill

- Self-host a single OpenAI-compatible /v1 endpoint aggregating free-tier LLM providers with automatic failover and quota tracking.
- For complete trigger patterns: freellm, llm-router, gateway, failover, quota-management, openai-proxy.
- Cross-routing boundaries: route out to `orchestration`, `agent-frameworks`, `cc-switch` where appropriate.

## Instructions

1. **Run offline preflight first** to confirm tool availability and pinned file integrity:
   ```bash
   python3 scripts/preflight.py --json
   ```

2. **Verify installation channels & environment prerequisites**:
   - Python/uv launch: `uv run freellm --port 8000`
   - Docker deployment: `docker run -p 8000:8000 jaredfreellm/freellm`
   - Client configuration: `OPENAI_BASE_URL=http://localhost:8000/v1`

3. **Execute verified workflows & operations**:
   - **Unified /v1 Proxy**: Emulates the standard OpenAI API specification to connect seamlessly with any agent tool.
   - **Dynamic Rate-Limit Failover**: Automatically detects HTTP 429 errors and retries requests against the next available provider.
   - **Encrypted Credential Storage**: Encrypts user API keys at rest on local disk.

4. **Gate sensitive mutating operations & respect boundaries**:
   - Designed for personal and developer experimentation across free provider tiers, not enterprise SLA routing.
   - Route out: Complex multi-agent RAG graphs -> `langchain` / `agent-frameworks`.

## References

- Pinned upstream summary and concepts: [references/upstream.md](references/upstream.md)
- Pinned source provenance and file digests: [references/source.json](references/source.json)
- Offline manifest preflight helper: [scripts/preflight.py](scripts/preflight.py)
- Eval suite: [evals/evals.json](evals/evals.json)
