# TruLens Sources and Provenance

## Upstream Repository
- **Repository:** [https://github.com/truera/trulens](https://github.com/truera/trulens)
- **Organization:** TruEra / Snowflake
- **Release:** `trulens-2.16.0`
- **Upstream Commit:** `32f57106c7f897a05806107737c413e65665fe46`
- **Documentation:** [https://www.trulens.org](https://www.trulens.org)
- **License:** Apache License 2.0

## Package Architecture (v2.x)
- `trulens`: Meta-package and umbrella entry point.
- `trulens-core`: Core session lifecycle, database connectors (SQLite, PostgreSQL, Snowflake), feedback schemas, and app wrappers.
- `trulens-feedback`: Base feedback function definitions and evaluation operators.
- `trulens-providers-cortex`: Snowflake Cortex LLM evaluation provider.
- `trulens-providers-openai`: OpenAI feedback provider (GPT-4o, GPT-4, etc.).
- `trulens-providers-bedrock`: Amazon Bedrock feedback provider.
- `trulens-providers-litellm`: LiteLLM feedback provider for 100+ LLMs.
- `trulens-providers-huggingface`: HuggingFace local and API evaluation models.
- `trulens-apps-langchain`: `TruChain` wrapper for LangChain chains and agents.
- `trulens-apps-llamaindex`: `TruLlama` wrapper for LlamaIndex query engines.
- `trulens-dashboard`: Streamlit-based web dashboard for experiment inspection.

## Operational Boundaries
- **Offline Preflight:** `scripts/preflight.py` is strictly offline and checks package presence and CLI paths without network calls or external binary execution.
- **Evaluation Invocation:** Live evaluation requires user authorization and configured provider API keys or local weights.
- **Database Safety:** Local SQLite databases (`default.sqlite`) should be placed in designated project directories; production setups should use managed PostgreSQL or Snowflake databases.
