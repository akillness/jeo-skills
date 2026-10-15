# Agentic GraphRAG Blueprint: pinned upstream evidence

Observed 2026-10-15. Repository: [sebastianbrzustowicz/Agentic-GraphRAG-Blueprint](https://github.com/sebastianbrzustowicz/Agentic-GraphRAG-Blueprint/tree/e33f5f690e3b22efbf4f89d5c273a575699dd6ec), commit `e33f5f690e3b22efbf4f89d5c273a575699dd6ec`. The GitHub API marked the repository MIT and the actual root `LICENSE.txt` contains the MIT grant and conditions. This skill is independently authored operator guidance, not a redistribution of upstream code or prose.

## What the pinned project is

The README describes a reference application for question answering across document collections, combining a knowledge graph, vector retrieval and LLM synthesis. The architecture describes Azure Container Apps, Azure OpenAI, Azure AI Search, Cosmos DB, Blob Storage, Terraform, FastAPI and React. Treat this as the repo's described cloud reference, not proof that its local Compose stack provisions or verifies those cloud services. The backend's graph store is a local NetworkX `MultiDiGraph`; config also names local graph and Chroma paths. Store abstractions and described cloud infrastructure do not establish a production-ready managed graph adapter in every checkout.

The inspected `docker-compose.yml` maps backend port 8000 and frontend 5173, loads `.env`, passes `OPENAI_API_KEY`, and mounts `./data` and `./.chroma_db`. Backend config reads OpenAI key/base URL and model settings, embedding settings, graph/vector paths and `FORCE_RESET`; never set reset options or replace local data without explicit authorization and a backup/target check. Ingestion code calls OpenAI-compatible chat/embedding paths and includes retries. Document upload/indexing can transmit document-derived text to an external model provider and may incur cost. Obtain explicit user approval for provider calls, paid usage, upload, Azure/cloud resources, installation/download, or database writes/resets.

## Route and operate

Use this project operator only when the request names this repository or its concrete implementation. For a general memory-store choice, route to `agent-memory-architecture`; for ordinary code symbol lookup, use `codebase-search`. First identify the exact checkout/revision, inspect its `.env` without printing values, and distinguish local Compose from Azure Terraform deployment. No startup, cloud deployment, ingestion, provider request or write is implied by this skill.

Source map and raw-byte hashes are in [`source.json`](source.json). It includes the README, full license file, Compose definition, Python package metadata, runtime config, ingestion/search and graph store source at the pin. The complete original files are available at the commit-pinned GitHub links recorded there.
