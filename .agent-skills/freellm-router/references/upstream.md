# Upstream Provenance: `jaredfreellm/FREELLM_INSTALL`

- **Repository**: <https://github.com/jaredfreellm/FREELLM_INSTALL>
- **Pinned Commit**: `30471459fb792d45362bf3f2396cc83cddf333a2` (`2026-11-22`)
- **License**: `MIT`
- **Primary Interface**: `cli`

## Installation & Setup Channels

- Python/uv launch: `uv run freellm --port 8000`
- Docker deployment: `docker run -p 8000:8000 jaredfreellm/freellm`
- Client configuration: `OPENAI_BASE_URL=http://localhost:8000/v1`

## Key Architecture & Concepts

- **Unified /v1 Proxy**: Emulates the standard OpenAI API specification to connect seamlessly with any agent tool.
- **Dynamic Rate-Limit Failover**: Automatically detects HTTP 429 errors and retries requests against the next available provider.
- **Encrypted Credential Storage**: Encrypts user API keys at rest on local disk.

## Boundaries & Cross-Routing

- Designed for personal and developer experimentation across free provider tiers, not enterprise SLA routing.
- Route out: Complex multi-agent RAG graphs -> `langchain` / `agent-frameworks`.
